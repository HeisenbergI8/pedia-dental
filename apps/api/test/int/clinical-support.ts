import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { Patient, Visit, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { expect } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** B6's int files share this harness: a seeded app on the system clock, sign-in by session, and a fresh child per case. */
export type Login = readonly [clinicId: string, accountId: string];
export const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
export const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
export const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];

export async function clinicalApp() {
  const platform = seedPlatform();
  const app: INestApplication = await createIntApp();
  const prisma = app.get(PrismaService);
  const sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);

  const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
  const call = (method: "get" | "post" | "put" | "patch", path: string, cookie: string, body?: unknown) =>
    request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
  const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
    const r = await res;
    expect(r.status, r.text).toBe(status);
    return schema.parse(r.body);
  };
  let n = 0;
  const register = async () => {
    const body = {
      firstName: "Bea", lastName: `Record${++n}`, birthDate: "2020-07-02", sex: "female", address: "",
      guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
      emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" },
      privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
    } as RegisterPatientInput;
    return (await ok(call("post", "/patients", await as(FRONT_DESK), body), Patient, 201)).id;
  };
  const start = async (patientId: string, cookie: string, dentistId = "staff_reyes") =>
    ok(call("post", `/patients/${patientId}/visits`, cookie, { dentistId }), Visit, 201);
  const complete = async (visitId: string, cookie: string) => ok(call("post", `/visits/${visitId}/complete`, cookie), Visit);
  /** One patient's audit entries for a record name, oldest first. */
  const auditOf = (patientId: string, record: string) =>
    inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.findMany({ where: { patientId, record }, orderBy: { at: "asc" }, select: { action: true } }));

  return { platform, app, prisma, as, call, ok, register, start, complete, auditOf };
}
