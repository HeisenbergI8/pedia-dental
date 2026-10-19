import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import {
  AccountOverview,
  AcknowledgementPrompt,
  AuditLogPage,
  Appointment,
  ClinicalPhoto,
  CreateAccountResult,
  LEGAL_DOCUMENTS,
  Message,
  Patient,
  PatientPage,
  PatientView,
  PrivacyNoticeView,
  PrivacyRequest,
  PrivacyRequestPage,
  DueItem,
  RESTRICTED_BOOKING_MESSAGE,
  RecordsCopy,
  Session,
  SessionUser,
  Signup,
  SignupStatusView,
  addWorkingDays,
  type GetStartedInput,
  type RegisterPatientInput,
} from "@pedia/shared";
import { ApiError, api } from "@/lib/api-client";
import { signupFormData } from "@/features/signup/form-data";
import { today } from "./clock";
import { db, platform } from "./db";
import { DEMO_PASSWORD, childrenOf } from "./demo-accounts";
import { handlers } from "./handlers";
import { OPERATORS, OPERATOR_COOKIE, operatorToken } from "./operator";
import { resetSignupHits } from "./signups";

const server = setupServer(...handlers);
const cookies = (value = "") => vi.stubGlobal("document", { cookie: value });
const asStaff = (id: string) => cookies(`pd_session=demo.clinic_demo.${id}`);
const asOperator = () => cookies(`${OPERATOR_COOKIE}=${operatorToken(OPERATORS[0]!)}`);
const send = (method: string, body: unknown = {}) => ({ method, body: JSON.stringify(body) });
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const accounts = () => api("/operator/accounts", z.array(AccountOverview));
const HOURS = { opensAt: 9 * 60, closesAt: 18 * 60, closedWeekdays: [0] };
const latestFor = (clinicId: string) => platform.agreements.filter((a) => a.clinicId === clinicId).reverse()[0];

beforeEach(resetSignupHits); // B12 decision 14: each test starts under the hourly sign-up limit
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("seeded privacy demo (privacy #11, #24)", () => {
  it("has every clinic signed on file and current, and one Bulilit child without consent, as a count", async () => {
    asOperator();
    const rows = await accounts();
    for (const { id } of platform.accounts.slice(0, 3)) {
      expect(rows.find((r) => r.account.id === id)!.privacy, id).toMatchObject({ current: true, agreement: { method: "on_file" } });
    }
    expect(rows.find((r) => r.account.id === "clinic_demo")!.privacy.patientsWithoutConsent).toBe(1);
    const demo = platform.tenants.clinic_demo!;
    expect(demo.patients[5]!.privacyConsent).toBeUndefined();
    expect(demo.patients[11]!.privacyChoices![0]!.photos).toBe(false);
  });
});

describe("clinic ↔ Primolar (privacy #7, #8, #10)", () => {
  const form = (n: string): GetStartedInput => ({
    account: { name: `Ngitngit ${n} Dental`, contactEmail: `hello@ngitngit${n}.demo`, tin: "789-012-345", tier: "small" },
    branch: { name: "Imus", address: "2 Nueno Avenue, Imus", phone: "(046) 471 0000", openingHours: HOURS },
    owner: { fullName: `Dr. ${n} Santos`, email: `owner@ngitngit${n}.demo`, role: "admin" },
    branding: { choice: "default" },
    acceptTerms: true,
  });

  it("refuses a sign-up without the acceptance, and carries an accepted one to the approved clinic", async () => {
    cookies();
    const post = (data: unknown) => api("/signups", SignupStatusView, { method: "POST", body: signupFormData(data) });
    expect(await status(post({ ...form("a"), acceptTerms: false }))).toBe(400);
    const view = await post(form("b"));
    const stored = platform.signups.find((s) => s.reference === view.reference)!;
    expect(stored.agreement).toMatchObject({ termsVersion: LEGAL_DOCUMENTS.terms.version, dpaVersion: LEGAL_DOCUMENTS.dpa.version, acceptedBy: "Dr. b Santos", method: "online" });

    asOperator();
    await api(`/operator/signups/${stored.id}/payment`, Signup, send("POST", { method: "bank_transfer", paidOn: "2026-10-13" }));
    const made = await api(`/operator/signups/${stored.id}/approve`, CreateAccountResult, send("POST"));
    expect(made.overview.privacy).toMatchObject({ current: true, patientsWithoutConsent: 0, agreement: { acceptedBy: "Dr. b Santos", method: "online" } });
    // #23: the acceptance is the new clinic's first audited event (review L4).
    expect(platform.tenants[made.overview.account.id]!.auditEvents).toEqual([expect.objectContaining({ record: "Terms and DPA (accepted)", actorName: "Dr. b Santos" })]);
  });

  it("needs 'signed agreement on file' and its date for a clinic made in the console", async () => {
    asOperator();
    const base = { ...form("c"), payment: { method: "bank_transfer", paidOn: "2026-10-13" }, signedOn: "2026-10-01" };
    const create = (data: unknown) => api("/operator/accounts", CreateAccountResult, { method: "POST", body: signupFormData(data) });
    expect(await status(create(base))).toBe(400);
    const made = await create({ ...base, signedOnFile: true });
    expect(made.overview.privacy.agreement).toMatchObject({ method: "on_file", signedOn: "2026-10-01", acceptedBy: "Dr. c Santos" });
  });
});

describe("parent consent (privacy #12–#18)", () => {
  const child: RegisterPatientInput = {
    firstName: "Lia",
    lastName: "Domingo",
    birthDate: "2021-03-04",
    sex: "female",
    address: "",
    guardians: [{ id: "g_privacy_mother", fullName: "Joy Domingo", relationship: "Mother", phone: "09170001234", isPrimary: true }],
    emergencyContact: { name: "", phone: "" },
    allergies: [],
    medicalConditions: [],
    medications: [],
    alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: "g_privacy_mother", photos: false, reminders: true, confirmed: true },
  };
  const meta = (type: string) => ({ type, takenOn: "2026-10-13", caption: "", ...(type === "intraoral" && { tooth: 74 }) });
  const upload = (patientId: string, type: string) => {
    const body = new FormData();
    body.set("file", new Blob(["fake-jpeg"], { type: "image/jpeg" }));
    body.set("meta", JSON.stringify(meta(type)));
    return api(`/patients/${patientId}/photos`, ClinicalPhoto, { method: "POST", body });
  };
  let id = "";

  it("refuses a child without the consent, and records who, when and which versions", async () => {
    asStaff("staff_cruz");
    expect(await status(api("/patients", Patient, send("POST", { ...child, privacyConsent: undefined })))).toBe(400);
    expect(await status(api("/patients", Patient, send("POST", { ...child, privacyConsent: { ...child.privacyConsent, confirmed: false } })))).toBe(400);
    expect(await status(api("/patients", Patient, send("POST", { ...child, privacyConsent: { ...child.privacyConsent, guardianId: "g_stranger" } })))).toBe(400);
    const p = await api("/patients", Patient, send("POST", child));
    id = p.id;
    expect(p.privacyConsent).toMatchObject({ guardianName: "Joy Domingo", relationship: "Mother", recordedByName: "Liza Cruz", noticeVersion: 1, formVersion: LEGAL_DOCUMENTS.consent.version });
    expect(p.privacyChoices).toEqual([expect.objectContaining({ photos: false, reminders: true, by: "staff" })]);
    expect(db.auditEvents.some((e) => e.record === "Privacy consent" && e.patientId === id)).toBe(true);
  });

  it("refuses clinical photos the family declined, but not X-rays (P14)", async () => {
    asStaff("staff_reyes");
    await expect(upload(id, "intraoral")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("declined clinical photos") });
    expect((await upload(id, "xray")).type).toBe("xray");
  });

  it("keeps every change, sends nothing once reminders are off, and lets the parent change their own child only", async () => {
    asStaff("staff_cruz");
    const changed = await api(`/patients/${id}/privacy-choices`, PatientView, send("POST", { photos: true, reminders: false }));
    expect(changed.privacyChoices).toHaveLength(2);
    expect(db.auditEvents.some((e) => e.record === "Privacy consent (changed)" && e.patientId === id)).toBe(true);
    const booking = { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-05-06T01:00:00.000Z", durationMin: 30, reason: "Check-up" };
    await api("/appointments", Appointment, send("POST", booking));
    expect(await api(`/messages?patientId=${id}`, z.array(Message))).toEqual([]);
    asStaff("staff_reyes");
    expect((await upload(id, "intraoral")).type).toBe("intraoral"); // photos are back on

    // A new family's guardian signs in once invited (B11): open her portal account as an accepted invite would.
    db.portalAccounts.push({ clinicId: "clinic_demo", guardianId: "g_privacy_mother", state: "active", links: [] });
    cookies("pd_session=demo.clinic_demo.guardian.g_privacy_mother");
    const byParent = await api(`/patients/${id}/privacy-choices`, PatientView, send("POST", { photos: true, reminders: true }));
    expect(byParent.privacyChoices![2]).toMatchObject({ by: "parent", byName: "Joy Domingo", reminders: true });
    expect(await status(api("/patients/patient_sibling/privacy-choices", PatientView, send("POST", { photos: false, reminders: false })))).toBe(403);
  });

  it("merges a one-key change onto the record, so a stale screen can't re-grant a declined consent (review M2)", async () => {
    asStaff("staff_cruz");
    await api(`/patients/${id}/privacy-choices`, PatientView, send("POST", { photos: false })); // the family says no to photos
    const after = await api(`/patients/${id}/privacy-choices`, PatientView, send("POST", { reminders: true })); // another screen, older copy
    expect(after.privacyChoices!.at(-1)).toMatchObject({ photos: false, reminders: true });
    expect(await status(api(`/patients/${id}/privacy-choices`, PatientView, send("POST", {})))).toBe(400);
  });

  it("withdraws reminders already queued when the family says no (#14, review M1)", async () => {
    asStaff("staff_cruz");
    const booking = { patientId: id, dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-06-03T01:00:00.000Z", durationMin: 30, reason: "Check-up" };
    await api("/appointments", Appointment, send("POST", booking));
    const queued = () => db.messages.filter((m) => m.patientId === id && m.status === "queued").length;
    expect(queued()).toBeGreaterThan(0);
    await api(`/patients/${id}/privacy-choices`, PatientView, send("POST", { reminders: false }));
    expect(queued()).toBe(0);
  });

  it("records consent once for a child registered before chunk 24 (#18)", async () => {
    asStaff("staff_cruz");
    const legacy = platform.tenants.clinic_demo!.patients[5]!;
    const body = { guardianId: legacy.guardians[0]!.id, photos: true, reminders: true, confirmed: true };
    const done = await api(`/patients/${legacy.id}/privacy-consent`, PatientView, send("POST", body));
    expect(done.privacyConsent?.recordedByName).toBe("Liza Cruz");
    expect(await status(api(`/patients/${legacy.id}/privacy-consent`, PatientView, send("POST", body)))).toBe(409);
  });
});

describe("notices and acknowledgements (privacy #9, #20, #21, #23)", () => {
  const parentLogin = () => api("/auth/login", Session, send("POST", { email: "parent@gmail.com", password: DEMO_PASSWORD }));

  it("shows a parent the notice once, saves the acknowledgement, and asks again for a new version", async () => {
    cookies();
    const first = await parentLogin();
    expect(first.user.mustAcknowledge).toBe("notice");
    cookies(`pd_session=${first.token}`);
    const prompt = await api("/auth/acknowledgement", AcknowledgementPrompt);
    expect(prompt).toMatchObject({ kind: "notice", version: 1, contact: { name: "Dr. Paolo Villanueva" } });
    expect(prompt.children).toHaveLength(2);
    expect(await status(api("/auth/acknowledgement", Session, send("POST", { kind: "notice", version: 2 })))).toBe(409);
    const after = await api("/auth/acknowledgement", Session, send("POST", { kind: "notice", version: 1 }));
    expect(after.user.mustAcknowledge).toBeUndefined();
    expect(db.acknowledgements.some((a) => a.kind === "notice" && a.accountId === first.user.id && a.version === 1)).toBe(true);
    expect(db.auditEvents.some((e) => e.record === "Privacy notice (acknowledged)" && e.actorId === first.user.id)).toBe(true);
    cookies();
    expect((await parentLogin()).user.mustAcknowledge).toBeUndefined(); // once

    asStaff("staff_reyes");
    const edit = { body: "We look after your child's records.\n\nAsk us anything.", contactName: "Liza Cruz", contactEmail: "privacy@bulilit.demo" };
    expect(await status(api("/clinic/privacy-notice", PrivacyNoticeView, send("PUT", edit)))).toBe(403); // the Owner's
    asStaff("staff_villanueva");
    expect((await api("/clinic/privacy-notice", PrivacyNoticeView, send("PUT", edit))).version).toBe(2);
    cookies();
    expect((await parentLogin()).user.mustAcknowledge).toBe("notice"); // a new version asks again
    cookies();
    expect((await api("/legal/notices/clinic_demo", PrivacyNoticeView)).contactEmail).toBe("privacy@bulilit.demo"); // public
  });

  it("stops only the Owner when the Terms change, until they accept (#9)", async () => {
    const agreement = latestFor("clinic_demo")!;
    platform.agreements.push({ ...agreement, termsVersion: LEGAL_DOCUMENTS.terms.version - 1 });
    asStaff("staff_villanueva");
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 403, message: "Accept Primolar's updated terms to continue" });
    asStaff("staff_delacruz");
    expect((await api("/patients", z.array(Patient))).length).toBeGreaterThan(0); // other staff keep working
    asStaff("staff_villanueva");
    expect((await api("/auth/acknowledgement", AcknowledgementPrompt)).kind).toBe("terms");
    const fresh = await api("/auth/acknowledgement", Session, send("POST", { kind: "terms", version: LEGAL_DOCUMENTS.terms.version }));
    expect(fresh.user.mustAcknowledge).toBeUndefined();
    expect(latestFor("clinic_demo")).toMatchObject({ method: "online", acceptedBy: "Dr. Paolo Villanueva", termsVersion: LEGAL_DOCUMENTS.terms.version });
    expect(db.auditEvents.some((e) => e.record === "Terms and DPA (accepted)")).toBe(true);
  });

  it("asks a staff login to acknowledge confidentiality once per version (#21)", async () => {
    const demo = platform.tenants.clinic_demo!;
    demo.acknowledgements = demo.acknowledgements.filter((a) => a.accountId !== "staff_reyes");
    asStaff("staff_reyes");
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 403, message: "Acknowledge patient confidentiality to continue" });
    const prompt = await api("/auth/acknowledgement", AcknowledgementPrompt);
    expect(prompt.paragraphs[0]).toContain("every access is logged");
    await api("/auth/acknowledgement", Session, send("POST", { kind: "confidentiality", version: prompt.version }));
    expect((await api("/patients", z.array(z.unknown()))).length).toBeGreaterThan(0); // a dentist sees no contacts, so not the full Patient shape
  });
});

// Twins of apps/api/test/int/privacy-operations.int.test.ts (identical titles: the port ledger). Last: they only add rows.
describe("copy of records and the audit log (B13c2a)", () => {
  const exportOf = (id: string) => api(`/patients/${id}/exports`, RecordsCopy, send("POST"));
  const demo = () => platform.tenants.clinic_demo!;
  const parentId = () => `guardian.${demo().patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id}`;

  it("gives staff a copy of the child's whole record, signed notes only, audited as an export", async () => {
    asStaff("staff_villanueva");
    const child = demo().patients.find((p) => demo().notes.some((n) => n.patientId === p.id && n.signedAt))!;
    const copy = await exportOf(child.id);
    expect(copy).toMatchObject({ kind: "primolar.records-copy", omitted: [], patient: { id: child.id } });
    expect(copy.notes!.every((n) => n.signedAt)).toBe(true);
    expect(demo().auditEvents.filter((e) => e.patientId === child.id && e.record === "Copy of records" && e.action === "export")).toHaveLength(1);
  });

  it("leaves guardian contacts and the message log out of a dentist's copy", async () => {
    asStaff("staff_reyes");
    const copy = await exportOf("patient_sibling");
    expect(copy.omitted).toEqual(["messages"]);
    expect(copy.patient.guardians.every((g) => g.phone === undefined)).toBe(true);
  });

  it("gives a parent their own child's copy without clinical sections, and refuses another family's", async () => {
    asStaff(parentId());
    const copy = await exportOf("patient_sibling");
    expect(copy.omitted).toEqual(["visits", "chart", "notes", "growth", "documents"]);
    expect(copy.photos!.every((p) => p.uploadedBy === "parent")).toBe(true);
    const other = demo().patients.find((p) => !p.guardians.some((g) => `guardian.${g.id}` === parentId()))!;
    await expect(exportOf(other.id)).rejects.toMatchObject({ status: 403, message: "This isn't one of your children's records" });
  });

  it("lists the clinic's audit trail newest first, a page at a time, filtered by action and person, naming the child", async () => {
    asStaff("staff_cruz");
    await api("/patients/patient_sibling", PatientView);
    asStaff("staff_villanueva");
    const first = await api("/audit-log?limit=2", AuditLogPage);
    expect(first.entries).toHaveLength(2);
    expect(first.entries[0]!.at >= first.entries[1]!.at).toBe(true);
    const second = await api(`/audit-log?limit=2&before=${encodeURIComponent(first.next!)}`, AuditLogPage);
    expect(second.entries.map((e) => e.id)).not.toContain(first.entries[0]!.id);
    const views = await api("/audit-log?action=view&actorId=staff_cruz", AuditLogPage);
    expect(views.entries.every((e) => e.action === "view" && e.actorId === "staff_cruz")).toBe(true);
    const sibling = demo().patients.find((p) => p.id === "patient_sibling")!;
    expect(views.entries.find((e) => e.patientId === "patient_sibling")!.patientName).toBe(`${sibling.firstName} ${sibling.lastName}`);
    expect(await status(api("/audit-log?before=nonsense", AuditLogPage))).toBe(400);
  });

  it("shows the audit trail only to the Owner and admins, and logs that it was read", async () => {
    for (const id of ["staff_cruz", "staff_reyes", parentId()]) {
      asStaff(id);
      expect(await status(api("/audit-log", AuditLogPage))).toBe(403);
    }
    asStaff("staff_delacruz");
    expect(await status(api("/audit-log", AuditLogPage))).toBe(200);
    expect(demo().auditEvents.some((e) => e.record === "Audit log" && e.action === "view")).toBe(true);
  });
});

// B13c2b: last in the file. These cases add requests and restrict one child; nothing after depends on the seed.
describe("privacy requests and erasure (B13c2b)", () => {
  const demo = () => platform.tenants.clinic_demo!;
  const child = () => demo().patients[0]!;
  const logOne = (body: Record<string, unknown>) =>
    api("/privacy-requests", PrivacyRequest, send("POST", { kind: "access", requesterName: "Maria Santos", relationship: "Mother", channel: "in_person", receivedOn: today(), ...body }));
  const UPCOMING = ["booked", "confirmed", "arrived", "in_chair"];
  const activeLogin = (guardianId: string) => demo().portalAccounts.some((a) => a.guardianId === guardianId && a.state === "active");
  // As the API twin: guardians with no other child, one with an active portal login, no upcoming appointment, no pending request.
  const lone = () => {
    const now = new Date().toISOString();
    return demo().patients.find((p) => !p.restrictedAt && p.guardians.every((g) => childrenOf(demo(), g.id).length === 1)
      && p.guardians.some((g) => activeLogin(g.id))
      && !demo().appointments.some((a) => a.patientId === p.id && a.startsAt >= now && UPCOMING.includes(a.status))
      && !demo().appointmentRequests.some((r) => r.patientId === p.id && r.status === "pending"))!;
  };
  let restricted: { id: string; firstName: string; parent: string };

  it("logs a request with its deadline in working days, for the Owner and admins only", async () => {
    asStaff("staff_villanueva");
    const r = await logOne({ patientId: child().id });
    expect(r).toMatchObject({ status: "open", dueOn: addWorkingDays(today(), 15), patientName: `${child().firstName} ${child().lastName}`, loggedByName: expect.any(String) });
    asStaff("staff_delacruz");
    await logOne({ kind: "objection", requesterName: "A parent" }); // no child: a general objection
    for (const id of ["staff_cruz", "staff_reyes"]) {
      asStaff(id);
      expect(await status(api("/privacy-requests", PrivacyRequest, send("POST")))).toBe(403);
    }
    expect(await status(api("/privacy-requests", PrivacyRequestPage))).toBe(403);
    expect(demo().auditEvents.filter((e) => e.record === "Privacy request" && e.action === "create")).toHaveLength(2);
  });

  it("refuses an erasure request without a child, and a day after today", async () => {
    asStaff("staff_villanueva");
    expect(await status(api("/privacy-requests", PrivacyRequest, send("POST", { kind: "erasure", requesterName: "X", channel: "letter", receivedOn: today() })))).toBe(400);
    const late = api("/privacy-requests", PrivacyRequest, send("POST", { kind: "access", requesterName: "X", channel: "letter", receivedOn: addWorkingDays(today(), 1) }));
    await expect(late).rejects.toMatchObject({ status: 409, message: "The day it was received can't be after today" });
  });

  it("lists open requests soonest due first, with the child's name", async () => {
    asStaff("staff_villanueva");
    await logOne({ receivedOn: "2026-01-05", requesterName: "Earliest" }); // overdue on any later day
    asStaff("staff_delacruz");
    const page = await api("/privacy-requests", PrivacyRequestPage);
    expect(page.requests[0]!.requesterName).toBe("Earliest");
    expect(page.requests.map((r) => r.dueOn)).toEqual([...page.requests.map((r) => r.dueOn)].sort());
    expect(page.requests.find((r) => r.patientId === child().id)?.patientName).toBe(`${child().firstName} ${child().lastName}`);
    expect(page.next).toBeUndefined();
  });

  it("closes a request once, with its outcome, and pages the closed ones newest first", async () => {
    asStaff("staff_villanueva");
    const open = (await api("/privacy-requests", PrivacyRequestPage)).requests;
    for (const r of open) await api(`/privacy-requests/${r.id}/close`, PrivacyRequest, send("POST", { status: "done", outcome: "Copy given in person" }));
    expect(await status(api(`/privacy-requests/${open[0]!.id}/close`, PrivacyRequest, send("POST", { status: "declined", outcome: "x" })))).toBe(409);
    const first = await api("/privacy-requests?status=closed&limit=2", PrivacyRequestPage);
    expect(first.requests).toHaveLength(2);
    expect(first.requests[0]!.closedAt! >= first.requests[1]!.closedAt!).toBe(true);
    const rest = await api(`/privacy-requests?status=closed&limit=2&before=${encodeURIComponent(first.next!)}`, PrivacyRequestPage);
    expect(rest.requests.map((r) => r.id)).not.toContain(first.requests[0]!.id);
    expect((await api("/privacy-requests", PrivacyRequestPage)).requests).toEqual([]);
  });

  it("won't approve an erasure while the child has an upcoming appointment", async () => {
    asStaff("staff_villanueva");
    const busy = demo().appointments.find((a) => a.startsAt >= new Date().toISOString() && a.status === "booked")!;
    const r = await logOne({ kind: "erasure", patientId: busy.patientId });
    const approve = api(`/privacy-requests/${r.id}/close`, PrivacyRequest, send("POST", { status: "done", outcome: "Approved" }));
    await expect(approve).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/upcoming appointments first$/) });
    expect(demo().patients.find((p) => p.id === busy.patientId)!.restrictedAt).toBeUndefined();
    await api(`/privacy-requests/${r.id}/close`, PrivacyRequest, send("POST", { status: "declined", outcome: "Still in treatment" }));
  });

  it("restricts the record when an erasure is approved: hidden from lists, refused to front desk, readable by the Owner", async () => {
    const p = lone();
    restricted = { id: p.id, firstName: p.firstName, parent: `guardian.${p.guardians.find((g) => activeLogin(g.id))!.id}` };
    cookies(`pd_session=demo.clinic_demo.${restricted.parent}`);
    expect(await status(api("/auth/me", SessionUser))).toBe(200); // the parent's session works before
    asStaff("staff_villanueva");
    const r = await logOne({ kind: "erasure", patientId: p.id });
    asStaff("staff_delacruz");
    await api(`/privacy-requests/${r.id}/close`, PrivacyRequest, send("POST", { status: "done", outcome: "Restricted; anonymised when retention ends" }));
    asStaff("staff_cruz");
    await expect(api(`/patients/${p.id}`, PatientView)).rejects.toMatchObject({ status: 403, message: "This child's record is restricted after a privacy request. Ask the clinic's Owner." });
    const list = await api(`/patient-summaries?q=${encodeURIComponent(p.firstName)}&page=1&pageSize=50`, PatientPage);
    expect(list.rows.map((x) => x.id)).not.toContain(p.id);
    asStaff("staff_villanueva");
    expect((await api(`/patients/${p.id}`, PatientView)).restrictedAt).toEqual(expect.any(String));
    expect(demo().auditEvents.filter((e) => e.patientId === p.id && e.record === "Patient record (restricted)" && e.action === "denied")).toHaveLength(1);
  });

  it("turns photos and reminders off and takes the child out of the parent's portal", async () => {
    asStaff("staff_villanueva");
    const record = await api(`/patients/${restricted.id}`, PatientView);
    expect(record.privacyChoices!.at(-1)).toMatchObject({ photos: false, reminders: false, by: "staff" });
    expect(demo().messages.filter((m) => m.patientId === restricted.id && m.status === "queued")).toHaveLength(0);
    cookies(`pd_session=demo.clinic_demo.${restricted.parent}`);
    expect(await status(api("/auth/me", SessionUser))).toBe(401); // no child left: the session is no login any more
  });

  it("won't book a restricted child, and leaves them off the due list", async () => {
    // An open recall for the child, as a signed note would make it: without the filter, the due list offers its Book.
    demo().dueItems.push({ id: "due_restricted", clinicId: "clinic_demo", patientId: restricted.id, ruleId: "recall_restricted", kind: "recall", procedure: "D1120", dueOn: today(), sourceNoteId: "note_restricted_due", createdAt: new Date().toISOString() });
    asStaff("staff_cruz");
    expect((await api("/due-items", z.array(DueItem))).map((i) => i.patientId)).not.toContain(restricted.id);
    const startsAt = `${addWorkingDays(today(), 2)}T02:00:00.000Z`;
    const book = api("/appointments", Appointment, send("POST", { patientId: restricted.id, dentistId: "staff_reyes", chairId: "chair_3", startsAt, durationMin: 30, reason: "Check-up" }));
    await expect(book).rejects.toMatchObject({ status: 409, message: RESTRICTED_BOOKING_MESSAGE });
  });
});
