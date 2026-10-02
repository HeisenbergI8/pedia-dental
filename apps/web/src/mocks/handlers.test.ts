import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { Patient, Procedure, Visit, type CreatePatientInput } from "@pedia/shared";
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
