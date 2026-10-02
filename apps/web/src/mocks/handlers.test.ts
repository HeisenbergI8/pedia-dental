import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { ChartEntry, ClinicalNote, GrowthRecord, NoteTemplate, PlanItem, habitTimeline, planProgress, Patient, Procedure, Visit, deriveChart, surfacesFor, type CreatePatientInput } from "@pedia/shared";
import { api, ApiError } from "@/lib/api-client";
import { handlers } from "./handlers";

/** Exercises the handlers through the real api() client, so every response passes its shared schema. */
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => server.close());

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
  it("creates a patient that can be read back", async () => {
    const created = await api("/patients", Patient, send("POST", newPatient));
    expect(created.consents).toEqual([]);
    expect(await api(`/patients/${created.id}`, Patient)).toEqual(created);
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
    expect((err as ApiError).message).toBe("Pick at least one tooth. Choose one");
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
