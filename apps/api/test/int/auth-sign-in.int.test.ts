import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, demoLogins, seedPlatform } from "@pedia/seed";
import { Appointment, DemoAccounts, LoginResult, Session, SessionUser } from "@pedia/shared";
import { startOfDay } from "date-fns";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createIntApp({ env: { DEMO_LOGINS: "true" } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());
// Every case signs in from 127.0.0.1. rate-limit.int.test.ts owns the limit, so it never decides a case here.
beforeEach(async () => { await prisma.rateLimitCounter.deleteMany(); });

const http = () => request(app.getHttpServer());
const login = (body: object) => http().post("/api/auth/login").send({ password: DEMO_PASSWORD, ...body });
/** `pd_session=<token>` from a response's Set-Cookie, ready to send back. */
const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!;
const me = (cookie: string) => http().get("/api/auth/me").set("Cookie", cookie.split(";")[0]!);
const trail = (clinicId: string, actorId: string) =>
  inClinic(clinicId, () => prisma.auditEvent.findMany({ where: { actorId }, select: { action: true, record: true } }));
/** The mock's clinic pick for the one email in two clinics. */
const clinicFor = (email: string) => (email === "owner@ngiti.demo" ? "clinic_ngiti" : "clinic_demo");

describe("POST /auth/login on MySQL", () => {
  it("signs in as each seeded role, with an httpOnly pd_session and no token in the body (B2 done-when)", async () => {
    for (const { role, email } of demoLogins(platform)) {
      const res = await login({ email, clinicId: clinicFor(email) });
      expect(res.status, email).toBe(200);
      expect(Session.parse(res.body).token).toBe("cookie");
      expect(cookieOf(res)).toMatch(/HttpOnly/);
      expect(SessionUser.parse((await me(cookieOf(res))).body).role, email).toBe(role);
      // The parent login is the two-children family.
      if (role === "parent") expect(((await http().get("/api/patients").set("Cookie", cookieOf(res).split(";")[0]!)).body as { id: string }[]).map((p) => p.id)).toContain("patient_sibling");
    }
  });

  it("signs in with the demo password only, any case of email, and logs each failure in its own clinic", async () => {
    expect((await login({ email: "DENTIST@GMAIL.COM", password: "wrong", clinicId: "clinic_demo" })).status).toBe(401);
    expect(await trail("clinic_demo", "staff_reyes")).toContainEqual({ action: "sign_in_failed", record: "Session" });
    expect(await trail("clinic_ngiti", "ngiti_staff_reyes")).toContainEqual({ action: "sign_in_failed", record: "Session" });
    const ok = await login({ email: "DENTIST@GMAIL.COM", clinicId: "clinic_demo" });
    expect((await me(cookieOf(ok))).body).toMatchObject({ role: "dentist", staffId: "staff_reyes" });
    expect(await trail("clinic_demo", "staff_reyes")).toContainEqual({ action: "sign_in", record: "Session" });
  });

  it("asks which clinic when an email is in two, then signs in to the one picked", async () => {
    expect(LoginResult.parse((await login({ email: "dentist@gmail.com" })).body)).toEqual({
      choices: [
        { clinicId: "clinic_demo", name: "Bulilit Smiles Pediatric Dental" },
        { clinicId: "clinic_ngiti", name: "Ngiti Kids Dental" },
      ],
    });
    expect((await login({ email: "dentist@gmail.com", clinicId: "clinic_ngiti" })).body.user).toMatchObject({ id: "ngiti_staff_reyes", clinicId: "clinic_ngiti" });
    expect((await login({ email: "dentist@gmail.com", clinicId: "clinic_nope" })).status).toBe(400);
  });

  it("refuses a suspended clinic's staff, ends their live sessions, and lets its parents in read-only (B2 done-when)", async () => {
    const tan = cookieOf(await login({ email: (await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_ngiti", accountId: "ngiti_staff_tan" } })).email, clinicId: "clinic_ngiti" }));
    const parent = await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_ngiti", guardianId: { not: null } } });
    await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "suspended" } });
    try {
      const refused = await login({ email: "owner@ngiti.demo" });
      expect([refused.status, refused.text]).toEqual([403, "Your clinic's Primolar account is paused. Contact your clinic."]);
      expect(await trail("clinic_ngiti", "ngiti_staff_lim")).toContainEqual({ action: "denied", record: "Session (account suspended)" });
      // dentist@gmail.com goes straight into the one active clinic: no chooser.
      expect(Session.parse((await login({ email: "dentist@gmail.com" })).body).user.clinicId).toBe("clinic_demo");
      expect((await me(tan)).status).toBe(401); // the live staff session ended
      const signedIn = await login({ email: parent.email, clinicId: "clinic_ngiti" });
      expect(Session.parse(signedIn.body).user).toMatchObject({ role: "parent", readOnly: true });
      const family = cookieOf(signedIn).split(";")[0]!;
      const reads = await http().get("/api/patients").set("Cookie", family);
      expect(reads.status).toBe(200); // reads work
      const [child] = reads.body as { id: string }[];
      const paused = [403, "Your clinic's account is paused, so you can view records but not make changes. Contact your clinic."];
      const confirm = await http().post("/api/appointments/ngiti_appointment_1/status").set("Cookie", family).send({ status: "confirmed" });
      expect([confirm.status, confirm.text]).toEqual(paused);
      const ask = await http().post(`/api/patients/${child!.id}/appointment-requests`).set("Cookie", family).send({});
      expect([ask.status, ask.text]).toEqual(paused);
    } finally {
      await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "active" } });
    }
  });
});

describe("POST /auth/logout and GET /auth/me on MySQL", () => {
  it("audits sign_out or timed_out as the person leaving, ends the session and clears the cookie", async () => {
    const idle = cookieOf(await login({ email: "admin@gmail.com" }));
    const out = await http().post("/api/auth/logout").set("Cookie", idle.split(";")[0]!).send({ reason: "idle" });
    expect([out.status, cookieOf(out)]).toEqual([200, expect.stringMatching(/^pd_session=;/)]);
    expect((await me(idle)).status).toBe(401);
    const user = cookieOf(await login({ email: "admin@gmail.com" }));
    await http().post("/api/auth/logout").set("Cookie", user.split(";")[0]!); // no body: reason "user"
    const actions = (await trail("clinic_demo", "staff_delacruz")).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["sign_in", "timed_out", "sign_out"]));
  });

  it("answers me with 401 for no cookie and for a made-up one", async () => {
    expect((await http().get("/api/auth/me")).status).toBe(401);
    expect((await me("pd_session=forged")).status).toBe(401);
  });
});

describe("GET /auth/demo-accounts on MySQL", () => {
  it("serves the demo clinic's people signed out, with one login per role", async () => {
    const { accounts, logins, password } = DemoAccounts.parse((await http().get("/api/auth/demo-accounts")).body);
    expect(password).toBe("pass123");
    expect(new Set(accounts.map((a) => a.role))).toEqual(new Set(["owner", "admin", "dentist", "front_desk", "parent"]));
    expect(accounts.filter((a) => a.role === "parent")).toHaveLength(3);
    for (const a of accounts) expect(Boolean(a.pin), a.name).toBe(a.role !== "parent");
    const pins = accounts.filter((a) => a.role !== "parent").map((a) => a.pin);
    expect(new Set(pins).size).toBe(pins.length); // their own PIN each
    expect(logins.map(({ role, email }) => [role, email])).toEqual([
      ["owner", "owner@gmail.com"],
      ["admin", "admin@gmail.com"],
      ["dentist", "dentist@gmail.com"],
      ["front_desk", "frontdesk@gmail.com"],
      ["parent", "parent@gmail.com"],
      ["owner", "owner@ngiti.demo"],
    ]);
    expect(logins.find((l) => l.email === "dentist@gmail.com")!.clinics).toEqual(["Bulilit Smiles Pediatric Dental", "Ngiti Kids Dental"]);
  });

  it("offers a 'to confirm' parent whose child's next visit is still booked", async () => {
    const { accounts } = DemoAccounts.parse((await http().get("/api/auth/demo-accounts")).body);
    const parent = accounts.find((a) => a.summary === "Has an appointment to confirm")!;
    const cookie = `pd_session=${await app.get(SessionService).openClinic("clinic_demo", parent.id)}`;
    const [child] = (await http().get("/api/patients").set("Cookie", cookie)).body as { id: string }[];
    const today = startOfDay(new Date()).toISOString();
    const next = z.array(Appointment).parse((await http().get(`/api/patients/${child!.id}/appointments`).set("Cookie", cookie)).body)
      .filter((a) => ["booked", "confirmed", "arrived", "in_chair"].includes(a.status) && a.startsAt >= today)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
    expect(next?.status).toBe("booked");
  });

  it("serves the signed-in account's people, and nothing at all without DEMO_LOGINS", async () => {
    const owner = cookieOf(await login({ email: "owner@ngiti.demo" }));
    const { accounts } = DemoAccounts.parse((await http().get("/api/auth/demo-accounts").set("Cookie", owner.split(";")[0]!)).body);
    expect(accounts.map((a) => a.email)).toContain("owner@ngiti.demo");
    expect(accounts.map((a) => a.email)).not.toContain("owner@gmail.com");
    const plain = await createIntApp();
    try {
      expect((await request(plain.getHttpServer()).get("/api/auth/demo-accounts")).status).toBe(404);
    } finally {
      await plain.close();
    }
  });
});
