import { DEMO_CLINIC_ID } from "@pedia/seed";
import { ClinicalNote, Invoice, Payment, PlanItem, depositBalance, invoiceBalance, pesos } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, clinicalApp } from "./clinical-support";

/** B8's races: parallel money writes never overpay, overdraw, double-record, or skip or repeat a receipt number. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
let desk = "";
beforeAll(async () => {
  t = await clinicalApp();
  [admin, desk] = [await t.as(ADMIN), await t.as(FRONT_DESK)];
}, 60_000);
afterAll(() => t.app.close());

const post = (path: string, cookie: string, body: unknown, key: string | null = crypto.randomUUID()) => {
  const req = request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie);
  return (key === null ? req : req.set("Idempotency-Key", key)).send(body as object);
};
const statuses = (rs: request.Response[]) => rs.map((r) => r.status).sort();
const noServerErrors = (rs: request.Response[]) => expect(rs.filter((r) => r.status >= 500).map((r) => r.text)).toEqual([]);
const paymentsOf = async (id: string) => t.ok(t.call("get", `/patients/${id}/payments`, admin), z.array(Payment));
const cash = (amount: number, extra: object = {}) => ({ amount, method: "cash", receivedBy: "staff_cruz", ...extra });

/** A new child with one ₱`php` bill for a done fluoride (the fee is set on the plan item). */
async function billOf(php: number) {
  const id = await t.register();
  await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode: "fluoride", fee: pesos(php) }), PlanItem, 201);
  const visit = await t.start(id, admin);
  const note = await t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }), ClinicalNote, 201);
  await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
  const [item] = await t.ok(t.call("get", `/patients/${id}/plan`, admin), z.array(PlanItem));
  const invoice = await t.ok(post(`/patients/${id}/invoices`, admin, { planItemIds: [item!.id] }), Invoice, 201);
  return { id, invoice, itemId: item!.id };
}
const arCounter = () => inClinic(DEMO_CLINIC_ID, () => t.prisma.receiptCounter.findFirst({ where: { series: "AR" }, select: { last: true } })).then((r) => r!.last);

describe("billing under parallel requests (B8 E1–E3)", () => {
  it.each([0, 1, 2, 3, 4])("never overpays a bill (round %i)", async () => {
    const { id, invoice } = await billOf(1000);
    const rs = await Promise.all(Array.from({ length: 10 }, () => post(`/invoices/${invoice.id}/payments`, desk, cash(pesos(400)))));
    noServerErrors(rs);
    expect(statuses(rs)).toEqual([201, 201, ...Array<number>(8).fill(409)]);
    expect(invoiceBalance(invoice, await paymentsOf(id))).toBe(pesos(200));
  });

  it("never refunds more than was paid", async () => {
    const { id, invoice } = await billOf(1000);
    await t.ok(post(`/invoices/${invoice.id}/payments`, admin, cash(pesos(1000))), Payment, 201);
    const rs = await Promise.all(Array.from({ length: 10 }, () => post(`/invoices/${invoice.id}/payments`, admin, cash(-pesos(300), { note: "Back" }))));
    noServerErrors(rs);
    expect(statuses(rs)).toEqual([201, 201, 201, ...Array<number>(7).fill(409)]);
    expect(invoiceBalance(invoice, await paymentsOf(id))).toBe(pesos(900));
  });

  it("numbers thirty parallel receipts without a repeat or a gap", async () => {
    const bills = await Promise.all(Array.from({ length: 5 }, () => billOf(5000)));
    const before = await arCounter();
    const rs = await Promise.all([
      ...bills.flatMap((b) => Array.from({ length: 5 }, () => post(`/invoices/${b.invoice.id}/payments`, desk, cash(pesos(100))))),
      ...bills.map((b) => post(`/patients/${b.id}/deposits`, desk, cash(pesos(50)))),
    ]);
    noServerErrors(rs);
    const numbers = rs.map((r) => Number((r.body as Payment).receiptNo.slice(3))).sort((a, b) => a - b);
    expect(numbers).toEqual(Array.from({ length: 30 }, (_, i) => before + 1 + i));
  });

  it("records one payment for ten parallel retries with one key, and one credit move likewise", async () => {
    const { id, invoice } = await billOf(1000);
    const key = crypto.randomUUID();
    const before = await arCounter();
    const rs = await Promise.all(Array.from({ length: 10 }, () => post(`/invoices/${invoice.id}/payments`, desk, cash(pesos(100)), key)));
    noServerErrors(rs);
    expect(statuses(rs)).toEqual(Array<number>(10).fill(201));
    expect(rs.filter((r) => r.headers["idempotent-replayed"] === "true")).toHaveLength(9);
    for (const r of rs) expect(r.body).toEqual(rs[0]!.body); // equal values (MySQL's JSON column reorders a replay's keys)
    expect((await paymentsOf(id)).filter((p) => p.invoiceId === invoice.id)).toHaveLength(1);
    expect([await arCounter(), (await t.auditOf(id, "Payment")).length]).toEqual([before + 1, 1]);

    await t.ok(post(`/patients/${id}/deposits`, desk, cash(pesos(500))), Payment, 201);
    const creditKey = crypto.randomUUID();
    const cr = await Promise.all(Array.from({ length: 10 }, () => post(`/invoices/${invoice.id}/apply-credit`, desk, { amount: pesos(200), receivedBy: "staff_cruz" }, creditKey)));
    noServerErrors(cr);
    expect((await paymentsOf(id)).filter((p) => p.method === "account_credit")).toHaveLength(2); // one bill side, one deposit side
  });

  it("lets one of two bodies win a key, and refuses the other with 422", async () => {
    const { id, invoice } = await billOf(1000);
    const key = crypto.randomUUID();
    const rs = await Promise.all(Array.from({ length: 10 }, (_, i) => post(`/invoices/${invoice.id}/payments`, desk, cash(pesos(i % 2 ? 100 : 200)), key)));
    noServerErrors(rs);
    const won = (await paymentsOf(id)).filter((p) => p.invoiceId === invoice.id);
    expect(won).toHaveLength(1);
    expect(rs.filter((r) => r.status === 201).every((r) => (r.body as Payment).amount === won[0]!.amount)).toBe(true);
    expect(rs.filter((r) => r.status === 422)).toHaveLength(5);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i))("never overdraws a deposit between a credit and a refund (round %i)", async () => {
    const { id, invoice } = await billOf(1000);
    await t.ok(post(`/patients/${id}/deposits`, admin, cash(pesos(1000))), Payment, 201);
    const rs = await Promise.all([
      post(`/invoices/${invoice.id}/apply-credit`, admin, { amount: pesos(800), receivedBy: "staff_cruz" }),
      post(`/patients/${id}/deposits`, admin, cash(-pesos(800), { note: "Back" })),
    ]);
    noServerErrors(rs);
    expect(statuses(rs)).toEqual([201, 409]);
    expect(depositBalance(await paymentsOf(id), id)).toBeGreaterThanOrEqual(0);
  });

  it.each(Array.from({ length: 20 }, (_, i) => i))("lets exactly one of a void and a payment win (round %i)", async () => {
    const { id, invoice } = await billOf(1000);
    const [voided, paid] = await Promise.all([
      post(`/invoices/${invoice.id}/void`, admin, { reason: "Wrong child" }, null),
      post(`/invoices/${invoice.id}/payments`, admin, cash(pesos(100))),
    ]);
    noServerErrors([voided, paid]);
    const rows = (await paymentsOf(id)).filter((p) => p.invoiceId === invoice.id);
    if (voided.status === 200) expect([paid.status, rows.length]).toEqual([409, 0]);
    else expect([voided.status, paid.status, rows.length]).toEqual([409, 201, 1]);
  });

  it("bills one treatment once under two parallel requests", async () => {
    const { id, invoice, itemId } = await billOf(1000);
    await t.ok(post(`/invoices/${invoice.id}/void`, admin, { reason: "Again" }, null), Invoice);
    const rs = await Promise.all([0, 1].map(() => post(`/patients/${id}/invoices`, admin, { planItemIds: [itemId] })));
    noServerErrors(rs);
    expect(statuses(rs)).toEqual([201, 409]);
  });

  it("stays consistent under a mixed load", async () => {
    const families = await Promise.all(Array.from({ length: 3 }, () => billOf(3000)));
    const arBefore = await arCounter();
    for (let round = 0; round < 25; round++) {
      const rs = await Promise.all(families.flatMap(({ id, invoice }) => [
        post(`/invoices/${invoice.id}/payments`, desk, cash(pesos(50))),
        post(`/invoices/${invoice.id}/payments`, admin, cash(-pesos(20), { note: "Back" })),
        post(`/patients/${id}/deposits`, desk, cash(pesos(30))),
        post(`/invoices/${invoice.id}/apply-credit`, desk, { amount: pesos(10), receivedBy: "staff_cruz" }),
        t.call("get", `/patients/${id}/payments`, admin),
      ]));
      noServerErrors(rs);
    }
    for (const { id, invoice } of families) {
      const payments = await paymentsOf(id);
      expect(invoiceBalance(invoice, payments)).toBeGreaterThanOrEqual(0);
      expect(depositBalance(payments, id)).toBeGreaterThanOrEqual(0);
    }
    const ar = (await inClinic(DEMO_CLINIC_ID, () => t.prisma.payment.findMany({ where: { receiptNo: { startsWith: "AR-" } }, select: { receiptNo: true } })))
      .map((p) => Number(p.receiptNo.slice(3))).filter((n) => n > arBefore).sort((a, b) => a - b);
    expect(ar).toEqual(Array.from({ length: ar.length }, (_, i) => arBefore + 1 + i)); // gapless
  });
});
