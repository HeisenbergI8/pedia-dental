import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { addDays, startOfDay } from "date-fns";
import { Appointment, ClinicContext, FinanceSummary, Patient, Payment, Session, SessionUser, StaffMember, TodaySummary, depositBalance, invoiceBalance, type RegisterPatientInput, IDEMPOTENCY_HEADER } from "@pedia/shared";
import { api } from "@/lib/api-client";
import { platform } from "./db";
import { handle } from "./demo-accounts";
import { handlers } from "./handlers";

/** Signed in through the cookies, as the browser is (mocks/access.ts). `branch` is the device's `pd_branch`. */
const server = setupServer(...handlers);
const signIn = (token: string | null, branch?: string) =>
  vi.stubGlobal("document", { cookie: [token && `pd_session=${token}`, branch && `pd_branch=${branch}`].filter(Boolean).join("; ") });
const DEMO = (id: string) => `demo.clinic_demo.${id}`;
const NGITI = (id: string) => `demo.clinic_ngiti.${id}`;
/** Every POST carries a fresh Idempotency-Key (B8 E2); routes without one ignore it. `key` to send a chosen one. */
const send = (method: string, body: unknown, key: string = crypto.randomUUID()) =>
  ({ method, body: JSON.stringify(body), headers: { [IDEMPOTENCY_HEADER]: key } });
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);
const weeks = (n: number) => `from=${startOfDay(new Date()).toISOString()}&to=${addDays(new Date(), 7 * n).toISOString()}`;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

const child: RegisterPatientInput = {
  firstName: "Lia",
  lastName: "Santos",
  birthDate: "2021-03-04",
  sex: "female",
  address: "",
  guardians: [{ id: "g_mother", fullName: "Rina Santos", relationship: "Mother", phone: "09171112222", isPrimary: true }],
  emergencyContact: { name: "", phone: "" },
  allergies: [],
  medicalConditions: [],
  medications: [],
  alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
  privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
};

describe("clinic account isolation", () => {
  it("lists only the signed-in account's patients, staff and chairs", async () => {
    signIn(NGITI("ngiti_staff_tan"));
    const patients = ids(await api("/patients", z.array(Patient)));
    expect(patients.length).toBeGreaterThan(0);
    expect(patients.every((id) => id.startsWith("ngiti_"))).toBe(true);
    expect(ids(await api("/staff", z.array(StaffMember))).every((id) => id.startsWith("ngiti_"))).toBe(true);
    signIn(DEMO("staff_delacruz"));
    expect(ids(await api("/patients", z.array(Patient))).some((id) => id.startsWith("ngiti_"))).toBe(false);
  });

  it("answers 404 for another account's record by id, and refuses to write to it", async () => {
    signIn(NGITI("ngiti_staff_tan"));
    await expect(api("/patients/patient_sibling", Patient)).rejects.toMatchObject({ status: 404 });
    const deposit = { amount: 50_000, method: "cash", receivedBy: "ngiti_staff_tan" };
    await expect(api("/patients/patient_sibling/deposits", Payment, send("POST", deposit))).rejects.toMatchObject({ status: 404 });
    signIn(DEMO("staff_delacruz"));
    await expect(api("/patients/ngiti_patient_1", Patient)).rejects.toMatchObject({ status: 404 });
  });

  it("voids no other account's bill, and keeps Idempotency-Keys per account (B8)", async () => {
    const bill = platform.tenants.clinic_demo!.invoices[0]!;
    signIn(NGITI("ngiti_staff_lim")); // Ngiti's Owner: holds billing.adjust
    await expect(api(`/invoices/${bill.id}/void`, Payment, send("POST", { reason: "Not ours" }))).rejects.toMatchObject({ status: 404 });
    const key = crypto.randomUUID();
    const deposit = (patientId: string, receivedBy: string) =>
      api(`/patients/${patientId}/deposits`, Payment, send("POST", { amount: 10_000, method: "cash", receivedBy }, key));
    const ngiti = await deposit("ngiti_patient_1", "ngiti_staff_lim");
    signIn(DEMO("staff_delacruz"));
    const demo = await deposit("patient_sibling", "staff_delacruz"); // the same key in another account runs fresh
    expect(demo.id).not.toBe(ngiti.id);
  });

  it("ignores a branch cookie that names another account's branch", async () => {
    signIn(NGITI("ngiti_staff_tan"), "branch_imus");
    const context = await api("/clinic", ClinicContext);
    expect(context.account.name).toBe("Ngiti Kids Dental");
    expect(context.activeBranchId).toBe("branch_ngiti_bacoor");
    expect((await api(`/appointments?${weeks(2)}`, z.array(Appointment))).every((a) => a.clinicId === "clinic_ngiti")).toBe(true);
  });

  it("stores a new record in the caller's account only, guardian ids and all", async () => {
    signIn(NGITI("ngiti_staff_tan"));
    const created = await api("/patients", Patient, send("POST", child));
    expect(created.clinicId).toBe("clinic_ngiti");
    expect(platform.tenants.clinic_ngiti!.patients.some((p) => p.id === created.id)).toBe(true);
    expect(platform.tenants.clinic_demo!.patients.some((p) => p.id === created.id)).toBe(false);
    // Same guardian id in the demo clinic: the token names the account, so the two parents never meet.
    signIn(DEMO("staff_delacruz"));
    await api("/patients", Patient, send("POST", child));
    signIn(NGITI("guardian.g_mother"));
    expect(ids(await api("/patients", z.array(Patient)))).toEqual([created.id]);
  });

  it("writes each account's audit trail to that account", async () => {
    signIn(NGITI("ngiti_staff_tan"));
    await api("/patients", z.array(Patient));
    // A repeat view inside the audit window isn't logged again, so check presence, not the last row.
    expect(platform.tenants.clinic_ngiti!.auditEvents.some((e) => e.actorId === "ngiti_staff_tan" && e.clinicId === "clinic_ngiti")).toBe(true);
    expect(platform.tenants.clinic_demo!.auditEvents.some((e) => e.actorId.startsWith("ngiti_") || e.clinicId !== "clinic_demo")).toBe(false);
  });
});

describe("branches", () => {
  // Dr. Reyes works at both demo branches.
  it("lists the active branch's appointments and today's summary", async () => {
    signIn(DEMO("staff_reyes"), "branch_dasma");
    const dasma = await api(`/appointments?${weeks(2)}`, z.array(Appointment));
    expect(dasma.length).toBeGreaterThan(0);
    expect(dasma.every((a) => a.branchId === "branch_dasma")).toBe(true);
    signIn(DEMO("staff_reyes"), "branch_imus");
    expect((await api(`/appointments?${weeks(2)}`, z.array(Appointment))).every((a) => a.branchId === "branch_imus")).toBe(true);
    expect((await api("/reports/today", TodaySummary)).counts.total).toBeGreaterThanOrEqual(0);
  });

  it("books at the active branch and refuses another branch's chair", async () => {
    signIn(DEMO("staff_reyes"), "branch_dasma");
    const patientId = platform.tenants.clinic_demo!.patients[0]!.id;
    let day = addDays(startOfDay(new Date()), 8);
    if (day.getDay() === 0) day = addDays(day, 1);
    const at = (h: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h).toISOString();
    // 12:00: Imus never seeds that hour and Dasmariñas only seeds the next seven days, so Dr. Reyes is free.
    const body = { patientId, dentistId: "staff_reyes", startsAt: at(12), durationMin: 30, reason: "Oral examination" };
    await expect(api("/appointments", Appointment, send("POST", { ...body, chairId: "chair_1" }))).rejects.toMatchObject({ status: 400 });
    // Dasmariñas closes at 5 PM: its own hours, not Imus's 6 PM.
    await expect(api("/appointments", Appointment, send("POST", { ...body, chairId: "chair_5", startsAt: at(17) }))).rejects.toMatchObject({ status: 400 });
    expect(await api("/appointments", Appointment, send("POST", { ...body, chairId: "chair_5" }))).toMatchObject({ branchId: "branch_dasma" });
  });
});

describe("deposits across branches", () => {
  it("takes a deposit used at another branch off the branch that received it", async () => {
    const demo = platform.tenants.clinic_demo!;
    // An Imus invoice with ₱500 still owing, for a child with nothing on deposit yet.
    const invoice = demo.invoices.find((i) => invoiceBalance(i, demo.payments) >= 50_000 && depositBalance(demo.payments, i.patientId) === 0)!;
    const held = async (branch: string) => {
      signIn(DEMO("staff_villanueva"), branch);
      return (await api("/reports/finance", FinanceSummary)).depositsHeld;
    };
    const before = { dasma: await held("branch_dasma"), imus: await held("branch_imus") };
    signIn(DEMO("staff_villanueva"), "branch_dasma");
    await api(`/patients/${invoice.patientId}/deposits`, Payment, send("POST", { amount: 50_000, method: "cash", receivedBy: "staff_villanueva" }));
    expect(await held("branch_dasma")).toBe(before.dasma + 50_000);
    signIn(DEMO("staff_villanueva"), "branch_imus");
    await api(`/invoices/${invoice.id}/apply-credit`, Payment, send("POST", { amount: 50_000, receivedBy: "staff_villanueva" }));
    expect({ dasma: await held("branch_dasma"), imus: await held("branch_imus") }).toEqual(before); // used up, at Dasmariñas
    // Returned to deposit: it goes back to Dasmariñas, where it was handed over.
    signIn(DEMO("staff_villanueva"), "branch_imus");
    await api(`/invoices/${invoice.id}/apply-credit`, Payment, send("POST", { amount: -50_000, receivedBy: "staff_villanueva" }));
    expect(await held("branch_dasma")).toBe(before.dasma + 50_000);
    expect(await held("branch_imus")).toBe(before.imus);
  });
});

describe("roles, sign-in and branches", () => {
  const password = "pass123";
  const login = (body: object) => api("/auth/login", z.unknown(), send("POST", { password, ...body }));

  it("shows a dentist at two branches each branch's own day", async () => {
    let day = addDays(startOfDay(new Date()), 1);
    if (day.getDay() === 0) day = addDays(day, 1); // Dasmariñas seeds no Sundays
    const range = `from=${day.toISOString()}&to=${addDays(day, 1).toISOString()}`;
    signIn(DEMO("staff_reyes"), "branch_dasma");
    const dasma = await api(`/appointments?${range}`, z.array(Appointment));
    signIn(DEMO("staff_reyes"), "branch_imus");
    const imus = await api(`/appointments?${range}`, z.array(Appointment));
    const offset = Math.round((day.getTime() - startOfDay(new Date()).getTime()) / 86_400_000);
    expect(dasma.map((a) => a.id)).toContain(`appointment_dasma_${offset}`);
    expect(imus.some((a) => a.branchId === "branch_dasma")).toBe(false);
  });

  it("keeps an Admin to their assigned branch, whatever the cookie says, and gives the Owner every branch", async () => {
    signIn(DEMO("staff_delacruz"), "branch_dasma");
    const admin = await api("/clinic", ClinicContext);
    expect([admin.branches.map((b) => b.id), admin.activeBranchId]).toEqual([["branch_imus"], "branch_imus"]);
    expect((await api("/auth/me", SessionUser)).roles).toEqual(["admin", "dentist"]); // decision #45
    signIn(DEMO("staff_villanueva"), "branch_dasma");
    const owner = await api("/clinic", ClinicContext);
    expect([owner.branches.map((b) => b.id), owner.activeBranchId]).toEqual([["branch_imus", "branch_dasma"], "branch_dasma"]);
    expect(await api("/auth/me", SessionUser)).toMatchObject({ role: "owner", roles: ["owner", "dentist"], clinicId: "clinic_demo" });
  });

  it("asks which clinic when an email is in two, then signs in to the one picked", async () => {
    signIn(null);
    expect(await login({ email: "dentist@gmail.com" })).toEqual({
      choices: [
        { clinicId: "clinic_demo", name: "Bulilit Smiles Pediatric Dental" },
        { clinicId: "clinic_ngiti", name: "Ngiti Kids Dental" },
      ],
    });
    const session = Session.parse(await login({ email: "dentist@gmail.com", clinicId: "clinic_ngiti" }));
    expect(session.user).toMatchObject({ id: "ngiti_staff_reyes", clinicId: "clinic_ngiti" });
    await expect(login({ email: "dentist@gmail.com", clinicId: "clinic_nope" })).rejects.toMatchObject({ status: 400 });
  });

  it("locks a suspended clinic's staff out, ends their sessions, and keeps its parents read-only", async () => {
    const ngiti = platform.accounts.find((a) => a.id === "clinic_ngiti")!;
    const guardian = platform.tenants.clinic_ngiti!.patients.find((p) => p.id === "ngiti_patient_1")!.guardians[0]!;
    const parentEmail = `${handle(guardian.fullName)}@parent.demo`; // the demo address rule (demo-accounts.ts)
    const paused = { status: 403, message: expect.stringContaining("view records but not make changes") };
    ngiti.status = "suspended";
    try {
      signIn(null);
      await expect(login({ email: "owner@ngiti.demo" })).rejects.toMatchObject({ status: 403, message: expect.stringContaining("Contact your clinic") });
      // dentist@gmail.com still works, straight into the one active clinic: no chooser
      expect(Session.parse(await login({ email: "dentist@gmail.com" })).user.clinicId).toBe("clinic_demo");
      signIn(NGITI("ngiti_staff_tan"));
      await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 401 }); // live staff session ended

      signIn(null);
      const parent = Session.parse(await login({ email: parentEmail }));
      expect(parent.user).toMatchObject({ role: "parent", readOnly: true });
      signIn(parent.token);
      expect(ids(await api("/patients", z.array(Patient)))).toContain("ngiti_patient_1"); // reads work
      await expect(api("/appointments/ngiti_appointment_1/status", Appointment, send("POST", { status: "confirmed" }))).rejects.toMatchObject(paused);
      await expect(api("/patients/ngiti_patient_1/appointment-requests", z.unknown(), send("POST", {}))).rejects.toMatchObject(paused);
    } finally {
      ngiti.status = "active";
    }
  });

  it("switches only to staff who work at this device's branch", async () => {
    const pinOf = (id: string) => platform.tenants.clinic_demo!.staffPins.find((p) => p.staffId === id)!.pin;
    const switchTo = (accountId: string) => api("/auth/switch", Session, send("POST", { accountId, pin: pinOf(accountId) }));
    signIn(DEMO("staff_reyes"), "branch_dasma");
    await expect(switchTo("staff_cruz")).rejects.toMatchObject({ status: 400, message: expect.stringContaining("doesn't work at Dasmariñas") });
    expect(platform.tenants.clinic_demo!.staffPins.find((p) => p.staffId === "staff_cruz")!.failedAt).toEqual([]); // not a PIN attempt
    expect((await switchTo("staff_villanueva")).user.role).toBe("owner"); // the Owner works everywhere
  });
});
