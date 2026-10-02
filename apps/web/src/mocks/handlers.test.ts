import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { Appointment, ClinicalPhoto, Patient, findConflict, Procedure, Visit, type CreatePatientInput } from "@pedia/shared";
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

describe("appointments", () => {
  // Far from the seeded fortnight around today, so only this test's bookings can clash.
  const slot = { dentistId: "staff_reyes", chairId: "chair_3", startsAt: "2030-01-07T01:00:00.000Z", durationMin: 30, reason: "Check-up" };
  const status = (id: string, body: unknown) => api(`/appointments/${id}/status`, Appointment, send("POST", body));

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
});
