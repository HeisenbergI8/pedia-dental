import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, accountsByLogin, seedPlatform } from "@pedia/seed";
import { LoginResult, Session } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** Fake fixture secret for a password chosen in this test (never a real credential). */
const EXAMPLE_CHOSEN = "EXAMPLE-parent-1";

let app: INestApplication;
let prisma: PrismaService;
const platform = seedPlatform();
// The sibling family's mother: parent@gmail.com, and her mobile in LoginId's form (639XXXXXXXXX).
const mother = accountsByLogin(platform, "parent@gmail.com")[0]!.account;

beforeAll(async () => {
  app = await createIntApp(); // not a demo deployment: a seeded parent may change the demo password
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform); // the seed itself runs only so
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => { await prisma.rateLimitCounter.deleteMany(); });

const http = () => request(app.getHttpServer());
const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
const login = (email: string, password: string) => http().post("/api/auth/login").send({ email, password });

describe("parents sign in with their mobile or their email (B11 decision 4)", () => {
  it("opens the same login from the number in any common form, and from the email", async () => {
    const n = mother.phone!;
    for (const typed of [`0${n.slice(2)}`, `+63 ${n.slice(2, 5)} ${n.slice(5, 8)} ${n.slice(8)}`, n, "parent@gmail.com"]) {
      const res = await login(typed, DEMO_PASSWORD);
      expect([res.status, typed]).toEqual([200, typed]);
      expect(Session.parse(LoginResult.parse(res.body)).user).toMatchObject({ id: mother.id, role: "parent" });
    }
  });

  it("refuses a wrong password and an unknown number with one message", async () => {
    for (const [typed, password] of [[mother.phone!, "EXAMPLE-wrong-1"], ["09995550000", DEMO_PASSWORD]] as const) {
      const res = await login(typed, password);
      expect([res.status, res.text]).toEqual([401, "That mobile number or email and password don't match an account"]);
    }
  });

  it("keeps no usable link in the database off a demo deployment, and serves no demo texts (E5, E6)", async () => {
    const desk = cookieOf(await login("frontdesk@gmail.com", DEMO_PASSWORD));
    const child = (await http().post("/api/patients").set("Cookie", desk).send({
      firstName: "Nodemo", lastName: "Portal", birthDate: "2019-03-14", sex: "female", address: "",
      guardians: [{ id: "g_nodemo", fullName: "Rosa Nodemo", relationship: "Mother", phone: "09170009999", isPrimary: true }],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" }, privacyConsent: { guardianId: "g_nodemo", photos: true, reminders: true, confirmed: true },
    })).body as { id: string };
    expect((await http().post(`/api/patients/${child.id}/guardians/g_nodemo/portal-invite`).set("Cookie", desk)).status).toBe(200);
    while ((await app.get(OutboxWorker).drain()) > 0);
    const link = await prisma.portalLink.findFirstOrThrow({ where: { guardianId: "g_nodemo" } });
    expect([link.tokenHash?.length, link.demoToken]).toEqual([64, null]);
    expect((await http().get("/api/auth/demo-texts").set("Cookie", desk)).status).toBe(404);
  });

  it("lets a parent change their own password (decision 7), which signs the old sessions out", async () => {
    const old = cookieOf(await login(mother.phone!, DEMO_PASSWORD));
    const res = await http().post("/api/auth/password").set("Cookie", old).send({ current: DEMO_PASSWORD, next: EXAMPLE_CHOSEN });
    expect(res.status).toBe(200);
    expect((await http().get("/api/auth/me").set("Cookie", old)).status).toBe(401);
    expect((await login(mother.phone!, EXAMPLE_CHOSEN)).status).toBe(200);
    expect((await login(mother.phone!, DEMO_PASSWORD)).status).toBe(401);
  });

  it("drops a guardian taken off their only child: the session ends and sign-in fails (decision 10)", async () => {
    // A seeded guardian on exactly one child, who signs in with a mobile.
    const db = platform.tenants.clinic_demo!;
    const onOneChild = (id: string) => db.patients.filter((p) => p.guardians.some((x) => x.id === id)).length === 1;
    const cred = await prisma.credential.findFirstOrThrow({
      where: { clinicId: "clinic_demo", guardianId: { in: db.patients.flatMap((p) => p.guardians.map((x) => x.id)).filter(onOneChild) }, phone: { not: null } },
      select: { guardianId: true, phone: true },
    });
    const [g, phone] = [{ id: cred.guardianId! }, cred.phone!];
    const cookie = cookieOf(await login(phone, DEMO_PASSWORD));
    expect((await http().get("/api/patients").set("Cookie", cookie)).status).toBe(200);
    await inClinic("clinic_demo", () => prisma.patientGuardian.deleteMany({ where: { guardianId: g.id } }));
    expect((await http().get("/api/patients").set("Cookie", cookie)).status).toBe(401);
    expect((await login(phone, DEMO_PASSWORD)).status).toBe(401);
  });
});
