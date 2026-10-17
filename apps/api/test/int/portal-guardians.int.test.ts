import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, accountsByLogin, seedPlatform } from "@pedia/seed";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

// B11 decisions 14, 15 on MySQL: a guardian's number changed by staff moves their portal sign-in and ends their sessions.
let app: INestApplication;
let prisma: PrismaService;
const platform = seedPlatform();
const db = platform.tenants.clinic_demo!;
const mother = accountsByLogin(platform, "parent@gmail.com")[0]!.account; // the sibling family's primary guardian
const sibling = db.patients.find((p) => p.id === "patient_sibling")!;

beforeAll(async () => {
  app = await createIntApp({ env: { DEMO_LOGINS: "true" } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => { await prisma.rateLimitCounter.deleteMany(); });

const http = () => request(app.getHttpServer());
const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
const login = (email: string) => http().post("/api/auth/login").send({ email, password: DEMO_PASSWORD, clinicId: "clinic_demo" });
const patch = (cookie: string, id: string, phone: string) => http().patch(`/api/patients/${id}`).set("Cookie", cookie).send({ phone, nickname: "", tags: [], alerts: [] });

describe("a guardian's new number (B11)", () => {
  it("refuses a number another parent signs in with, and changes nothing (decision 14)", async () => {
    const desk = cookieOf(await login("frontdesk@gmail.com"));
    // Another seeded parent with a mobile sign-in, on a child of a different family.
    const other = await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_demo", guardianId: { not: mother.guardianId! }, phone: { not: null } }, select: { phone: true } });
    const res = await patch(desk, sibling.id, `0${other.phone!.slice(2)}`);
    expect([res.status, res.text]).toEqual([409, expect.stringContaining("already signs in to the portal as")]);
    const rows = await inClinic("clinic_demo", () => prisma.patientGuardian.findMany({ where: { guardianId: mother.guardianId! }, select: { phone: true } }));
    expect(new Set(rows.map((r) => r.phone))).toEqual(new Set([sibling.guardians.find((g) => g.isPrimary)!.phone]));
  });

  it("moves the sign-in to the new number and ends the parent's sessions (decision 15)", async () => {
    const desk = cookieOf(await login("frontdesk@gmail.com"));
    const parent = cookieOf(await login(mother.phone!));
    expect((await http().get("/api/auth/me").set("Cookie", parent)).status).toBe(200);
    expect((await patch(desk, sibling.id, "0917 000 1111")).status).toBe(200);
    expect((await http().get("/api/auth/me").set("Cookie", parent)).status).toBe(401);
    expect([(await login(mother.phone!)).status, (await login("09170001111")).status]).toEqual([401, 200]);
    expect((await login("parent@gmail.com")).status).toBe(200); // the email sign-in stays
  });

  it("leaves the sessions alone when only the way the number is written changes", async () => {
    const desk = cookieOf(await login("frontdesk@gmail.com"));
    const parent = cookieOf(await login("09170001111"));
    expect((await patch(desk, sibling.id, "+63 917 000 1111")).status).toBe(200);
    expect((await http().get("/api/auth/me").set("Cookie", parent)).status).toBe(200);
  });
});
