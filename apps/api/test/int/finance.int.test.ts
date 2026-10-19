import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment, ClinicalNote, FinanceSummary, Invoice, Payment, PlanItem, Visit, financeFacts, financeSummary, isClosedWeekday, pesos } from "@pedia/shared";
import { format, parseISO, startOfMonth, subDays, subMonths } from "date-fns";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { APPOINTMENT_COLUMNS, toAppointment } from "../../src/appointments/appointment.rows";
import { INVOICE_COLUMNS, LINE_COLUMNS, PAYMENT_COLUMNS, PAYMENT_ORDER, toInvoice, toPayment } from "../../src/billing-records/billing.rows";
import { BillingRecordsService } from "../../src/billing-records/billing-records.service";
import { manilaStartUtc, nextDay } from "../../src/billing-records/finance-facts";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp, type Login } from "./clinical-support";

/** The financial dashboard on the API equals the shared financeSummary over the same rows (CHUNKS B8 done-when). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
let owner = "";
const OWNER: Login = [DEMO_CLINIC_ID, "staff_villanueva"];
const [IMUS, DASMA] = ["branch_imus", "branch_dasma"];
let today = "";
beforeAll(async () => {
  t = await clinicalApp();
  [admin, owner] = [await t.as(ADMIN), await t.as(OWNER)];
  today = format(new Date(), "yyyy-MM-dd"); // the process runs in Manila
}, 60_000);
afterAll(() => t.app.close());

/** The API's own rows, as the contract, so the comparison holds before and after live writes. */
async function rows(clinicId: string) {
  return inClinic(clinicId, async () => {
    const lines = await t.prisma.invoiceLine.findMany({ select: LINE_COLUMNS });
    const invoices = (await t.prisma.invoice.findMany({ select: INVOICE_COLUMNS })).map((r) => toInvoice(r, lines.filter((l) => l.invoiceId === r.id)));
    const payments = (await t.prisma.payment.findMany({ select: PAYMENT_COLUMNS, orderBy: PAYMENT_ORDER })).map(toPayment);
    const appointments = (await t.prisma.appointment.findMany({ select: APPOINTMENT_COLUMNS })).map(toAppointment);
    return { invoices, payments, appointments };
  });
}
/** The mock's branchView (dashboard/mocks.ts:20–25), then its financeSummary. */
const view = (r: Awaited<ReturnType<typeof rows>>, branchIds: string[]) => ({
  invoices: r.invoices.filter((i) => branchIds.includes(i.branchId)),
  payments: r.payments.filter((p) => branchIds.includes(p.branchId)),
  appointments: r.appointments.filter((a: Appointment) => branchIds.includes(a.branchId)),
});
const expected = async (clinicId: string, branchIds: string[], day = today) => financeSummary(view(await rows(clinicId), branchIds), day);
const report = (cookie: string, query: string) => t.ok(t.call("get", `/reports/finance${query}`, cookie), FinanceSummary);
const words = async (cookie: string, query: string) => { const r = await t.call("get", `/reports/finance${query}`, cookie); return [r.status, r.text]; };

/** Each choice of branches, as someone allowed to ask for it. */
const choices = () => [
  { name: "Imus (admin's device)", cookie: admin, query: "", clinic: DEMO_CLINIC_ID, branches: [IMUS] },
  { name: "Dasmariñas (Owner)", cookie: owner, query: `&branch=${DASMA}`, clinic: DEMO_CLINIC_ID, branches: [DASMA] },
  { name: "all (Owner)", cookie: owner, query: "&branch=all", clinic: DEMO_CLINIC_ID, branches: [IMUS, DASMA] },
  { name: "Dasmariñas (Owner's device, no branch asked)", cookie: `${owner}; pd_branch=${DASMA}`, query: "", clinic: DEMO_CLINIC_ID, branches: [DASMA] },
];

describe("the financial dashboard matches the mock's financeSummary (done-when)", () => {
  it("for every branch choice over the seed, and Ngiti", async () => {
    for (const c of choices()) expect(await report(c.cookie, `?today=${today}${c.query}`), c.name).toEqual(await expected(c.clinic, c.branches));
    expect((await report(admin, `?today=${today}`)).collected.month + (await report(admin, `?today=${today}`)).outstandingTotal).toBeGreaterThan(0); // not vacuous
    const ngiti = await t.as(NGITI_OWNER);
    const ngitiBranch = t.platform.tenants.clinic_ngiti!.branches[0]!.id;
    expect(await report(ngiti, `?today=${today}`)).toEqual(await expected("clinic_ngiti", [ngitiBranch]));
  });

  it("on the days that move its buckets: month start and end, week edges, six months back", async () => {
    const t0 = parseISO(today);
    const days = [format(startOfMonth(t0), "yyyy-MM-dd"), format(subDays(startOfMonth(t0), 1), "yyyy-MM-dd"), format(subMonths(t0, 6), "yyyy-MM-dd")];
    for (let i = 0; i < 7; i++) days.push(format(subDays(t0, i), "yyyy-MM-dd")); // a whole week: a Sunday and a Monday among them
    for (const day of days) expect(await report(owner, `?today=${day}&branch=all`), day).toEqual(await expected(DEMO_CLINIC_ID, [IMUS, DASMA], day));
  });

  it("builds the same facts in SQL as the shared rule does over the rows", async () => {
    const records = t.app.get(BillingRecordsService);
    const sorted = <T>(xs: T[]) => [...xs].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    const r = view(await rows(DEMO_CLINIC_ID), [IMUS]);
    const shared = financeFacts(r, today);
    const done = shared.done.map((d) => ({ id: d.appointmentId, patientId: d.patientId, startsAt: d.startsAt, reason: d.reason }));
    const sql = await inClinic(DEMO_CLINIC_ID, () => records.financeFacts([IMUS], today, done));
    for (const key of ["collected", "revenue", "balances", "deposits", "done"] as const) expect(sorted(sql[key] as object[]), key).toEqual(sorted(shared[key] as object[]));
    expect(sql.discounts).toBe(shared.discounts);
  });

  it("still matches after live billing at both branches, refunds, deposits, credit and a void", async () => {
    const dasma = `${owner}; pd_branch=${DASMA}`;
    const post = (path: string, cookie: string, body: object, key: string | null = crypto.randomUUID()) => {
      const req = request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie);
      return t.ok(key === null ? req.send(body) : req.set("Idempotency-Key", key).send(body), z.unknown(), key === null ? 200 : 201);
    };
    const doneFluoride = async (cookie: string) => {
      const id = await t.register();
      await t.call("post", `/patients/${id}/plan`, admin, { procedureCode: "fluoride", fee: pesos(800) });
      const visit = await t.start(id, admin);
      const note = (await t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] })).body as { id: string };
      await t.call("post", `/notes/${note.id}/sign`, admin);
      await t.complete(visit.id, admin);
      const [item] = (await t.call("get", `/patients/${id}/plan`, admin)).body as { id: string }[];
      return { id, bill: Invoice.parse(await post(`/patients/${id}/invoices`, cookie, { planItemIds: [item!.id] })) };
    };
    const cash = (amount: number, extra: object = {}) => ({ amount, method: "cash", receivedBy: "staff_cruz", ...extra });
    const imus = await doneFluoride(admin);
    const there = await doneFluoride(dasma);
    await post(`/invoices/${imus.bill.id}/payments`, admin, cash(pesos(500)));
    await post(`/invoices/${imus.bill.id}/payments`, admin, cash(-pesos(100), { note: "Back" }));
    await post(`/patients/${there.id}/deposits`, dasma, cash(pesos(600)));
    await post(`/patients/${there.id}/deposits`, admin, cash(pesos(300))); // at Imus: the credit draws Dasmariñas first
    Payment.parse(await post(`/invoices/${there.bill.id}/apply-credit`, admin, { amount: pesos(700), receivedBy: "staff_cruz" }));
    await post(`/invoices/${there.bill.id}/apply-credit`, admin, { amount: -pesos(100), receivedBy: "staff_cruz" });
    const voided = await doneFluoride(admin);
    await post(`/invoices/${voided.bill.id}/void`, admin, { reason: "Wrong child" }, null);

    for (const c of choices()) expect(await report(c.cookie, `?today=${today}${c.query}`), c.name).toEqual(await expected(c.clinic, c.branches));
    const all = await report(owner, `?today=${today}&branch=all`);
    expect(all.outstanding.map((o) => o.patientId)).not.toContain(voided.id);
    const day = await t.ok(t.call("get", `/payments?date=${today}&branch=all`, owner), z.array(Payment));
    expect(new Set(day.map((p) => p.branchId))).toEqual(new Set([IMUS, DASMA]));
  });

  it("lists an appointment as unpaid until its invoice is paid", async () => {
    const post = (path: string, body: object, key: string | null = crypto.randomUUID()) => {
      const req = request(t.app.getHttpServer()).post(`/api${path}`).set("Cookie", admin);
      return t.ok(key === null ? req.send(body) : req.set("Idempotency-Key", key).send(body), z.unknown(), key === null ? 200 : 201);
    };
    const id = await t.register();
    // The last open day before today, in clinic hours, in the past, inside the 30-day window.
    const hours = t.platform.tenants[DEMO_CLINIC_ID]!.branches.find((b) => b.id === IMUS)!.openingHours;
    let day = subDays(parseISO(today), 1);
    while (isClosedWeekday(day, hours)) day = subDays(day, 1);
    const startsAt = new Date(`${format(day, "yyyy-MM-dd")}T17:30:00+08:00`).toISOString();
    const appt = await t.ok(t.call("post", "/appointments", admin, { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt, durationMin: 15, reason: "Fluoride application" }), Appointment, 201);
    for (const status of ["confirmed", "arrived"]) await t.ok(t.call("post", `/appointments/${appt.id}/status`, admin, { status }), Appointment);
    await t.ok(t.call("post", `/patients/${id}/plan`, admin, { procedureCode: "fluoride", fee: pesos(800) }), PlanItem, 201);
    const visit = await t.ok(t.call("post", `/patients/${id}/visits`, admin, { dentistId: "staff_reyes", appointmentId: appt.id }), Visit, 201);
    const note = await t.ok(t.call("post", `/patients/${id}/notes`, admin, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }), ClinicalNote, 201);
    await t.ok(t.call("post", `/notes/${note.id}/sign`, admin), ClinicalNote);
    await t.complete(visit.id, admin);

    const summary = () => report(admin, `?today=${today}`);
    const unpaid = async () => (await summary()).unpaidAppointments.find((a) => a.appointmentId === appt.id);
    expect(await unpaid()).toMatchObject({ appointmentId: appt.id }); // done, not billed
    expect((await unpaid())?.invoiceId).toBeUndefined();

    const [item] = await t.ok(t.call("get", `/patients/${id}/plan`, admin), z.array(PlanItem));
    const bill = Invoice.parse(await post(`/patients/${id}/invoices`, { planItemIds: [item!.id] }));
    expect(bill.appointmentId).toBe(appt.id); // derived from the visit, not sent by the client
    expect(await unpaid()).toMatchObject({ invoiceId: bill.id, balance: pesos(800) });

    // Voided, it no longer bills the appointment or counts in revenue (B8 decision 2); billed again, it does.
    const fluoride = async () => (await summary()).revenueByProcedure.find((r) => r.procedureCode === "fluoride")?.count ?? 0;
    const before = await fluoride();
    await post(`/invoices/${bill.id}/void`, { reason: "Billed the wrong discount" }, null);
    expect((await unpaid())?.invoiceId).toBeUndefined();
    expect(await fluoride()).toBe(before - 1);
    const rebilled = Invoice.parse(await post(`/patients/${id}/invoices`, { planItemIds: [item!.id] }));
    expect(await unpaid()).toMatchObject({ invoiceId: rebilled.id, balance: pesos(800) });

    await post(`/invoices/${rebilled.id}/payments`, { amount: pesos(800), method: "cash", receivedBy: "staff_cruz" });
    expect(await unpaid()).toBeUndefined();
  });

  it("totals what SQL sums: collected this month, the six months, outstanding and deposits (done-when)", async () => {
    const s = await report(owner, `?today=${today}&branch=all`);
    const sum = (sql: Promise<{ n: unknown }[]>) => sql.then((r) => Number(r[0]?.n ?? 0));
    const between = (from: string, to: string) => inClinic(DEMO_CLINIC_ID, () => sum(t.prisma.$queryRaw`
      SELECT COALESCE(SUM(amount), 0) AS n FROM Payment WHERE clinicId = ${DEMO_CLINIC_ID} AND method <> 'account_credit'
        AND receivedAt >= ${manilaStartUtc(from)} AND receivedAt < ${manilaStartUtc(to)}`));
    expect(s.collected.month).toBe(await between(format(startOfMonth(parseISO(today)), "yyyy-MM-dd"), nextDay(today)));
    expect(s.byMonth.reduce((a, b) => a + b.amount, 0)).toBe(await between(s.byMonth[0]!.start, nextDay(today)));
    const outstanding = await inClinic(DEMO_CLINIC_ID, () => sum(t.prisma.$queryRaw`
      SELECT COALESCE(SUM(b), 0) AS n FROM (SELECT i.patientId, SUM(
          (SELECT COALESCE(SUM(l.amount), 0) FROM InvoiceLine l WHERE l.invoiceId = i.id) - i.discount
          - (SELECT COALESCE(SUM(p.amount), 0) FROM Payment p WHERE p.invoiceId = i.id)) AS b
        FROM Invoice i WHERE i.clinicId = ${DEMO_CLINIC_ID} AND i.voidedAt IS NULL GROUP BY i.patientId HAVING b > 0) x`));
    expect(s.outstandingTotal).toBe(outstanding);
    const deposits = await inClinic(DEMO_CLINIC_ID, () => sum(t.prisma.$queryRaw`
      SELECT COALESCE(SUM(h), 0) AS n FROM (SELECT GREATEST(SUM(amount), 0) AS h FROM Payment
        WHERE clinicId = ${DEMO_CLINIC_ID} AND invoiceId IS NULL GROUP BY patientId) x`));
    expect(s.depositsHeld).toBe(deposits);
  });

  it("counts a payment on its Manila day, right up to midnight", async () => {
    const records = t.app.get(BillingRecordsService);
    const day = format(subDays(parseISO(today), 40), "yyyy-MM-dd"); // a quiet day inside the six months
    const patientId = t.platform.tenants[DEMO_CLINIC_ID]!.patients[0]!.id;
    const row = (receivedAt: string, receiptNo: string) => ({
      branchId: IMUS, patientId, amount: pesos(7), method: "cash" as const, receiptNo, receiptLeg: 0, receivedBy: "staff_cruz", receivedAt,
    });
    await inClinic(DEMO_CLINIC_ID, () => t.prisma.$transaction((tx) => records.addPayments(tx, [
      row(new Date(`${day}T23:59:00+08:00`).toISOString(), "AR-990001"),
      row(new Date(`${nextDay(day)}T00:00:00+08:00`).toISOString(), "AR-990002"),
    ])));
    const s = await report(owner, `?today=${nextDay(day)}&branch=${IMUS}`);
    expect(s).toEqual(await expected(DEMO_CLINIC_ID, [IMUS], nextDay(day)));
    const collections = (d: string) => t.ok(t.call("get", `/payments?date=${d}`, admin), z.array(Payment)).then((ps) => ps.map((p) => p.receiptNo));
    expect(await collections(day)).toContain("AR-990001");
    expect(await collections(nextDay(day))).toContain("AR-990002");
    expect(await collections(day)).not.toContain("AR-990002");
  });

  it("refuses a bad day, other branches without the right, and staff without the dashboard", async () => {
    expect(await words(admin, "?today=2026-02-30")).toEqual([400, "today must be YYYY-MM-DD"]);
    expect(await words(admin, "?branch=all")).toEqual([403, "Reports across branches need two open branches you work at"]);
    expect(await words(admin, `?today=${today}&branch=${DASMA}`)).toEqual([403, "Reports across branches need two open branches you work at"]);
    expect((await t.call("get", `/reports/finance?today=${today}&branch=${IMUS}`, admin)).status).toBe(200);
    expect(await words(await t.as(NGITI_OWNER), "?branch=all")).toEqual([403, "Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade."]);
    const collections = await t.call("get", `/payments?date=${today}&branch=all`, await t.as(NGITI_OWNER));
    expect([collections.status, collections.text]).toEqual([403, "Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade."]);
    expect((await t.call("get", "/reports/finance", await t.as(FRONT_DESK))).status).toBe(403);
  });
});
