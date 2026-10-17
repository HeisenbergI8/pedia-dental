import { DEMO_CLINIC_ID } from "@pedia/seed";
import {
  ClinicalNote, IDEMPOTENCY_KEY_MISSING, IDEMPOTENCY_KEY_REUSED, Invoice, Payment, PlanItem, Procedure,
  accountSummary, depositBalance, invoiceBalance, invoiceTotal, isMoneyIn, pesos,
} from "@pedia/shared";
import { format } from "date-fns";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp, type Login } from "./clinical-support";

/** apps/web's billing handler tests, against the API (CHUNKS B8), plus B8's decisions: refunds, voids, keys. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
let desk = "";
const OWNER = [DEMO_CLINIC_ID, "staff_villanueva"] as const;
beforeAll(async () => {
  t = await clinicalApp();
  [admin, desk] = [await t.as(ADMIN), await t.as(FRONT_DESK)];
}, 60_000);
afterAll(() => t.app.close());

/** A POST with a fresh Idempotency-Key (or the given one; `null` for none). */
const post = (path: string, cookie: string, body: unknown, key: string | null = crypto.randomUUID()) => {
  const req = request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie);
  return (key === null ? req : req.set("Idempotency-Key", key)).send(body as object);
};
const get = (path: string, cookie = admin) => t.call("get", path, cookie);
const words = async (res: Promise<request.Response>) => { const r = await res; return [r.status, r.text]; };
const paymentsOf = async (patientId: string) => t.ok(get(`/patients/${patientId}/payments`), z.array(Payment));
const invoicesOf = async (patientId: string) => t.ok(get(`/patients/${patientId}/invoices`), z.array(Invoice));
const auditOf = (patientId: string, record: string) => t.auditOf(patientId, record).then((rows) => rows.length);

/** The mock's patientWithDoneItems: plan items completed by signed notes in one visit. */
async function doneItems(plan: [string, number?][], notes: [string, Record<string, unknown>][]) {
  const fee = Object.fromEntries((await t.ok(get("/procedures"), z.array(Procedure))).map((p) => [p.code, p.fee]));
  const id = await t.register();
  for (const [procedureCode, tooth] of plan) await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode, tooth, fee: fee[procedureCode] }), PlanItem, 201);
  const visit = await t.start(id, admin);
  for (const [templateId, values] of notes) {
    const note = await t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId, values, behavior: [] }), ClinicalNote, 201);
    await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
  }
  const items = await t.ok(get(`/patients/${id}/plan`), z.array(PlanItem));
  expect(items.every((i) => i.status === "done")).toBe(true);
  return { id, items, visit };
}
const fluoride = () => doneItems([["fluoride"]], [["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }]]);
const bill = async (id: string, planItemIds: string[], discount?: number) =>
  t.ok(post(`/patients/${id}/invoices`, admin, { planItemIds, ...(discount !== undefined && { discount }) }), Invoice, 201);
const pay = (invoiceId: string, body: object, cookie = admin, key?: string | null) =>
  post(`/invoices/${invoiceId}/payments`, cookie, { receivedBy: "staff_cruz", method: "cash", ...body }, key);

describe("billing (apps/web handlers.test.ts → billing)", () => {
  it("reproduces the ₱8,500 total, ₱5,000 paid, ₱3,500 balance (done-when)", async () => {
    const { id, items } = await doneItems(
      [["prophylaxis"], ["fluoride"], ["restoration", 51], ["restoration", 74], ["restoration", 84], ["follow_up"]],
      [
        ["tpl_prophylaxis", { method: "Rubber cup and paste" }],
        ["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }],
        ["tpl_restoration", { teeth: [51, 74, 84], material: "Composite" }],
        ["tpl_follow_up", { healing: "Satisfactory" }],
      ],
    );
    const invoice = await bill(id, items.map((i) => i.id));
    expect(invoiceTotal(invoice)).toBe(pesos(8500));
    expect(invoice.lines.map((l) => l.planItemId)).toEqual(items.map((i) => i.id));
    expect((await post(`/patients/${id}/invoices`, admin, { planItemIds: [items[0]!.id] })).status).toBe(409); // billed once
    expect(await words(pay(invoice.id, { amount: pesos(9000) }))).toEqual([409, "That's more than the ₱8,500.00 balance"]);
    expect((await pay(invoice.id, { amount: pesos(2000), method: "gcash" })).status).toBe(400); // no reference
    const first = await t.ok(pay(invoice.id, { amount: pesos(3000) }), Payment, 201);
    const second = await t.ok(pay(invoice.id, { amount: pesos(2000), method: "gcash", referenceNo: "1012 345 678" }), Payment, 201);
    expect(Number(second.receiptNo.slice(3))).toBe(Number(first.receiptNo.slice(3)) + 1);
    const payments = await paymentsOf(id);
    expect(invoiceBalance(invoice, payments)).toBe(pesos(3500));
    expect(accountSummary([invoice], payments)).toEqual({ total: pesos(8500), paid: pesos(5000), balance: pesos(3500) });
  });

  it("applies a discount, takes a refund with a reason, and lists the day's collections", async () => {
    const { id, items } = await fluoride();
    expect(await words(post(`/patients/${id}/invoices`, admin, { planItemIds: [items[0]!.id], discount: pesos(900) }))).toEqual([400, "The discount can't be more than ₱800.00"]);
    const invoice = await bill(id, [items[0]!.id], pesos(100));
    expect(invoiceTotal(invoice)).toBe(pesos(700));
    await t.ok(pay(invoice.id, { amount: pesos(700) }), Payment, 201);
    expect((await pay(invoice.id, { amount: -pesos(200) })).status).toBe(400); // a refund needs a reason
    const refund = await t.ok(pay(invoice.id, { amount: -pesos(200), note: "Parent overpaid" }), Payment, 201);
    expect(await words(pay(invoice.id, { amount: -pesos(600), note: "Too much" }))).toEqual([409, "A refund can't be more than the ₱500.00 paid"]);
    expect(invoiceBalance(invoice, await paymentsOf(id))).toBe(pesos(200));
    const today = await t.ok(get(`/payments?date=${format(new Date(), "yyyy-MM-dd")}`, desk), z.array(Payment));
    expect(today.map((p) => p.id)).toContain(refund.id);
  });

  it("holds a deposit, applies part of it to a bill under one CR number, and moves it back", async () => {
    const { id, items } = await fluoride();
    const deposit = (body: object, cookie = admin) => post(`/patients/${id}/deposits`, cookie, { method: "cash", receivedBy: "staff_cruz", ...body });
    const held = async () => depositBalance(await paymentsOf(id), id);
    const paid = await t.ok(deposit({ amount: pesos(1000) }), Payment, 201);
    expect([paid.invoiceId, paid.receiptNo.slice(0, 3)]).toEqual([undefined, "AR-"]);
    expect(await words(deposit({ amount: -pesos(1500), note: "Too much" }))).toEqual([409, "A refund can't be more than the ₱1,000.00 deposit"]);
    await t.ok(deposit({ amount: -pesos(200), note: "Parent changed plans" }), Payment, 201);
    expect(await held()).toBe(pesos(800));

    const invoice = await bill(id, [items[0]!.id]);
    const apply = (amount: number, cookie = admin) => post(`/invoices/${invoice.id}/apply-credit`, cookie, { amount, receivedBy: "staff_cruz" });
    expect(await words(apply(pesos(900)))).toEqual([409, "Only ₱800.00 is on deposit"]);
    const applied = await t.ok(apply(pesos(600)), Payment, 201);
    expect(applied).toMatchObject({ method: "account_credit", invoiceId: invoice.id, note: "Paid from deposit" });
    expect((await paymentsOf(id)).filter((p) => p.receiptNo === applied.receiptNo).map((p) => p.amount)).toEqual([pesos(600), -pesos(600)]);
    expect([invoiceBalance(invoice, await paymentsOf(id)), await held()]).toEqual([pesos(200), pesos(200)]);
    expect((await apply(pesos(300))).status).toBe(409);
    await t.ok(apply(-pesos(600), desk), Payment, 201); // returning credit is front desk's too (decision 3: not a refund)
    expect([invoiceBalance(invoice, await paymentsOf(id)), await held()]).toEqual([pesos(800), pesos(800)]);
    const day = await t.ok(get(`/payments?date=${format(new Date(), "yyyy-MM-dd")}`, desk), z.array(Payment));
    expect(day.filter((p) => p.patientId === id && isMoneyIn(p)).reduce((s, p) => s + p.amount, 0)).toBe(pesos(800));
  });

  it("leaves refunds to the Owner and admins, and writes nothing on a refused one (decision 3)", async () => {
    const { id, items } = await fluoride();
    const invoice = await bill(id, [items[0]!.id]);
    await t.ok(pay(invoice.id, { amount: pesos(500) }, desk), Payment, 201);
    const refused = [403, "Only the Owner or an admin can record a refund"];
    expect(await words(pay(invoice.id, { amount: -pesos(100), note: "Overpaid" }, desk))).toEqual(refused);
    await t.ok(post(`/patients/${id}/deposits`, desk, { amount: pesos(300), method: "cash", receivedBy: "staff_cruz" }), Payment, 201);
    expect(await words(post(`/patients/${id}/deposits`, desk, { amount: -pesos(100), method: "cash", receivedBy: "staff_cruz", note: "Back" }))).toEqual(refused);
    expect((await paymentsOf(id)).length).toBe(2);
    await t.ok(pay(invoice.id, { amount: -pesos(100), note: "Overpaid" }, await t.as(OWNER)), Payment, 201);
  });

  it("voids a bill made by mistake, in the mock's order, and bills its treatment again (decision 2)", async () => {
    const { id, items } = await fluoride();
    const invoice = await bill(id, [items[0]!.id]);
    const voidIt = (body: object, cookie = admin, invoiceId = invoice.id) => post(`/invoices/${invoiceId}/void`, cookie, body, null);
    expect(await words(voidIt({ reason: "Wrong child" }, desk))).toEqual([403, "You don't have access to this"]);
    expect(await words(voidIt({ reason: "Wrong child" }, admin, "nope"))).toEqual([404, "Invoice not found"]);
    expect((await voidIt({ reason: " " })).status).toBe(400);
    const voided = await t.ok(voidIt({ reason: "Wrong child" }), Invoice);
    expect(voided.voided).toMatchObject({ by: "staff_delacruz", reason: "Wrong child" });
    expect(await words(voidIt({ reason: "Again" }))).toEqual([409, "This bill is already voided"]);
    expect(await words(pay(invoice.id, { amount: pesos(100) }))).toEqual([409, "This bill was voided"]);
    await t.ok(post(`/patients/${id}/deposits`, admin, { amount: pesos(100), method: "cash", receivedBy: "staff_cruz" }), Payment, 201);
    expect(await words(post(`/invoices/${invoice.id}/apply-credit`, admin, { amount: pesos(100), receivedBy: "staff_cruz" }))).toEqual([409, "This bill was voided"]);
    expect((await invoicesOf(id)).find((i) => i.id === invoice.id)?.voided?.reason).toBe("Wrong child"); // still on record
    const again = await bill(id, [items[0]!.id]);
    expect(accountSummary(await invoicesOf(id), await paymentsOf(id)).balance).toBe(invoiceTotal(again));
    expect(await auditOf(id, "Invoice (voided)")).toBe(1);

    // Any payment ever made blocks a void, refunded or not.
    await t.ok(pay(again.id, { amount: pesos(100) }), Payment, 201);
    const blocked = [409, "Only a bill with nothing paid or applied on it can be voided"];
    expect(await words(voidIt({ reason: "Wrong" }, admin, again.id))).toEqual(blocked);
    await t.ok(pay(again.id, { amount: -pesos(100), note: "Back" }), Payment, 201);
    expect(await words(voidIt({ reason: "Wrong" }, admin, again.id))).toEqual(blocked);
  });

  it("records a payment once per key, and says so on the replay (done-when)", async () => {
    const { id, items } = await fluoride();
    const invoice = await bill(id, [items[0]!.id]);
    const key = crypto.randomUUID();
    const [a, b] = [await pay(invoice.id, { amount: pesos(100) }, admin, key), await pay(invoice.id, { amount: pesos(100) }, admin, key)];
    expect([a.status, b.status, a.headers["idempotent-replayed"], b.headers["idempotent-replayed"]]).toEqual([201, 201, undefined, "true"]);
    expect(b.body).toEqual(a.body);
    expect((await paymentsOf(id)).filter((p) => p.invoiceId === invoice.id)).toHaveLength(1);
    expect(await auditOf(id, "Payment")).toBe(1);
    expect(await words(pay(invoice.id, { amount: pesos(101) }, admin, key))).toEqual([422, IDEMPOTENCY_KEY_REUSED]);
    expect(await words(pay("nope", { amount: 1 }, admin, null))).toEqual([400, IDEMPOTENCY_KEY_MISSING]); // the key before the 404
  });

  it("checks in the mock's order: 404 before the body, 403 refund before the staff check", async () => {
    expect((await pay("nope", { amount: "lots" })).status).toBe(404);
    const { id, items } = await fluoride();
    const invoice = await bill(id, [items[0]!.id]);
    expect((await pay(invoice.id, { amount: -pesos(1), note: "x", receivedBy: "nobody" }, desk)).status).toBe(403);
    expect(await words(pay(invoice.id, { amount: pesos(1), receivedBy: "nobody" }))).toEqual([400, "Choose someone who works here now"]);
  });

  it("keeps money with its branch: the bill's, or the device's for a deposit (E11)", async () => {
    const owner = await t.as(OWNER);
    const dasma = `${owner}; pd_branch=branch_dasma`;
    const { id, items } = await fluoride();
    const invoice = await t.ok(post(`/patients/${id}/invoices`, dasma, { planItemIds: [items[0]!.id] }), Invoice, 201);
    expect(invoice.branchId).toBe("branch_dasma"); // billed without an appointment: the device's branch
    const paid = await t.ok(pay(invoice.id, { amount: pesos(100) }, owner), Payment, 201); // from an Imus device
    expect(paid.branchId).toBe("branch_dasma");
    const deposit = await t.ok(post(`/patients/${id}/deposits`, dasma, { amount: pesos(50), method: "cash", receivedBy: "staff_cruz" }), Payment, 201);
    expect(deposit.branchId).toBe("branch_dasma");
  });

  it("lists the clinic's day, refuses a branch the caller can't see, and lists nothing for a bad date", async () => {
    expect(await t.ok(get("/payments?date=nonsense", desk), z.array(Payment))).toEqual([]);
    expect(await words(get("/payments?branch=branch_dasma", desk))).toEqual([403, "Reports across branches need two open branches you work at"]);
    const seeded = t.platform.tenants[DEMO_CLINIC_ID]!.payments.filter((p) => p.branchId === "branch_imus");
    const day = format(new Date(seeded[0]!.receivedAt), "yyyy-MM-dd");
    const list = await t.ok(get(`/payments?date=${day}`, desk), z.array(Payment));
    expect(list.map((p) => p.id)).toEqual(expect.arrayContaining(seeded.filter((p) => format(new Date(p.receivedAt), "yyyy-MM-dd") === day).map((p) => p.id)));
    expect(list.every((p) => format(new Date(p.receivedAt), "yyyy-MM-dd") === day)).toBe(true); // the Manila day
  });

  it("answers 404 for another clinic's bill or patient", async () => {
    const ngiti = await t.as(NGITI_OWNER);
    const theirs = t.platform.tenants[DEMO_CLINIC_ID]!.invoices[0]!;
    for (const path of [`/invoices/${theirs.id}/payments`, `/invoices/${theirs.id}/apply-credit`]) {
      expect(await words(post(path, ngiti, { amount: 1, method: "cash", receivedBy: "ngiti_staff_lim" }))).toEqual([404, "Invoice not found"]);
    }
    expect(await words(post(`/invoices/${theirs.id}/void`, ngiti, { reason: "x" }, null))).toEqual([404, "Invoice not found"]);
    expect(await words(post(`/patients/${theirs.patientId}/deposits`, ngiti, { amount: 1, method: "cash", receivedBy: "ngiti_staff_lim" }))).toEqual([404, "Patient not found"]);
  });

  it("shows a parent their child's bills and payments without the voided ones, and lets them write none", async () => {
    const db = t.platform.tenants[DEMO_CLINIC_ID]!;
    const guardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
    const parent = await t.as([DEMO_CLINIC_ID, `guardian.${guardianId}`] as Login);
    // A bill for the family's child, voided by mistake: staff still see it, the parent doesn't (B8 question 3).
    const plan = await t.ok(t.call("post", "/patients/patient_sibling/plan", admin, { procedureCode: "fluoride", fee: pesos(800) }), PlanItem, 201);
    const visit = await t.start("patient_sibling", admin);
    const note = await t.ok(t.call("post", "/patients/patient_sibling/notes", admin, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }), ClinicalNote, 201);
    await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
    await t.complete(visit.id, admin);
    const voided = await bill("patient_sibling", [plan.id]);
    await t.ok(post(`/invoices/${voided.id}/void`, admin, { reason: "Wrong child" }, null), Invoice);
    expect((await invoicesOf("patient_sibling")).map((i) => i.id)).toContain(voided.id);
    const theirs = await t.ok(get("/patients/patient_sibling/invoices", parent), z.array(Invoice));
    expect(theirs.map((i) => i.id)).not.toContain(voided.id);
    expect((await get("/patients/patient_sibling/payments", parent)).status).toBe(200);
    expect((await post("/patients/patient_sibling/deposits", parent, { amount: 1, method: "cash", receivedBy: "staff_cruz" })).status).toBe(403);
  });

});
