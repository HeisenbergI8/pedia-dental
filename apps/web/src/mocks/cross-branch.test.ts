import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import { setupServer } from "msw/node";
import { z } from "zod";
import { Appointment, ClinicalNote, FinanceSummary, Invoice, Payment, PlanItem, TodaySummary, Visit, IDEMPOTENCY_HEADER, pesos } from "@pedia/shared";
import { ApiError, api } from "@/lib/api-client";
import { handlers } from "./handlers";
import { DASMA, IMUS } from "@pedia/seed";

const server = setupServer(...handlers);
const signIn = (token: string, branch?: string) =>
  vi.stubGlobal("document", { cookie: [`pd_session=${token}`, branch && `pd_branch=${branch}`].filter(Boolean).join("; ") });
const OWNER = "demo.clinic_demo.staff_villanueva"; // Owner + Dentist, Bulilit (Mid, Imus + Dasmariñas)
const ADMIN = "demo.clinic_demo.staff_delacruz"; // Carmen: Admin + Dentist, Imus only
const NGITI_OWNER = "demo.clinic_ngiti.ngiti_staff_lim"; // Small
const today = format(new Date(), "yyyy-MM-dd");
/** Every POST carries a fresh Idempotency-Key (B8 E2); routes without one ignore it. `key` to send a chosen one. */
const send = (method: string, body: unknown, key: string = crypto.randomUUID()) =>
  ({ method, body: JSON.stringify(body), headers: { [IDEMPOTENCY_HEADER]: key } });
const finance = (branch?: string) => api(`/reports/finance?today=${today}${branch ? `&branch=${branch}` : ""}`, FinanceSummary);
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("cross-branch reports (decision #20)", () => {
  it("gives the Owner each branch and the combined total", async () => {
    // A cash deposit handed over at each branch (the body tenancy.test.ts "deposits across branches" sends), so both
    // branches hold money and took a payment today: Dasmariñas has no seeded billing, and Imus's seeded payments for
    // today only cover visits already over, so there are none just after midnight.
    for (const branch of [DASMA, IMUS]) {
      signIn(OWNER, branch);
      await api("/patients/patient_sibling/deposits", Payment, send("POST", { amount: 50_000, method: "cash", receivedBy: "staff_villanueva" }));
    }
    const [imus, dasma, all] = await Promise.all([finance(IMUS), finance(DASMA), finance("all")]);
    expect(dasma.depositsHeld).toBeGreaterThan(0);
    expect(all.depositsHeld).toBe(imus.depositsHeld + dasma.depositsHeld);
    for (const k of ["today", "week", "month"] as const) expect(all.collected[k]).toBe(imus.collected[k] + dasma.collected[k]);
    const day = await api(`/payments?date=${today}&branch=all`, z.array(Payment));
    expect(new Set(day.map((p) => p.branchId))).toEqual(new Set([IMUS, DASMA]));
    const glance = await api(`/reports/today?today=${today}&branch=all`, TodaySummary);
    const [i, d] = await Promise.all([IMUS, DASMA].map((b) => api(`/reports/today?today=${today}&branch=${b}`, TodaySummary)));
    expect(glance.appointments).toHaveLength(i!.appointments.length + d!.appointments.length);
  });

  it("keeps the device's branch when no branch is asked for", async () => {
    signIn(OWNER, DASMA);
    expect(await finance()).toEqual(await finance(DASMA));
  });

  it("refuses All branches to a non-Owner and another branch to one-branch staff", async () => {
    signIn(ADMIN, IMUS);
    expect(await status(finance("all"))).toBe(403);
    expect(await status(finance(DASMA))).toBe(403);
    expect(await status(finance(IMUS))).toBe(200);
  });

  it("refuses any other branch on Small", async () => {
    signIn(NGITI_OWNER);
    expect(await status(finance("all"))).toBe(403);
    expect(await status(api(`/payments?date=${today}&branch=all`, z.array(Payment)))).toBe(403);
  });
});

describe("branch-level changes by id (#10)", () => {
  const confirm = { method: "POST", body: JSON.stringify({ status: "confirmed" }) };
  /** A fluoride bill for patient_sibling, made by the Owner on a Dasmariñas device: the bill is Dasmariñas's. */
  async function dasmaBill() {
    signIn(OWNER, DASMA);
    await api("/patients/patient_sibling/plan", PlanItem, send("POST", { procedureCode: "fluoride", fee: pesos(800) }));
    const visit = await api("/patients/patient_sibling/visits", Visit, send("POST", { dentistId: "staff_reyes" }));
    const note = await api("/patients/patient_sibling/notes", ClinicalNote, send("POST", { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }));
    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    const item = (await api("/patients/patient_sibling/plan", z.array(PlanItem))).find((i) => i.completedNoteId === note.id)!;
    const bill = await api("/patients/patient_sibling/invoices", Invoice, send("POST", { planItemIds: [item.id] }));
    expect(bill.branchId).toBe(DASMA);
    return bill;
  }

  it("answers another branch's appointment as missing to staff who don't work there, and lets the Owner change it", async () => {
    signIn(OWNER, DASMA);
    const there = (await api("/appointments", z.array(Appointment))).find((a) => a.status === "booked")!;
    expect(there.branchId).toBe(DASMA);
    signIn(ADMIN, IMUS); // Carmen works at Imus only
    const move = { dentistId: there.dentistId, chairId: there.chairId, startsAt: there.startsAt, durationMin: there.durationMin, reason: there.reason };
    for (const res of [api(`/appointments/${there.id}`, Appointment, { method: "PUT", body: JSON.stringify(move) }), api(`/appointments/${there.id}/status`, Appointment, confirm)]) {
      await expect(res).rejects.toMatchObject({ status: 404, message: "Appointment not found" });
    }
    signIn(OWNER, IMUS); // branches.all, from any device
    expect((await api(`/appointments/${there.id}/status`, Appointment, confirm)).status).toBe("confirmed");
  });

  it("answers another branch's bill as missing to staff who don't work there, but lets them take a payment on it", async () => {
    const bill = await dasmaBill();
    signIn(ADMIN, IMUS);
    await expect(api(`/invoices/${bill.id}/void`, Invoice, send("POST", { reason: "Wrong child" }))).rejects.toMatchObject({ status: 404, message: "Invoice not found" });
    // Paying stays open across branches: a payment goes to its bill's branch wherever it's paid.
    expect((await api(`/invoices/${bill.id}/payments`, Payment, send("POST", { amount: pesos(100), method: "cash", receivedBy: "staff_cruz" }))).branchId).toBe(DASMA);
  });

  it("lets the Owner void another branch's bill from any device", async () => {
    const bill = await dasmaBill();
    signIn(OWNER, IMUS);
    expect((await api(`/invoices/${bill.id}/void`, Invoice, send("POST", { reason: "Wrong child" }))).voided?.reason).toBe("Wrong child");
  });
});
