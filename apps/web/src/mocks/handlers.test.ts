import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { addDays, addMonths, format, setHours, setMinutes, startOfDay, startOfMonth, subDays, subYears } from "date-fns";
import {
  Appointment,
  AppointmentRequest,
  ChartEntry,
  ClinicalNote,
  ClinicalPhoto,
  DemoAccounts,
  DuplicateMatch,
  DueItem,
  FinanceSummary,
  GrowthRecord,
  Invoice,
  Message,
  MessageTemplate,
  NoteTemplate,
  Patient,
  Payment,
  PatientDocument,
  PatientHeaderSummary,
  PatientPage,
  PatientView,
  PlanItem,
  Procedure,
  Session,
  SessionUser,
  TodaySummary,
  Visit,
  accountSummary,
  deriveChart,
  dueBucket,
  findConflict,
  inStatusGroup,
  habitTimeline,
  invoiceBalance,
  invoiceTotal,
  depositBalance,
  isClosedWeekday,
  isMoneyIn,
  pesos,
  planProgress,
  reminderSendAt,
  surfacesFor,
  type CreatePatientInput,
} from "@pedia/shared";
import { api, ApiError } from "@/lib/api-client";
import { db } from "./db";
import { handlers } from "./handlers";

/**
 * Exercises the handlers through the real api() client, so every response passes its shared schema.
 * Signed in through the session cookie, as the browser is (mocks/access.ts); admin unless a test says.
 */
const server = setupServer(...handlers);
const ADMIN = "demo.staff_delacruz";
const signIn = (token: string | null) => vi.stubGlobal("document", { cookie: token ? `pd_session=${token}` : "" });
beforeAll(() => {
  signIn(ADMIN);
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("clinic reference data", () => {
  it("serves the procedure catalog in the shared schema", async () => {
    const procedures = await api("/procedures", z.array(Procedure));
    expect(procedures.map((p) => p.code)).toEqual(expect.arrayContaining(["oral_exam", "extraction", "pulpotomy"]));
  });
});

const newPatient: CreatePatientInput = {
  firstName: "Bea",
  lastName: "Mendoza",
  birthDate: "2020-07-02",
  sex: "female",
  address: "",
  guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
  emergencyContact: { name: "", phone: "" },
  allergies: ["Latex"],
  medicalConditions: [],
  medications: [],
  alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
};
const send = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) });

describe("patients", () => {
  it("finds a patient by child name, guardian name or guardian phone", async () => {
    const created = await api("/patients", Patient, send("POST", newPatient));
    for (const q of ["bea mend", "Rosa Mendoza", "0917 123 4567", "1234567", "Mendoza Rosa", "Bea R", "0917-123-4567"]) {
      const found = await api(`/patients?q=${encodeURIComponent(q)}`, z.array(Patient));
      expect(found.map((p) => p.id)).toContain(created.id);
    }
    const none = await api(`/patients?q=${encodeURIComponent("Bea Zz")}`, z.array(Patient));
    expect(none.map((p) => p.id)).not.toContain(created.id);
  });

  it("creates a patient that can be read back", async () => {
    const created = await api("/patients", Patient, send("POST", newPatient));
    expect(created.consents).toEqual([]);
    expect(await api(`/patients/${created.id}`, Patient)).toEqual(created);
  });

  it("records the medical answers, and refuses an answer that contradicts the lists", async () => {
    await expect(api("/patients", Patient, send("POST", { ...newPatient, noKnownAllergies: true }))).rejects.toMatchObject({ status: 400 });
    const created = await api("/patients", Patient, send("POST", { ...newPatient, noKnownAllergies: false, noKnownConditions: true }));
    expect(created).toMatchObject({ noKnownAllergies: false, noKnownConditions: true });
  });

  it("rejects a patient without exactly one primary guardian", async () => {
    const noPrimary = { ...newPatient, guardians: [{ ...newPatient.guardians[0], isPrimary: false }] };
    await expect(api("/patients", Patient, send("POST", noPrimary))).rejects.toMatchObject({ status: 400 });
  });

  it("updates the profile but keeps consents, and won't drop a guardian who consented", async () => {
    const created = await api("/patients", Patient, send("POST", newPatient));
    const consented = await api(
      `/patients/${created.id}/consents`,
      Patient,
      send("POST", { guardianId: "g_mother", scope: "extraction", date: "2026-10-02" }),
    );
    expect(consented.consents).toHaveLength(1);

    const updated = await api(`/patients/${created.id}`, Patient, send("PUT", { ...newPatient, allergies: [] }));
    expect(updated.allergies).toEqual([]);
    expect(updated.consents).toHaveLength(1);

    const father = { id: "g_father", fullName: "Jun Mendoza", relationship: "Father", phone: "09181234567", isPrimary: true };
    const err = await api(`/patients/${created.id}`, Patient, send("PUT", { ...newPatient, guardians: [father] })).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
  });

  it("rejects a consent from someone who isn't this child's guardian", async () => {
    const created = await api("/patients", Patient, send("POST", newPatient));
    const consent = { guardianId: "g_stranger", scope: "extraction", date: "2026-10-02" };
    await expect(api(`/patients/${created.id}/consents`, Patient, send("POST", consent))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("numbers new patients and tidies all-lower names", async () => {
    const a = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "juan", lastName: "dela cruz" }));
    const b = await api("/patients", Patient, send("POST", newPatient));
    expect(a.firstName).toBe("Juan");
    expect(a.lastName).toBe("Dela Cruz");
    expect(Number(b.patientNo.slice(3))).toBe(Number(a.patientNo.slice(3)) + 1);
    const edited = await api(`/patients/${a.id}`, Patient, send("PUT", { ...newPatient, nickname: "Jun" }));
    expect(edited.patientNo).toBe(a.patientNo); // PUT never renumbers
  });

  it("quick-updates phone, nickname, tags and alerts, and the phone follows the guardian to siblings", async () => {
    const g = { ...newPatient.guardians[0], id: "g_quick" };
    const older = await api("/patients", Patient, send("POST", { ...newPatient, guardians: [g] }));
    const younger = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "Mia", guardians: [g] }));
    const input = { phone: "09998887777", nickname: "Bebe", tags: ["Anxious"], alerts: ["Strong gag reflex"] };
    const updated = await api(`/patients/${older.id}`, Patient, send("PATCH", input));
    expect(updated).toMatchObject({ nickname: "Bebe", tags: ["Anxious"], alerts: ["Strong gag reflex"] });
    expect((await api(`/patients/${younger.id}`, Patient)).guardians[0].phone).toBe("09998887777");
  });

  it("lets a dentist quick-update everything but the phone", async () => {
    const p = await api("/patients", Patient, send("POST", newPatient));
    signIn("demo.staff_reyes");
    try {
      const ok = await api(`/patients/${p.id}`, PatientView, send("PATCH", { nickname: "Bebe", tags: [], alerts: [] }));
      expect(ok.nickname).toBe("Bebe");
      await expect(api(`/patients/${p.id}`, Patient, send("PATCH", { phone: "09998887777", tags: [], alerts: [] }))).rejects.toMatchObject({ status: 403 });
    } finally {
      signIn(ADMIN);
    }
  });

  it("refuses a computed label or a repeated tag", async () => {
    const p = await api("/patients", Patient, send("POST", newPatient));
    const base = { phone: "09171234567", tags: [], alerts: [] };
    await expect(api(`/patients/${p.id}`, Patient, send("PATCH", { ...base, tags: ["Balance due"] }))).rejects.toMatchObject({ status: 400 });
    await expect(api(`/patients/${p.id}`, Patient, send("PATCH", { ...base, tags: ["HMO", "hmo"] }))).rejects.toMatchObject({ status: 400 });
  });

  it("warns about a child already registered with the same name and birth date", async () => {
    await api("/patients", Patient, send("POST", newPatient));
    const q = new URLSearchParams({ firstName: "BEA", lastName: "mendoza", birthDate: newPatient.birthDate });
    const raw = await (await fetch(`${process.env.NEXT_PUBLIC_API_URL}/patient-duplicates?${q}`)).json();
    expect(raw.length).toBeGreaterThan(0);
    expect(JSON.stringify(raw)).not.toContain("09171234567"); // no phones in the match
    q.set("birthDate", "2019-01-01");
    expect(await api(`/patient-duplicates?${q}`, z.array(DuplicateMatch))).toEqual([]);
  });

  it("summarises number, last visit, balance and credit", async () => {
    const p = await api("/patients", Patient, send("POST", newPatient));
    const empty = await api(`/patients/${p.id}/summary`, PatientHeaderSummary);
    expect(empty).toEqual({ patientId: p.id, patientNo: p.patientNo, balance: 0, credit: 0, siblings: expect.any(Array) });
    const visit = await api(`/patients/${p.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    expect((await api(`/patients/${p.id}/summary`, PatientHeaderSummary)).lastVisitOn).toBe(visit.date);
  });

  it("names siblings in the header summary, computed by the server, for a dentist too", async () => {
    const g = { ...newPatient.guardians[0], id: "g_header_sib", phone: "09175550101" };
    const older = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "Ana", guardians: [g] }));
    const younger = await api("/patients", Patient, send("POST", { ...newPatient, firstName: "Lia", guardians: [g] }));
    signIn("demo.staff_reyes");
    try {
      const s = await api(`/patients/${older.id}/summary`, PatientHeaderSummary);
      expect(s.siblings).toEqual([{ id: younger.id, firstName: "Lia" }]);
    } finally {
      signIn(ADMIN);
    }
  });

  const withContacts = {
    ...newPatient,
    address: "12 Mabini St, Quezon City",
    emergencyContact: { name: "Lola Mendoza", phone: "09180001111" },
    guardians: [{ ...newPatient.guardians[0], email: "rosa@example.com" }],
  };

  it("sends a dentist no guardian phone, email, emergency contact or address, from any patient endpoint", async () => {
    const p = await api("/patients", Patient, send("POST", withContacts));
    signIn("demo.staff_reyes");
    try {
      const responses = [
        await api(`/patients/${p.id}`, PatientView),
        ...(await api(`/patients?q=${encodeURIComponent("Bea Mendoza")}`, z.array(PatientView))),
        await api(`/patients/${p.id}`, PatientView, send("PATCH", { nickname: "Bebe", tags: [], alerts: [] })),
        await api(`/patients/${p.id}/consents`, PatientView, send("POST", { guardianId: "g_mother", scope: "radiographs", date: "2026-10-04" })),
        await api("/patients", PatientView, send("POST", withContacts)), // even what they just typed
      ];
      expect(JSON.stringify(responses)).not.toMatch(/0917|0918|Mabini|example\.com|Lola/);
    } finally {
      signIn(ADMIN);
    }
    signIn("demo.staff_cruz"); // front desk still gets everything, in the strict shape
    try {
      expect(await api(`/patients/${p.id}`, Patient)).toMatchObject({ address: withContacts.address, emergencyContact: withContacts.emergencyContact });
    } finally {
      signIn(ADMIN);
    }
  });

  it("keeps the stored contacts when a dentist saves a profile they were sent without them", async () => {
    const p = await api("/patients", Patient, send("POST", withContacts));
    signIn("demo.staff_reyes");
    try {
      const seen = await api(`/patients/${p.id}`, PatientView);
      await api(`/patients/${p.id}`, PatientView, send("PUT", { ...seen, allergies: ["Latex", "Penicillin"] }));
      // Contacts sent anyway are stripped, not stored.
      const forged = { ...seen, allergies: ["Latex", "Penicillin"], address: "Elsewhere", guardians: seen.guardians.map((g) => ({ ...g, phone: "09990000000" })) };
      await api(`/patients/${p.id}`, PatientView, send("PUT", forged));
      // A new guardian needs a phone, which only front desk and admin can give.
      const uncle = { id: "g_uncle", fullName: "Tito Mendoza", relationship: "Uncle", isPrimary: false };
      await expect(api(`/patients/${p.id}`, PatientView, send("PUT", { ...seen, guardians: [...seen.guardians, uncle] }))).rejects.toMatchObject({ status: 403 });
    } finally {
      signIn(ADMIN);
    }
    const after = await api(`/patients/${p.id}`, Patient);
    expect(after.allergies).toEqual(["Latex", "Penicillin"]);
    expect(after).toMatchObject({ address: withContacts.address, emergencyContact: withContacts.emergencyContact });
    expect(after.guardians).toEqual([expect.objectContaining({ phone: "09171234567", email: "rosa@example.com" })]);
  });

  it("stores, serves and removes the child's photo", async () => {
    const p = await api("/patients", Patient, send("POST", newPatient));
    const body = new FormData();
    body.set("file", new Blob(["fake-jpeg"], { type: "image/jpeg" }));
    const withPhoto = await api(`/patients/${p.id}/photo`, Patient, { method: "PUT", body });
    expect(withPhoto.photoUpdatedAt).toBeDefined();
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/patients/${p.id}/photo`);
    expect(res.headers.get("content-disposition")).toContain("mendoza-bea-photo.jpg");
    const removed = await api(`/patients/${p.id}/photo`, Patient, { method: "DELETE" });
    expect(removed.photoUpdatedAt).toBeUndefined();
    expect((await fetch(`${process.env.NEXT_PUBLIC_API_URL}/patients/${p.id}/photo`)).status).toBe(404);
  });
});

describe("patient list", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const page = (qs = "") => api(`/patient-summaries?today=${today}${qs}`, PatientPage);
  const everyRow = async (qs = "") => {
    const first = await page(`${qs}&pageSize=100`);
    return first.rows;
  };

  it("pages with a total, and clamps a page past the end", async () => {
    const p1 = await page("&pageSize=20");
    expect(p1.rows).toHaveLength(20);
    expect(p1.total).toBe(db.patients.length); // admin sees everyone; earlier tests added a few Beas
    const last = await page("&pageSize=20&page=99");
    expect(last.page).toBe(Math.ceil(p1.total / 20));
    expect(last.rows.length).toBeGreaterThan(0);
  });

  it("counts every filter, and each filter returns exactly its count", async () => {
    const { counts } = await page();
    for (const filter of ["needs_attention", "recent_visit", "balance_due", "recall_due"] as const) {
      expect((await page(`&filter=${filter}&pageSize=100`)).total, filter).toBe(counts[filter]);
      expect(counts[filter], filter).toBeGreaterThan(0);
      expect(counts[filter], filter).toBeLessThan(counts.all); // no label flags everyone
    }
  });

  it("balances agree with the financial dashboard: same patients, same total", async () => {
    const report = await api(`/reports/finance?today=${today}`, FinanceSummary);
    const owing = (await everyRow("&filter=balance_due")).map((r) => [r.id, r.balance] as const);
    expect(new Map(owing)).toEqual(new Map(report.outstanding.map((o) => [o.patientId, o.balance])));
  });

  it("recall due matches the /recall overdue and this-week items", async () => {
    const due = (await api("/due-items", z.array(DueItem))).filter((i) => ["overdue", "this_week"].includes(dueBucket(i.dueOn, today) ?? ""));
    const flagged = (await everyRow("&filter=recall_due")).map((r) => r.id).sort();
    expect(flagged).toEqual([...new Set(due.map((i) => i.patientId))].sort());
  });

  it("sorts by balance and by last visit, stable across pages", async () => {
    const byBalance = await everyRow("&sort=balance");
    expect(byBalance.map((r) => r.balance ?? 0)).toEqual([...byBalance.map((r) => r.balance ?? 0)].sort((a, b) => b - a));
    const p1 = await page("&sort=last_visit&pageSize=10");
    const p2 = await page("&sort=last_visit&pageSize=10&page=2");
    expect(new Set([...p1.rows, ...p2.rows].map((r) => r.id)).size).toBe(20); // no row on two pages
  });

  it("shows guardian phones to front desk, not to a dentist, and phone search only to front desk", async () => {
    const phone = db.patients[0].guardians[0].phone;
    signIn("demo.staff_cruz");
    expect((await page()).rows.every((r) => r.guardianPhone)).toBe(true);
    expect((await page(`&q=${phone}`)).total).toBeGreaterThan(0);
    signIn("demo.staff_reyes");
    expect((await page()).rows.some((r) => r.guardianPhone)).toBe(false);
    expect((await page(`&q=${phone}`)).total).toBe(0);
    signIn(ADMIN);
  });
});

describe("visits", () => {
  it("starts one visit at a time, lists it first, and completes it", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visits = `/patients/${patient.id}/visits`;

    const visit = await api(visits, Visit, send("POST", { dentistId: "staff_reyes" }));
    expect(visit.status).toBe("in_progress");
    await expect(api(visits, Visit, send("POST", { dentistId: "staff_santos" }))).rejects.toMatchObject({ status: 409 });

    const done = await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    expect(done.status).toBe("completed");
    expect(done.completedAt).toBeDefined();

    const next = await api(visits, Visit, send("POST", { dentistId: "staff_santos" }));
    const listed = await api(visits, z.array(Visit));
    expect(listed.map((v) => v.id)).toEqual([next.id, visit.id]);
  });

  it("only lets a dentist run a visit", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    await expect(
      api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_cruz" })),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("seeds only completed visits", async () => {
    const [first] = await api("/patients?q=", z.array(Patient));
    const seeded = await api(`/patients/${first.id}/visits`, z.array(Visit));
    expect(seeded.every((v) => v.status === "completed")).toBe(true);
  });
});

describe("chart", () => {
  it("records one finding on several teeth as one entry each, or none at all", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const chart = `/patients/${patient.id}/chart`;
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));

    const rows = await api(`${chart}/batch`, z.array(ChartEntry), send("POST", { visitId: visit.id, teeth: [74, 84, 75], surfaces: ["O"], condition: "caries" }));
    expect(rows.map((e) => e.tooth)).toEqual([74, 84, 75]);
    const derived = deriveChart(await api(chart, z.array(ChartEntry)));
    expect([74, 84, 75].map((t) => derived.get(t)?.surfaces.O)).toEqual(["caries", "caries", "caries"]);

    // 85 is extracted: the whole batch is refused and 54 gets nothing.
    await api(chart, ChartEntry, send("POST", { visitId: visit.id, tooth: 85, surfaces: [], condition: "extracted" }));
    const before = (await api(chart, z.array(ChartEntry))).length;
    await expect(api(`${chart}/batch`, z.array(ChartEntry), send("POST", { visitId: visit.id, teeth: [54, 85], surfaces: [], condition: "sealant" }))).rejects.toMatchObject({ status: 409 });
    expect(await api(chart, z.array(ChartEntry))).toHaveLength(before);

    // 51 (front) has no occlusal surface, so O on 51 + 74 is refused.
    await expect(api(`${chart}/batch`, z.array(ChartEntry), send("POST", { visitId: visit.id, teeth: [51, 74], surfaces: ["O"], condition: "caries" }))).rejects.toMatchObject({ status: 400 });
  });

  it("serves seeded entries in the shared schema, on surfaces the tooth has", async () => {
    const patients = await api("/patients?q=", z.array(Patient));
    const charts = await Promise.all(patients.map((p) => api(`/patients/${p.id}/chart`, z.array(ChartEntry))));
    const entries = charts.flat();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every((e) => e.surfaces.every((s) => surfacesFor(e.tooth).includes(s)))).toBe(true);
  });

  it("records caries on 74-O, restores it in a later visit, and keeps both in history", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const chart = `/patients/${patient.id}/chart`;
    const visits = `/patients/${patient.id}/visits`;

    const first = await api(visits, Visit, send("POST", { dentistId: "staff_reyes" }));
    await api(chart, ChartEntry, send("POST", { visitId: first.id, tooth: 74, surfaces: ["O"], condition: "caries" }));
    await api(`/visits/${first.id}/complete`, Visit, { method: "POST" });
    const late = { visitId: first.id, tooth: 74, surfaces: ["O"], condition: "restored" };
    await expect(api(chart, ChartEntry, send("POST", late))).rejects.toMatchObject({ status: 409 });

    const second = await api(visits, Visit, send("POST", { dentistId: "staff_santos" }));
    const restored = await api(chart, ChartEntry, send("POST", { ...late, visitId: second.id }));
    expect(restored.recordedBy).toBe("staff_santos");

    const tooth = deriveChart(await api(chart, z.array(ChartEntry))).get(74);
    expect(tooth?.surfaces.O).toBe("restored");
    expect(tooth?.history.map((e) => [e.visitId, e.condition])).toEqual([
      [first.id, "caries"],
      [second.id, "restored"],
    ]);
  });

  it("corrects an entry once, never in place, and rejects impossible findings", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const chart = `/patients/${patient.id}/chart`;
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const wrong = await api(chart, ChartEntry, send("POST", { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "caries" }));

    const fix = { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "sound", supersedes: wrong.id };
    await api(chart, ChartEntry, send("POST", fix));
    await expect(api(chart, ChartEntry, send("POST", fix))).rejects.toMatchObject({ status: 409 });
    await expect(api(chart, ChartEntry, send("POST", { ...fix, tooth: 52 }))).rejects.toMatchObject({ status: 400 });

    const entries = await api(chart, z.array(ChartEntry));
    expect(entries.find((e) => e.id === wrong.id)?.condition).toBe("caries"); // the original is untouched
    expect(deriveChart(entries).get(51)?.surfaces.M).toBe("sound");

    const extraction = { visitId: visit.id, tooth: 85, surfaces: [], condition: "extracted" };
    const extracted = await api(chart, ChartEntry, send("POST", extraction));
    const onGone = { visitId: visit.id, tooth: 85, surfaces: ["O"], condition: "caries" };
    const goneErr = await api(chart, ChartEntry, send("POST", onGone)).catch((e: ApiError) => e);
    expect(goneErr).toMatchObject({ status: 409 });
    expect((goneErr as ApiError).message).toMatch(/extracted or missing/);
    await api(chart, ChartEntry, send("POST", { ...extraction, condition: "sound", supersedes: extracted.id }));
    await api(chart, ChartEntry, send("POST", onGone)); // once the extraction is corrected, the tooth is charted again

    const noSuchSurface = { visitId: visit.id, tooth: 51, surfaces: ["O"], condition: "caries" };
    await expect(api(chart, ChartEntry, send("POST", noSuchSurface))).rejects.toMatchObject({ status: 400 });
    const extractedSurface = { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "extracted" };
    await expect(api(chart, ChartEntry, send("POST", extractedSurface))).rejects.toMatchObject({ status: 400 });
  });
});

describe("notes", () => {
  it("has exactly one template per catalog procedure, so every plan item can be completed", async () => {
    const templates = await api("/note-templates", z.array(NoteTemplate));
    const codes = (await api("/procedures", z.array(Procedure))).map((p) => p.code);
    expect(templates.map((t) => t.procedure).sort()).toEqual([...codes].sort());
  });

  it("signs a pulpotomy note, after which it is read-only", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const draft = {
      visitId: visit.id,
      templateId: "tpl_pulpotomy",
      values: { teeth: [84], medicament: "MTA", hemostasis: true },
      behavior: ["anxious", "needs_parent"],
    };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", draft));
    expect(note.authorId).toBe("staff_reyes");
    expect(note.signedAt).toBeUndefined();

    const edited = { values: { ...draft.values, medicament: "Biodentine" }, behavior: ["cooperative"] };
    expect((await api(`/notes/${note.id}`, ClinicalNote, send("PUT", edited))).values.medicament).toBe("Biodentine");

    const signed = await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    expect(signed.signedAt).toBeDefined();
    await expect(api(`/notes/${note.id}`, ClinicalNote, send("PUT", edited))).rejects.toMatchObject({ status: 409 });
    await expect(api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" })).rejects.toMatchObject({ status: 409 });
  });

  it("explains a rejected note in words, not raw JSON", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const bad = { visitId: visit.id, templateId: "tpl_pulpotomy", values: { teeth: [] }, behavior: [] };
    const err = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", bad)).catch((e: ApiError) => e);
    expect((err as ApiError).message).toBe("Pick at least one tooth. Choose medicament");
  });

  it("rejects values that don't fit the template", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const bad = { visitId: visit.id, templateId: "tpl_pulpotomy", values: { teeth: [], medicament: "MTA" }, behavior: [] };
    await expect(api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", bad))).rejects.toMatchObject({ status: 400 });
  });
});

describe("growth", () => {
  it("shows a habit recorded at one visit and stopped at a later one", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visits = `/patients/${patient.id}/visits`;
    const first = await api(visits, Visit, send("POST", { dentistId: "staff_reyes" }));
    const thumb = { habit: "thumb_sucking", startedOn: "2023-06-01" };
    await api(`/visits/${first.id}/growth`, GrowthRecord, send("PUT", { habits: [thumb, { habit: "pacifier" }] }));
    // Re-saving the same visit replaces its record
    await api(`/visits/${first.id}/growth`, GrowthRecord, send("PUT", { habits: [thumb] }));
    await api(`/visits/${first.id}/complete`, Visit, { method: "POST" });
    await expect(api(`/visits/${first.id}/growth`, GrowthRecord, send("PUT", { habits: [] }))).rejects.toMatchObject({ status: 409 });

    const second = await api(visits, Visit, send("POST", { dentistId: "staff_reyes" }));
    await api(`/visits/${second.id}/growth`, GrowthRecord, send("PUT", { habits: [{ ...thumb, stoppedOn: "2026-09-20" }], speech: "Lisps on /s/" }));

    const records = await api(`/patients/${patient.id}/growth`, z.array(GrowthRecord));
    expect(records.map((r) => r.visitId)).toEqual([first.id, second.id]);
    expect(habitTimeline(records)).toEqual([
      { habit: "thumb_sucking", startedOn: "2023-06-01", stoppedOn: "2026-09-20", visitIds: [first.id, second.id] },
    ]);
  });

  it("rejects a habit that stopped before it started", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const bad = { habits: [{ habit: "bruxism", startedOn: "2026-05-01", stoppedOn: "2026-01-01" }] };
    await expect(api(`/visits/${visit.id}/growth`, GrowthRecord, send("PUT", bad))).rejects.toMatchObject({ status: 400 });
  });
});

describe("treatment plan", () => {
  it("seeds the spec's example plan at 3 of 6 done", async () => {
    const patients = await api("/patients?q=", z.array(Patient));
    const plans = await Promise.all(patients.map((p) => api(`/patients/${p.id}/plan`, z.array(PlanItem))));
    const example = plans.find((items) => items.length === 6)!;
    expect(example.map((i) => [i.procedureCode, i.tooth])).toEqual([
      ["prophylaxis", undefined],
      ["fluoride", undefined],
      ["restoration", 51],
      ["restoration", 74],
      ["restoration", 84],
      ["follow_up", undefined],
    ]);
    expect(planProgress(example)).toEqual({ done: 3, total: 6 });
    expect(example.filter((i) => i.status === "done").every((i) => i.completedNoteId)).toBe(true);
  });

  it("completes the matching items when a note is signed, and only then", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const plan = `/patients/${patient.id}/plan`;
    const add = (procedureCode: string, tooth?: number) => api(plan, PlanItem, send("POST", { procedureCode, tooth, fee: 200000 }));
    const [r74, r84, pulp] = [await add("restoration", 74), await add("restoration", 84), await add("pulpotomy", 75)];
    await expect(add("restoration")).rejects.toMatchObject({ status: 400 }); // per-tooth procedure needs a tooth

    await expect(api(`/plan-items/${r74.id}`, PlanItem, send("PATCH", { status: "done" }))).rejects.toMatchObject({ status: 400 });
    expect((await api(`/plan-items/${r84.id}`, PlanItem, send("PATCH", { status: "in_progress" }))).status).toBe("in_progress");

    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const values = { teeth: [74, 84], material: "Composite" };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", { visitId: visit.id, templateId: "tpl_restoration", values, behavior: [] }));
    expect((await api(plan, z.array(PlanItem))).every((i) => i.status !== "done")).toBe(true); // a draft completes nothing

    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    const items = await api(plan, z.array(PlanItem));
    const byId = (id: string) => items.find((i) => i.id === id)!;
    expect(byId(r74.id)).toMatchObject({ status: "done", completedVisitId: visit.id, completedNoteId: note.id });
    expect(byId(r84.id).status).toBe("done");
    expect(byId(pulp.id).status).toBe("planned");
    await expect(api(`/plan-items/${r74.id}`, PlanItem, send("PATCH", { status: "planned" }))).rejects.toMatchObject({ status: 409 });
  });

  it("completes a follow-up item with a signed follow-up note", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const item = await api(`/patients/${patient.id}/plan`, PlanItem, send("POST", { procedureCode: "follow_up", fee: 50000 }));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const body = { visitId: visit.id, templateId: "tpl_follow_up", values: { healing: "Satisfactory" }, behavior: [] };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", body));
    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    const [done] = await api(`/patients/${patient.id}/plan`, z.array(PlanItem));
    expect(done).toMatchObject({ id: item.id, status: "done", completedNoteId: note.id });
  });
});

describe("appointments", () => {
  // Far from the seeded fortnight around today, so only this test's bookings can clash.
  const slot = { dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-01-07T01:00:00.000Z", durationMin: 30, reason: "Check-up" };
  const status = (id: string, body: unknown) => api(`/appointments/${id}/status`, Appointment, send("POST", body));

  it("refuses a booking outside clinic hours or on a closed day, and a move there", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const early = { ...slot, patientId: patient.id, startsAt: "2030-01-14T23:15:00.000Z" }; // Tue 07:15 Manila
    await expect(api("/appointments", Appointment, send("POST", early))).rejects.toMatchObject({ status: 400 });
    const sunday = { ...slot, patientId: patient.id, startsAt: "2030-01-13T01:00:00.000Z" }; // Sun 9:00
    await expect(api("/appointments", Appointment, send("POST", sunday))).rejects.toMatchObject({ status: 400 });
    const late = { ...slot, patientId: patient.id, startsAt: "2030-01-15T09:45:00.000Z", durationMin: 30 }; // 17:45–18:15
    await expect(api("/appointments", Appointment, send("POST", late))).rejects.toMatchObject({ status: 400 });

    const booked = await api("/appointments", Appointment, send("POST", { ...slot, patientId: patient.id, startsAt: "2030-01-15T01:00:00.000Z" }));
    await expect(api(`/appointments/${booked.id}`, Appointment, send("PUT", { ...slot, startsAt: "2030-01-13T01:00:00.000Z" }))).rejects.toMatchObject({ status: 400 });
  });

  it("books, refuses a double-booking, moves, checks in, and finishes through the visit", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const booked = await api("/appointments", Appointment, send("POST", { ...slot, patientId: patient.id }));
    expect(booked.status).toBe("booked");

    const clash = { ...slot, patientId: patient.id, chairId: "chair_1", startsAt: "2030-01-07T01:15:00.000Z" };
    await expect(api("/appointments", Appointment, send("POST", clash))).rejects.toMatchObject({ status: 409 });

    const moved = await api(`/appointments/${booked.id}`, Appointment, send("PUT", { ...slot, startsAt: "2030-01-07T02:00:00.000Z" }));
    expect(moved.startsAt).toBe("2030-01-07T02:00:00.000Z");
    await api("/appointments", Appointment, send("POST", clash)); // the old slot is free now

    await status(booked.id, { status: "confirmed" });
    await status(booked.id, { status: "arrived" });
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes", appointmentId: booked.id }));
    const seated = await api(`/patients/${patient.id}/appointments`, z.array(Appointment));
    expect(seated.find((a) => a.id === booked.id)?.status).toBe("in_chair");

    await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    const finished = await api(`/patients/${patient.id}/appointments`, z.array(Appointment));
    expect(finished.find((a) => a.id === booked.id)?.status).toBe("done");
  });

  it("records a no-show, needs a reason to cancel, and frees both slots", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const first = await api("/appointments", Appointment, send("POST", { ...slot, patientId: patient.id, startsAt: "2030-02-04T01:00:00.000Z" }));
    expect((await status(first.id, { status: "no_show" })).status).toBe("no_show");
    await expect(status(first.id, { status: "arrived" })).rejects.toMatchObject({ status: 409 });

    const second = await api("/appointments", Appointment, send("POST", { ...slot, patientId: patient.id, startsAt: "2030-02-04T01:00:00.000Z" }));
    await expect(status(second.id, { status: "cancelled" })).rejects.toMatchObject({ status: 400 });
    expect((await status(second.id, { status: "cancelled", cancelReason: "Fever" })).cancelReason).toBe("Fever");
  });

  it("won't start a visit from an appointment that hasn't checked in", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const booked = await api("/appointments", Appointment, send("POST", { ...slot, patientId: patient.id, startsAt: "2030-03-04T01:00:00.000Z" }));
    await expect(
      api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes", appointmentId: booked.id })),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("seeds a schedule with no double-bookings", async () => {
    const all = await api("/appointments", z.array(Appointment));
    const seeded = all.filter((a) => !a.startsAt.startsWith("2030"));
    expect(seeded.length).toBeGreaterThan(50);
    expect(seeded.filter((a) => findConflict(a, seeded))).toEqual([]);
  });
});

describe("photos", () => {
  const upload = (patientId: string, meta: unknown, file: Blob = new Blob(["fake-jpeg"], { type: "image/jpeg" })) => {
    const body = new FormData();
    body.set("file", file);
    body.set("meta", JSON.stringify(meta));
    return api(`/patients/${patientId}/photos`, ClinicalPhoto, { method: "POST", body });
  };
  const meta = { type: "intraoral", tooth: 74, takenOn: "2026-10-02", caption: "" };

  it("stores before and after photos of a tooth and serves the files back", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const before = await upload(patient.id, { ...meta, stage: "before" });
    const after = await upload(patient.id, { ...meta, stage: "after", takenOn: "2026-10-09" });

    const listed = await api(`/patients/${patient.id}/photos`, z.array(ClinicalPhoto));
    expect(listed.map((p) => p.id)).toEqual([after.id, before.id]);

    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/${before.id}/file`);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(await res.text()).toBe("fake-jpeg");
  });

  it("rejects non-images, invalid teeth and another patient's visit", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const other = await api("/patients", Patient, send("POST", newPatient));
    const otherVisit = await api(`/patients/${other.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));

    await expect(upload(patient.id, meta, new Blob(["x"], { type: "text/plain" }))).rejects.toMatchObject({ status: 400 });
    await expect(upload(patient.id, { ...meta, tooth: 19 })).rejects.toMatchObject({ status: 400 });
    await expect(upload(patient.id, { ...meta, visitId: otherVisit.id })).rejects.toMatchObject({ status: 400 });
  });

  it("takes a PDF for a medical document and serves it as a .pdf, but not as a clinical photo", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const pdf = new Blob(["%PDF-1.4"], { type: "application/pdf" });
    const doc = await upload(patient.id, { type: "document", takenOn: "2026-10-02", caption: "Lab result" }, pdf);
    expect(doc.contentType).toBe("application/pdf");
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/${doc.id}/file`);
    expect(res.headers.get("content-disposition")).toMatch(/\.pdf"$/);
    await expect(upload(patient.id, meta, pdf)).rejects.toMatchObject({ status: 400 });
  });
});

describe("follow-ups and recalls", () => {
  const day = (offset: number) => format(addDays(new Date(), offset), "yyyy-MM-dd"); // local, like visits/mocks.ts

  it("makes an extraction signed today due in 7 days, and booking it takes it off the list", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const body = { visitId: visit.id, templateId: "tpl_extraction", values: { teeth: [75], reason: "Abscess" }, behavior: [] };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", body));
    const listed = async () => (await api("/due-items", z.array(DueItem))).filter((i) => i.patientId === patient.id);
    expect(await listed()).toEqual([]); // a draft makes nothing due

    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    const [due] = await listed();
    expect(due).toMatchObject({ ruleId: "extraction", kind: "follow_up", dueOn: day(7), sourceNoteId: note.id, dentistId: "staff_reyes" });
    expect(dueBucket(due.dueOn, day(0))).toBe("this_week");

    // Far from the seeded fortnight around today, so nothing else can clash.
    const booking = { patientId: patient.id, dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-02-04T01:00:00.000Z", durationMin: 15, reason: "Follow-up after extraction", sourceRuleId: "extraction" };
    const booked = await api("/appointments", Appointment, send("POST", booking));
    expect(await listed()).toEqual([]);

    await api(`/appointments/${booked.id}/status`, Appointment, send("POST", { status: "cancelled", cancelReason: "Parent asked to move it" }));
    expect((await listed()).map((i) => i.id)).toEqual([due.id]); // a cancelled booking puts it back
  });

  it("seeds one routine recall per patient, from their latest signed exam, 3-monthly at high caries risk", async () => {
    const items = (await api("/due-items", z.array(DueItem))).filter((i) => i.id.startsWith("due_"));
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((i) => ["routine", "routine_high_risk"].includes(i.ruleId) && i.kind === "recall")).toBe(true);
    expect(new Set(items.map((i) => i.patientId)).size).toBe(items.length);
  });

  it("makes a high-risk exam due in 3 months and replaces the open 6-month recall", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const exam = async (caries_risk: string) => {
      const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
      const values = { oral_hygiene: "Good", plaque: "Mild", caries_risk, facial_asymmetry: false, lymph: false, trismus: false };
      const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", { visitId: visit.id, templateId: "tpl_oral_exam", values, behavior: [] }));
      await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
      await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    };
    const open = async () => (await api("/due-items", z.array(DueItem))).filter((i) => i.patientId === patient.id);
    await exam("Low");
    expect((await open()).map((i) => i.ruleId)).toEqual(["routine"]);
    await exam("High");
    const [item, ...rest] = await open();
    expect(rest).toEqual([]);
    expect(item).toMatchObject({ ruleId: "routine_high_risk", dueOn: format(addMonths(new Date(), 3), "yyyy-MM-dd") });
  });
});

describe("parent messages", () => {
  const booking = { dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-04-01T01:00:00.000Z", durationMin: 30, reason: "Check-up" };
  const messagesFor = (patientId: string) => api(`/messages?patientId=${patientId}`, z.array(Message));
  const byKind = (rows: Message[], kind: Message["kind"]) => rows.filter((m) => m.kind === kind);

  it("queues a confirmation and a reminder with the child's name filled in when an appointment is booked", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const appt = await api("/appointments", Appointment, send("POST", { ...booking, patientId: patient.id }));
    const rows = await messagesFor(patient.id);

    const [confirmation] = byKind(rows, "appointment_confirmation");
    const [reminder] = byKind(rows, "appointment_reminder");
    for (const m of [confirmation, reminder]) {
      expect(m).toMatchObject({ status: "queued", appointmentId: appt.id, to: "09171234567", recipientName: "Rosa Mendoza" });
      expect(m!.body).toContain("Bea");
      expect(m!.body).not.toMatch(/\{\w+\}/); // every placeholder filled
    }
    expect(reminder!.sendAt).toBe(reminderSendAt(appt.startsAt)); // 9 AM the day before
    expect(byKind(rows, "pre_treatment")).toEqual([]); // a checkup needs no preparation
  });

  it("queues pre-treatment instructions when an extraction is booked, and withdraws them on cancel", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const appt = await api("/appointments", Appointment, send("POST", { ...booking, patientId: patient.id, procedureCode: "extraction", startsAt: "2030-04-04T01:00:00.000Z" }));
    const pre = async () => byKind(await messagesFor(patient.id), "pre_treatment").find((m) => m.appointmentId === appt.id);
    expect(await pre()).toMatchObject({ status: "queued", sendAt: reminderSendAt(appt.startsAt) });
    await api(`/appointments/${appt.id}/status`, Appointment, send("POST", { status: "cancelled", cancelReason: "Moved abroad" }));
    expect((await pre())?.status).toBe("cancelled");
  });

  it("re-queues pre-treatment instructions when an extraction is moved, and withdraws them on a no-show", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const extraction = { ...booking, patientId: patient.id, procedureCode: "extraction", startsAt: "2030-04-05T01:00:00.000Z" };
    const appt = await api("/appointments", Appointment, send("POST", extraction));
    const pre = async () => byKind(await messagesFor(patient.id), "pre_treatment");
    const moved = await api(`/appointments/${appt.id}`, Appointment, send("PUT", { ...extraction, startsAt: "2030-04-08T01:00:00.000Z" }));
    const afterMove = await pre();
    expect(afterMove.map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);
    expect(afterMove.find((m) => m.status === "queued")?.sendAt).toBe(reminderSendAt(moved.startsAt));

    await api(`/appointments/${appt.id}/status`, Appointment, send("POST", { status: "no_show" }));
    expect((await pre()).every((m) => m.status === "cancelled")).toBe(true);
  });

  it("withdraws the old reminder on a reschedule, and on a no-show queues a missed-appointment message", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const appt = await api("/appointments", Appointment, send("POST", { ...booking, patientId: patient.id, startsAt: "2030-04-02T01:00:00.000Z" }));
    await api(`/appointments/${appt.id}`, Appointment, send("PUT", { ...booking, startsAt: "2030-04-02T03:00:00.000Z" }));
    let reminders = byKind(await messagesFor(patient.id), "appointment_reminder");
    expect(reminders.map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);

    await api(`/appointments/${appt.id}/status`, Appointment, send("POST", { status: "no_show" }));
    const rows = await messagesFor(patient.id);
    reminders = byKind(rows, "appointment_reminder");
    expect(reminders.every((m) => m.status === "cancelled")).toBe(true);
    expect(byKind(rows, "missed_appointment")).toHaveLength(1);
  });

  it("queues post-extraction instructions when the note is signed, and a recall message from the due list once", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const body = { visitId: visit.id, templateId: "tpl_extraction", values: { teeth: [75], reason: "Abscess" }, behavior: [] };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", body));
    expect(byKind(await messagesFor(patient.id), "post_extraction")).toEqual([]); // a draft sends nothing

    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    const [instructions] = byKind(await messagesFor(patient.id), "post_extraction");
    expect(instructions).toMatchObject({ noteId: note.id, status: "queued" });
    expect(instructions!.body).toContain("Bea");

    const [due] = (await api("/due-items", z.array(DueItem))).filter((i) => i.patientId === patient.id);
    const reminder = await api(`/due-items/${due!.id}/message`, Message, { method: "POST" });
    expect(reminder).toMatchObject({ kind: "follow_up_reminder", dueItemId: due!.id });
    await expect(api(`/due-items/${due!.id}/message`, Message, { method: "POST" })).rejects.toMatchObject({ status: 409 });
  });

  it("greets a child on their birthday once", async () => {
    const birthDate = format(subYears(new Date(), 5), "yyyy-MM-dd");
    const patient = await api("/patients", Patient, send("POST", { ...newPatient, birthDate }));
    await messagesFor(patient.id); // opening the log runs the daily job
    expect(byKind(await messagesFor(patient.id), "birthday")).toHaveLength(1);
  });

  it("refuses an unknown placeholder, and later messages use the edited template", async () => {
    const path = "/message-templates/appointment_confirmation";
    const original = (await api("/message-templates", z.array(MessageTemplate))).find((t) => t.kind === "appointment_confirmation")!;
    await expect(api(path, MessageTemplate, send("PUT", { body: "See you, {child_nmae}!" }))).rejects.toMatchObject({ status: 400 });
    await api(path, MessageTemplate, send("PUT", { body: "See you {date}, {child_first_name}!" }));

    const patient = await api("/patients", Patient, send("POST", newPatient));
    await api("/appointments", Appointment, send("POST", { ...booking, patientId: patient.id, startsAt: "2030-04-03T01:00:00.000Z" }));
    const [confirmation] = byKind(await messagesFor(patient.id), "appointment_confirmation");
    expect(confirmation!.body).toMatch(/^See you .+, Bea!$/);
    await api(path, MessageTemplate, send("PUT", { body: original.body })); // leave the default for later tests
  });

  it("seeds a log whose messages are all filled in", async () => {
    const rows = await api("/messages", z.array(Message));
    const seeded = rows.filter((m) => m.id.startsWith("msg_"));
    expect(seeded.length).toBeGreaterThan(0);
    expect(seeded.every((m) => !/\{\w+\}/.test(m.body))).toBe(true);
  });
});

describe("today at a glance", () => {
  const today = format(new Date(), "yyyy-MM-dd");
  const summary = () => api(`/reports/today?today=${today}`, TodaySummary);

  it("counts agree with the calendar for today, group by group", async () => {
    const from = startOfDay(new Date()).toISOString();
    const to = addDays(startOfDay(new Date()), 1).toISOString();
    const appts = await api(`/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, z.array(Appointment));
    const s = await summary();
    expect(s.counts.total).toBe(appts.length);
    expect(s.counts.waiting).toBe(appts.filter((a) => inStatusGroup("waiting", a.status)).length);
    expect(s.counts.done).toBe(appts.filter((a) => inStatusGroup("done", a.status)).length);
    expect(s.counts.missed).toBe(appts.filter((a) => inStatusGroup("missed", a.status)).length);
    expect(s.appointments.map((a) => a.id).sort()).toEqual(appts.map((a) => a.id).sort());
  });

  it("counts the same pending requests the requests card lists", async () => {
    const pending = await api("/appointment-requests?status=pending", z.array(AppointmentRequest));
    expect((await summary()).counts.requests).toBe(pending.length);
    expect(pending.length).toBeGreaterThan(0); // the roster seeds two
  });

  it("is the same on a second load", async () => {
    expect(await summary()).toEqual(await summary());
  });

  it("sends a birthday greeting once, and the daily job doesn't send another", async () => {
    const birthDate = format(subYears(new Date(), 7), "yyyy-MM-dd");
    const patient = await api("/patients", Patient, send("POST", { ...newPatient, birthDate }));
    const listed = async () => (await summary()).birthdays.find((b) => b.patientId === patient.id);
    const before = await listed();
    expect(before?.turning).toBe(7);
    expect(before?.greeting).toBeUndefined(); // not greeted yet: JSON drops the key, so the button shows

    const sent = await api(`/patients/${patient.id}/birthday-greeting`, Message, { method: "POST" });
    expect(sent).toMatchObject({ kind: "birthday", status: "queued", to: "09171234567" });
    expect((await listed())?.greeting).toBe("queued");
    await expect(api(`/patients/${patient.id}/birthday-greeting`, Message, { method: "POST" })).rejects.toMatchObject({ status: 409 });

    const log = await api(`/messages?patientId=${patient.id}`, z.array(Message)); // runs the daily job
    expect(log.filter((m) => m.kind === "birthday")).toHaveLength(1);
  });

  it("refuses a greeting on any other day", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient)); // born 2020-07-02
    if (format(new Date(), "MM-dd") === "07-02") return;
    await expect(api(`/patients/${patient.id}/birthday-greeting`, Message, { method: "POST" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("financial dashboard", () => {
  // Runs before describe("billing"), so every payment in the db is still a seeded one.
  const today = format(new Date(), "yyyy-MM-dd");
  const day = (iso: string) => format(new Date(iso), "yyyy-MM-dd");
  const total = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);
  const report = () => api(`/reports/finance?today=${today}`, FinanceSummary);

  it("totals match the sum of seeded payments", async () => {
    expect(db.payments.length).toBeGreaterThan(0);
    expect(db.payments.every((p) => p.id.startsWith("pay_seed_"))).toBe(true); // nothing but the seed yet
    const s = await report();
    const since = (from: string) => total(db.payments.filter((p) => day(p.receivedAt) >= from && day(p.receivedAt) <= today));

    expect(total(s.byMonth)).toBe(total(db.payments)); // every seeded payment is within the last 6 months
    expect(s.collected.today).toBe(since(today));
    expect(s.collected.month).toBe(since(format(startOfMonth(new Date()), "yyyy-MM-dd")));
    expect(total(s.byDay)).toBe(since(format(subDays(new Date(), 13), "yyyy-MM-dd")));
    expect(total(s.byMethod)).toBe(s.collected.month);

    const balances = [...new Set(db.invoices.map((i) => i.patientId))].map((id) =>
      accountSummary(db.invoices.filter((i) => i.patientId === id), db.payments).balance,
    );
    expect(s.outstandingTotal).toBe(balances.filter((b) => b > 0).reduce((a, b) => a + b, 0));
    expect(s.outstandingTotal).toBeGreaterThan(0); // every fifth seeded invoice is half-paid
  });

  it("lists an appointment as unpaid until its invoice is paid", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    // The last open day before today, after the seeded day: in clinic hours, in the past, inside the 30-day window.
    let day = subDays(startOfDay(new Date()), 1);
    while (isClosedWeekday(day)) day = subDays(day, 1);
    const startsAt = setMinutes(setHours(day, 17), 30).toISOString();
    const appt = await api("/appointments", Appointment, send("POST", { patientId: patient.id, dentistId: "staff_reyes", chairId: "chair_3", startsAt, durationMin: 15, reason: "Fluoride application" }));
    await api(`/appointments/${appt.id}/status`, Appointment, send("POST", { status: "confirmed" }));
    await api(`/appointments/${appt.id}/status`, Appointment, send("POST", { status: "arrived" }));
    await api(`/patients/${patient.id}/plan`, PlanItem, send("POST", { procedureCode: "fluoride", fee: pesos(800) }));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes", appointmentId: appt.id }));
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }));
    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });

    const unpaid = async () => (await report()).unpaidAppointments.find((a) => a.appointmentId === appt.id);
    expect(await unpaid()).toMatchObject({ appointmentId: appt.id }); // done, not billed
    expect((await unpaid())?.invoiceId).toBeUndefined();

    const [item] = await api(`/patients/${patient.id}/plan`, z.array(PlanItem));
    const invoice = await api(`/patients/${patient.id}/invoices`, Invoice, send("POST", { planItemIds: [item.id] }));
    expect(invoice.appointmentId).toBe(appt.id); // derived from the visit, not sent by the client
    expect(await unpaid()).toMatchObject({ invoiceId: invoice.id, balance: pesos(800) });

    await api(`/invoices/${invoice.id}/payments`, Payment, send("POST", { amount: pesos(800), method: "cash", receivedBy: "staff_cruz" }));
    expect(await unpaid()).toBeUndefined();
  });
});

describe("billing", () => {
  /** A patient whose plan items are all done, completed by signing notes in one visit. */
  async function patientWithDoneItems(plan: [string, number?][], notes: [string, Record<string, unknown>][]) {
    const fee = Object.fromEntries((await api("/procedures", z.array(Procedure))).map((p) => [p.code, p.fee]));
    const patient = await api("/patients", Patient, send("POST", newPatient));
    for (const [procedureCode, tooth] of plan) {
      await api(`/patients/${patient.id}/plan`, PlanItem, send("POST", { procedureCode, tooth, fee: fee[procedureCode] }));
    }
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    for (const [templateId, values] of notes) {
      const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", { visitId: visit.id, templateId, values, behavior: [] }));
      await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    }
    const items = await api(`/patients/${patient.id}/plan`, z.array(PlanItem));
    expect(items.every((i) => i.status === "done")).toBe(true);
    return { patient, items };
  }

  it("reproduces the spec's ₱8,500 total, ₱5,000 paid, ₱3,500 balance with invoiceBalance", async () => {
    const { patient, items } = await patientWithDoneItems(
      [["prophylaxis"], ["fluoride"], ["restoration", 51], ["restoration", 74], ["restoration", 84], ["follow_up"]],
      [
        ["tpl_prophylaxis", { method: "Rubber cup and paste" }],
        ["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }],
        ["tpl_restoration", { teeth: [51, 74, 84], material: "Composite" }],
        ["tpl_follow_up", { healing: "Satisfactory" }],
      ],
    );
    const invoices = `/patients/${patient.id}/invoices`;
    const invoice = await api(invoices, Invoice, send("POST", { planItemIds: items.map((i) => i.id) }));
    expect(invoiceTotal(invoice)).toBe(pesos(8500));
    expect(invoice.lines.map((l) => l.planItemId)).toEqual(items.map((i) => i.id));
    await expect(api(invoices, Invoice, send("POST", { planItemIds: [items[0].id] }))).rejects.toMatchObject({ status: 409 }); // billed once

    const pay = (body: object) => api(`/invoices/${invoice.id}/payments`, Payment, send("POST", { receivedBy: "staff_cruz", ...body }));
    await expect(pay({ amount: pesos(9000), method: "cash" })).rejects.toMatchObject({ status: 409 }); // more than the balance
    await expect(pay({ amount: pesos(2000), method: "gcash" })).rejects.toMatchObject({ status: 400 }); // no reference number
    await pay({ amount: pesos(3000), method: "cash" });
    const second = await pay({ amount: pesos(2000), method: "gcash", referenceNo: "1012 345 678" });
    expect(second.receiptNo).toMatch(/^AR-\d{6}$/);

    const payments = await api(`/patients/${patient.id}/payments`, z.array(Payment));
    expect(invoiceBalance(invoice, payments)).toBe(pesos(3500));
    expect(accountSummary([invoice], payments)).toEqual({ total: pesos(8500), paid: pesos(5000), balance: pesos(3500) });
  });

  it("applies a discount, records a refund as a negative payment, and lists the day's collections", async () => {
    const { patient, items } = await patientWithDoneItems([["fluoride"]], [["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }]]);
    const invoices = `/patients/${patient.id}/invoices`;
    await expect(api(invoices, Invoice, send("POST", { planItemIds: [items[0].id], discount: pesos(900) }))).rejects.toMatchObject({ status: 400 });
    const invoice = await api(invoices, Invoice, send("POST", { planItemIds: [items[0].id], discount: pesos(100) }));
    expect(invoiceTotal(invoice)).toBe(pesos(700));

    const pay = (body: object) => api(`/invoices/${invoice.id}/payments`, Payment, send("POST", { receivedBy: "staff_cruz", method: "cash", ...body }));
    await pay({ amount: pesos(700) });
    await expect(pay({ amount: -pesos(200) })).rejects.toMatchObject({ status: 400 }); // a refund needs a reason
    const refund = await pay({ amount: -pesos(200), note: "Parent overpaid at the counter" });
    await expect(pay({ amount: -pesos(600) })).rejects.toMatchObject({ status: 400 }); // still no reason
    await expect(pay({ amount: -pesos(600), note: "Too much" })).rejects.toMatchObject({ status: 409 }); // only ₱500 left paid

    const payments = await api(`/patients/${patient.id}/payments`, z.array(Payment));
    expect(invoiceBalance(invoice, payments)).toBe(pesos(200));
    const today = await api(`/payments?date=${format(new Date(), "yyyy-MM-dd")}`, z.array(Payment));
    expect(today.map((p) => p.id)).toContain(refund.id);
  });

  it("holds a deposit, applies part of it to an invoice as a transfer, and moves it back", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const deposit = (body: object) => api(`/patients/${patient.id}/deposits`, Payment, send("POST", { method: "cash", receivedBy: "staff_cruz", ...body }));
    const held = async () => depositBalance(await api(`/patients/${patient.id}/payments`, z.array(Payment)), patient.id);

    const paid = await deposit({ amount: pesos(1000) });
    expect(paid.invoiceId).toBeUndefined();
    expect(paid.receiptNo).toMatch(/^AR-\d{6}$/);
    await expect(deposit({ amount: -pesos(1500), note: "Too much" })).rejects.toMatchObject({ status: 409 });
    await deposit({ amount: -pesos(200), note: "Parent changed plans" });
    expect(await held()).toBe(pesos(800));

    // A ₱800 invoice from a signed fluoride note.
    await api(`/patients/${patient.id}/plan`, PlanItem, send("POST", { procedureCode: "fluoride", fee: pesos(800) }));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] }));
    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    const [item] = await api(`/patients/${patient.id}/plan`, z.array(PlanItem));
    const invoice = await api(`/patients/${patient.id}/invoices`, Invoice, send("POST", { planItemIds: [item.id] }));
    const apply = (amount: number) => api(`/invoices/${invoice.id}/apply-credit`, Payment, send("POST", { amount, receivedBy: "staff_cruz" }));
    const balance = async () => invoiceBalance(invoice, await api(`/patients/${patient.id}/payments`, z.array(Payment)));

    await expect(apply(pesos(900))).rejects.toMatchObject({ status: 409 }); // more than the ₱800 held
    const applied = await apply(pesos(600));
    expect(applied).toMatchObject({ method: "account_credit", invoiceId: invoice.id, receiptNo: expect.stringMatching(/^CR-/) });
    expect(await balance()).toBe(pesos(200));
    expect(await held()).toBe(pesos(200));
    await expect(apply(pesos(300))).rejects.toMatchObject({ status: 409 }); // only ₱200 held
    await apply(-pesos(600));
    expect(await balance()).toBe(pesos(800));
    expect(await held()).toBe(pesos(800));

    // The day's collections count the real money (₱1,000 in, ₱200 out), never the transfers.
    const day = await api(`/payments?date=${format(new Date(), "yyyy-MM-dd")}`, z.array(Payment));
    const mine = day.filter((p) => p.patientId === patient.id);
    expect(mine.filter(isMoneyIn).reduce((s, p) => s + p.amount, 0)).toBe(pesos(800));

    // With ₱1,300 held, ₱900 is still refused: it is more than the ₱800 invoice balance.
    await deposit({ amount: pesos(500) });
    await expect(apply(pesos(900))).rejects.toMatchObject({ status: 409 });
    expect(await balance()).toBe(pesos(800));
  });
});

describe("documents", () => {
  it("logs a notes report issued by front desk (not a dentist-signed document)", async () => {
    const patient = await api("/patients", Patient, send("POST", newPatient));
    const doc = await api(`/patients/${patient.id}/documents`, PatientDocument, send("POST", { type: "notes_report", issuedBy: "staff_cruz" }));
    expect(doc.title).toBe("Clinical notes report · Bea Mendoza");
    const log = await api(`/patients/${patient.id}/documents`, z.array(PatientDocument));
    expect(log[0].id).toBe(doc.id);
  });

  /** A child with a completed visit (a signed fluoride note) and a paid ₱800 invoice. */
  async function treatedAndPaid(extra: Partial<CreatePatientInput> = {}) {
    const patient = await api("/patients", Patient, send("POST", { ...newPatient, ...extra }));
    await api(`/patients/${patient.id}/plan`, PlanItem, send("POST", { procedureCode: "fluoride", fee: pesos(800) }));
    const visit = await api(`/patients/${patient.id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }));
    const body = { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] };
    const note = await api(`/patients/${patient.id}/notes`, ClinicalNote, send("POST", body));
    await api(`/notes/${note.id}/sign`, ClinicalNote, { method: "POST" });
    await api(`/visits/${visit.id}/complete`, Visit, { method: "POST" });
    const [item] = await api(`/patients/${patient.id}/plan`, z.array(PlanItem));
    const invoice = await api(`/patients/${patient.id}/invoices`, Invoice, send("POST", { planItemIds: [item.id] }));
    const payment = await api(`/invoices/${invoice.id}/payments`, Payment, send("POST", { amount: pesos(800), method: "cash", receivedBy: "staff_cruz" }));
    return { patient, visit, note, payment };
  }
  const generate = (patientId: string, body: object) => api(`/patients/${patientId}/documents`, PatientDocument, send("POST", body));

  it("logs a dental certificate and a receipt on the patient record", async () => {
    const { patient, visit, payment } = await treatedAndPaid();
    const certificate = await generate(patient.id, { type: "dental_certificate", sourceId: visit.id, issuedBy: "staff_reyes" });
    const receipt = await generate(patient.id, { type: "receipt", sourceId: payment.id, issuedBy: "staff_cruz" });
    expect(certificate.title).toBe("Dental certificate · Bea Mendoza");

    const logged = await api(`/patients/${patient.id}/documents`, z.array(PatientDocument));
    expect(logged.map((d) => d.id).sort()).toEqual([certificate.id, receipt.id].sort());
    expect((await api("/documents", z.array(PatientDocument))).map((d) => d.id)).toContain(receipt.id);
  });

  it("refuses a front-desk certificate, another child's payment and an unsigned or wrong source", async () => {
    const a = await treatedAndPaid();
    const b = await treatedAndPaid();
    await expect(generate(a.patient.id, { type: "dental_certificate", sourceId: a.visit.id, issuedBy: "staff_cruz" })).rejects.toMatchObject({ status: 400 });
    await expect(generate(a.patient.id, { type: "receipt", sourceId: b.payment.id, issuedBy: "staff_cruz" })).rejects.toMatchObject({ status: 400 });
    await expect(generate(a.patient.id, { type: "post_op_instructions", sourceId: a.visit.id, issuedBy: "staff_reyes" })).rejects.toMatchObject({ status: 400 });
    expect(await generate(a.patient.id, { type: "post_op_instructions", sourceId: a.note.id, issuedBy: "staff_reyes" })).toMatchObject({ sourceId: a.note.id });
  });

  it("issues a dental clearance only through a dentist, from a visit of this child", async () => {
    const a = await treatedAndPaid();
    const b = await treatedAndPaid();
    const clearance = (visitId: string, issuedBy: string) => generate(a.patient.id, { type: "dental_clearance", sourceId: visitId, issuedBy, details: { purpose: "School enrolment" } });
    await expect(clearance(a.visit.id, "staff_cruz")).rejects.toMatchObject({ status: 400 });
    await expect(clearance(b.visit.id, "staff_reyes")).rejects.toMatchObject({ status: 400 });
    expect(await clearance(a.visit.id, "staff_reyes")).toMatchObject({ type: "dental_clearance", title: "Dental clearance · Bea Mendoza" });
  });

  it("never prescribes an S2 drug, and stops a prescription that clashes with a recorded allergy", async () => {
    const { patient } = await treatedAndPaid({ allergies: ["Penicillin"] });
    const rx = (drugId: string) => ({ type: "prescription", issuedBy: "staff_reyes", items: [{ drugId, sig: "Give 5 mL by mouth every 8 hours for 7 days.", quantity: "1 bottle" }] });
    await expect(generate(patient.id, rx("midazolam_2_syr"))).rejects.toMatchObject({ status: 400 });
    await expect(generate(patient.id, rx("amoxicillin_250_susp"))).rejects.toMatchObject({ status: 409 });
    const ok = await generate(patient.id, rx("paracetamol_120_syr"));
    expect(ok.items?.[0].drugId).toBe("paracetamol_120_syr");
  });
});

describe("staff switch", () => {
  afterAll(() => signIn(ADMIN));
  const DESK = "demo.staff_cruz";
  const pinOf = (staffId: string) => db.staffPins.find((p) => p.staffId === staffId)!.pin;
  const switchTo = (accountId: string, pin: string) => api("/auth/switch", Session, send("POST", { accountId, pin }));

  it("gives every staff member their own PIN, shows it on the demo login, and gives parents none", async () => {
    expect(db.staffPins.map((p) => p.staffId).sort()).toEqual(db.staff.map((s) => s.id).sort());
    const pins = db.staffPins.map((p) => p.pin);
    expect(new Set(pins).size).toBe(pins.length);
    const { accounts } = await api("/auth/demo-accounts", DemoAccounts);
    for (const a of accounts) expect(Boolean(a.pin), a.name).toBe(a.role !== "parent");
  });

  it("switches to another staff member with their own PIN, and logs who left and who arrived", async () => {
    signIn(DESK);
    const before = db.auditEvents.length;
    const session = await switchTo("staff_reyes", pinOf("staff_reyes"));
    expect(session.user).toMatchObject({ id: "staff_reyes", role: "dentist" });
    expect(db.auditEvents.slice(before).map((e) => [e.actorId, e.action, e.record])).toEqual([
      ["staff_cruz", "sign_out", "Session (switched user)"],
      ["staff_reyes", "sign_in", "Session (PIN switch)"],
    ]);
    signIn(session.token);
    expect(await api("/auth/me", SessionUser)).toMatchObject({ id: "staff_reyes" });
  });

  it("refuses a wrong PIN with the tries left, then locks that person after five, even with the right PIN", async () => {
    signIn(DESK);
    const wrong = () => switchTo("staff_santos", "0000");
    for (const left of ["4 tries", "3 tries", "2 tries", "1 try"]) {
      await expect(wrong()).rejects.toMatchObject({ status: 401, message: expect.stringContaining(`${left} left`) });
    }
    await expect(wrong()).rejects.toMatchObject({ status: 429 });
    await expect(switchTo("staff_santos", pinOf("staff_santos"))).rejects.toMatchObject({ status: 429 });
    const pinEvents = db.auditEvents.filter((e) => e.actorId === "staff_santos" && e.record === "Session (PIN switch)");
    expect(pinEvents.map((e) => e.action)).toEqual([...Array(5).fill("sign_in_failed"), "denied"]);
    // Someone else's PIN still works: the lock is per person, not per device.
    expect((await switchTo("staff_delacruz", pinOf("staff_delacruz"))).user.role).toBe("admin");
  });

  it("never switches to a parent, never from a parent, and never without a session", async () => {
    signIn(DESK);
    const { accounts } = await api("/auth/demo-accounts", DemoAccounts);
    const parent = accounts.find((a) => a.role === "parent")!;
    await expect(switchTo(parent.id, "1234")).rejects.toMatchObject({ status: 400 });
    signIn(`demo.${parent.id}`);
    await expect(switchTo("staff_cruz", pinOf("staff_cruz"))).rejects.toMatchObject({ status: 403 });
    signIn(null);
    await expect(switchTo("staff_cruz", pinOf("staff_cruz"))).rejects.toMatchObject({ status: 401 });
  });
});

describe("access control", () => {
  afterAll(() => signIn(ADMIN));

  it("lets front desk take a deposit and refuses a parent", async () => {
    signIn(`demo.guardian.${db.patients.find((x) => x.id === "patient_sibling")!.guardians[0].id}`);
    const body = { amount: pesos(500), method: "cash", receivedBy: "staff_cruz" };
    await expect(api("/patients/patient_sibling/deposits", Payment, send("POST", body))).rejects.toMatchObject({ status: 403 });
    signIn("demo.staff_cruz");
    expect((await api("/patients/patient_sibling/deposits", Payment, send("POST", body))).amount).toBe(pesos(500));
    signIn(ADMIN);
  });

  it("lets front desk quick-update a child, and refuses a parent the quick update and the duplicate check", async () => {
    const p = db.patients.find((x) => x.id === "patient_sibling")!;
    signIn("demo.staff_cruz");
    expect((await api(`/patients/${p.id}`, Patient, send("PATCH", { nickname: "Miks", tags: [], alerts: p.alerts }))).nickname).toBe("Miks");
    signIn(`demo.guardian.${p.guardians[0].id}`);
    await expect(api(`/patients/${p.id}`, Patient, send("PATCH", { nickname: "X", tags: [], alerts: [] }))).rejects.toMatchObject({ status: 403 });
    await expect(api(`/patient-duplicates?firstName=a&lastName=b&birthDate=2020-01-01`, z.array(DuplicateMatch))).rejects.toMatchObject({ status: 403 });
    signIn(ADMIN);
  });

  it("shows today at a glance to every staff role but not to parents; only front desk and admin greet", async () => {
    const bday = db.patients.find((p) => p.id.startsWith("patient_roster_"))!.id; // any patient: the 403 comes first
    for (const token of ["demo.staff_reyes", "demo.staff_cruz"]) {
      signIn(token);
      expect((await api("/reports/today", TodaySummary)).counts.total).toBeGreaterThanOrEqual(0);
    }
    signIn("demo.staff_reyes");
    await expect(api(`/patients/${bday}/birthday-greeting`, Message, { method: "POST" })).rejects.toMatchObject({ status: 403 });
    // Token format as signInAsFamily(): demo.<account id>, and a parent's account id is guardian.<guardian id>.
    const guardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0].id;
    signIn(`demo.guardian.${guardianId}`);
    await expect(api("/reports/today", TodaySummary)).rejects.toMatchObject({ status: 403 });
    const mine = await api("/patient-summaries?pageSize=100", PatientPage);
    expect(mine.rows.map((r) => r.id).sort()).toEqual(db.patients.filter((p) => p.guardians.some((g) => g.id === guardianId)).map((p) => p.id).sort());
    expect(mine.rows.every((r) => r.guardianPhone)).toBe(true); // patients.contact at "own" scope: their own family's phones
    signIn(ADMIN);
  });

  it("refuses the API without a session, but serves the login endpoints", async () => {
    signIn(null);
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 401 });
    const { accounts } = await api("/auth/demo-accounts", DemoAccounts);
    expect(new Set(accounts.map((a) => a.role))).toEqual(new Set(["admin", "dentist", "front_desk", "parent"]));
    expect(accounts.filter((a) => a.role === "parent")).toHaveLength(3);
  });

  it("signs in with the demo password, and only with it", async () => {
    signIn(null);
    const { accounts, password } = await api("/auth/demo-accounts", DemoAccounts);
    const dentist = accounts.find((a) => a.role === "dentist")!;
    const login = (pw: string) => api("/auth/login", Session, send("POST", { email: dentist.email.toUpperCase(), password: pw }));
    await expect(login("wrong")).rejects.toMatchObject({ status: 401 });
    const session = await login(password);
    signIn(session.token);
    expect(await api("/auth/me", SessionUser)).toMatchObject({ role: "dentist", staffId: dentist.id });
  });

  it("lists one login per role, each signing in as that role with pass123", async () => {
    signIn(null);
    const { logins, password } = await api("/auth/demo-accounts", DemoAccounts);
    expect(password).toBe("pass123");
    expect(logins).toEqual([
      { role: "admin", email: "admin@gmail.com" },
      { role: "dentist", email: "dentist@gmail.com" },
      { role: "front_desk", email: "frontdesk@gmail.com" },
      { role: "parent", email: "parent@gmail.com" },
    ]);
    for (const { role, email } of logins) {
      const session = await api("/auth/login", Session, send("POST", { email, password }));
      signIn(session.token);
      expect((await api("/auth/me", SessionUser)).role, email).toBe(role);
    }
    // The parent login is the two-children family.
    expect((await api("/patients", z.array(Patient))).map((p) => p.id)).toContain("patient_sibling");
  });

  it("keeps the finance dashboard admin-only", async () => {
    for (const token of ["demo.staff_cruz", "demo.staff_reyes"]) {
      signIn(token);
      await expect(api("/reports/finance", FinanceSummary), token).rejects.toMatchObject({ status: 403 });
    }
    signIn(ADMIN);
    expect(await api("/reports/finance", FinanceSummary)).toBeDefined();
  });

  it("lets front desk read a chart and a plan, but not write either", async () => {
    signIn("demo.staff_cruz");
    const id = db.patients[0].id;
    expect(await api(`/patients/${id}/chart`, z.array(ChartEntry))).toBeDefined();
    await expect(api(`/patients/${id}/chart`, ChartEntry, send("POST", {}))).rejects.toMatchObject({ status: 403 });
    await expect(api(`/patients/${id}/plan`, PlanItem, send("POST", {}))).rejects.toMatchObject({ status: 403 });
    await expect(api(`/patients/${id}/visits`, Visit, send("POST", { dentistId: "staff_reyes" }))).rejects.toMatchObject({ status: 403 });
  });

  it("lets dentist and front desk load everything the patient record and documents tab read", async () => {
    const id = db.patients[0].id;
    const paths = [
      ...["", "/visits", "/notes", "/chart", "/growth", "/plan", "/photos", "/appointments", "/invoices", "/payments", "/documents"].map((p) => `/patients/${id}${p}`),
      "/staff", "/procedures", "/chairs", "/note-templates", "/message-templates",
    ];
    for (const token of ["demo.staff_reyes", "demo.staff_cruz"]) {
      signIn(token);
      for (const path of paths) expect(await api(path, z.unknown()), `${token} ${path}`).toBeDefined();
    }
  });
});

describe("parent portal", () => {
  afterAll(() => signIn(ADMIN));

  /** The "Two children, one mid-treatment" demo parent, and the ids of their children. */
  async function signInAsFamily() {
    signIn(null);
    const { accounts } = await api("/auth/demo-accounts", DemoAccounts);
    const family = accounts.find((a) => a.summary.startsWith("Two children"))!;
    signIn(`demo.${family.id}`);
    const mine = await api("/patients", z.array(Patient));
    const other = db.patients.find((p) => !mine.some((m) => m.id === p.id))!;
    return { family, mine, other };
  }

  it("sends a parent their own family's contacts and nobody else's", async () => {
    const { mine, other } = await signInAsFamily(); // parsed with the strict Patient: phones present
    expect(mine.every((p) => p.guardians.every((g) => g.phone))).toBe(true);
    await expect(api(`/patients/${other.id}`, PatientView)).rejects.toMatchObject({ status: 403 }); // not theirs at all
  });

  it("shows a parent only their own children, and 403 for another child's (Chunk 17 done-when)", async () => {
    const { mine, other } = await signInAsFamily();
    expect(mine.map((p) => p.id)).toContain("patient_sibling");
    expect(mine).toHaveLength(2);
    for (const path of ["", "/plan", "/appointments", "/invoices", "/payments", "/photos", "/appointment-requests"]) {
      expect(await api(`/patients/${mine[0].id}${path}`, z.unknown()), path).toBeDefined();
      await expect(api(`/patients/${other.id}${path}`, z.unknown()), path).rejects.toMatchObject({ status: 403 });
    }
    expect(await api(`/messages?patientId=${mine[0].id}`, z.array(Message))).toBeDefined();
    for (const path of [`/messages?patientId=${other.id}`, "/messages", "/appointments", `/patients/${mine[0].id}/chart`, `/patients/${mine[0].id}/notes`, "/reports/finance"]) {
      await expect(api(path, z.unknown()), path).rejects.toMatchObject({ status: 403 });
    }
  });

  it("lets a parent confirm their child's appointment, but not cancel it or touch another child's", async () => {
    const { other } = await signInAsFamily();
    const status = (id: string, body: object) => api(`/appointments/${id}/status`, Appointment, send("POST", body));
    await expect(status("appointment_sibling", { status: "cancelled", cancelReason: "Busy" })).rejects.toMatchObject({ status: 403 });
    expect((await status("appointment_sibling", { status: "confirmed" })).status).toBe("confirmed");
    const theirs = db.appointments.find((a) => a.patientId === other.id)!;
    await expect(status(theirs.id, { status: "confirmed" })).rejects.toMatchObject({ status: 403 });
  });

  it("takes one appointment request per child and puts it in the front desk's inbox", async () => {
    const { family, other } = await signInAsFamily();
    const ask = (patientId: string) =>
      api(`/patients/${patientId}/appointment-requests`, AppointmentRequest, send("POST", {
        preferredDate: format(addDays(new Date(), 3), "yyyy-MM-dd"),
        timeOfDay: "morning",
        reason: "Check-up",
      }));
    const request = await ask("patient_sibling");
    expect(request).toMatchObject({ status: "pending", guardianId: family.id.replace(/^guardian\./, "") });
    await expect(ask("patient_sibling")).rejects.toMatchObject({ status: 409 });
    await expect(ask(other.id)).rejects.toMatchObject({ status: 403 });

    signIn("demo.staff_cruz");
    const inbox = await api("/appointment-requests?status=pending", z.array(AppointmentRequest));
    expect(inbox.map((r) => r.id)).toContain(request.id);
    expect((await api(`/appointment-requests/${request.id}/handled`, AppointmentRequest, { method: "POST" })).status).toBe("handled");
  });

  it("offers a 'to confirm' parent whose child's next visit is still booked", async () => {
    signIn(null);
    const { accounts } = await api("/auth/demo-accounts", DemoAccounts);
    const parent = accounts.find((a) => a.summary === "Has an appointment to confirm")!;
    signIn(`demo.${parent.id}`);
    const [child] = await api("/patients", z.array(Patient));
    const today = startOfDay(new Date()).toISOString();
    const next = (await api(`/patients/${child.id}/appointments`, z.array(Appointment)))
      .filter((a) => ["booked", "confirmed", "arrived", "in_chair"].includes(a.status) && a.startsAt >= today)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    expect(next?.status).toBe("booked");
  });

  it("shows a parent their uploads but not the clinic's photos, and keeps X-rays for the clinic", async () => {
    const upload = (meta: object) => {
      const body = new FormData();
      body.set("file", new Blob(["fake-jpeg"], { type: "image/jpeg" }));
      body.set("meta", JSON.stringify(meta));
      return api("/patients/patient_sibling/photos", ClinicalPhoto, { method: "POST", body });
    };
    signIn(ADMIN);
    const clinical = await upload({ type: "xray", takenOn: "2026-10-02", caption: "Bitewing" });
    await signInAsFamily();
    await expect(upload({ type: "xray", takenOn: "2026-10-02", caption: "" })).rejects.toMatchObject({ status: 400 });
    const mine = await upload({ type: "document", takenOn: "2026-10-02", caption: "Medical clearance" });
    expect(mine.uploadedBy).toBe("parent");
    const listed = await api("/patients/patient_sibling/photos", z.array(ClinicalPhoto));
    expect(listed.map((p) => p.id)).toEqual([mine.id]);
    expect((await fetch(`${process.env.NEXT_PUBLIC_API_URL}/photos/${clinical.id}/file`)).status).toBe(404);
    signIn(ADMIN);
    const all = await api("/patients/patient_sibling/photos", z.array(ClinicalPhoto));
    expect(all.map((p) => p.id).sort()).toEqual([clinical.id, mine.id].sort());
  });

  it("lets a parent upload a lab result as a PDF", async () => {
    await signInAsFamily();
    const body = new FormData();
    body.set("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }));
    body.set("meta", JSON.stringify({ type: "document", takenOn: "2026-10-02", caption: "Lab result" }));
    const pdf = await api("/patients/patient_sibling/photos", ClinicalPhoto, { method: "POST", body });
    expect(pdf).toMatchObject({ contentType: "application/pdf", uploadedBy: "parent" });
    signIn(ADMIN);
  });
});
