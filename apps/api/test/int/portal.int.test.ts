import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, seedPlatform } from "@pedia/seed";
import { DemoTexts, Message, PasswordLink, Patient, PatientPage, PortalAccess, Session, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { MESSAGE_SEND } from "../../src/message-queue/message.rows";
import { SMS_PROVIDER, SmsRejected, SmsUnavailable, type SmsProvider, type SmsSend } from "../../src/message-queue/sms-provider";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

// B11 on MySQL: invites, links made at send time, first sign-in, resets, turn off. The cases share one database in order.
const at = (local: string) => new Date(`${local}+08:00`); // Manila wall time
const NIGHT = at("2026-10-20T22:00:00"); // outside sending hours: account texts go anyway (decision 12)
const clock = new FixedClock(NIGHT);
const WEB = "https://web.example.test";
/** Obviously fake test passwords (8+ characters, the staff rule). */
const pw = (n: number) => `EXAMPLE-pw-${n}`;

let app: INestApplication;
let prisma: PrismaService;
const calls: SmsSend[] = [];
let outcomes: ("ok" | Error)[] = [];

beforeAll(async () => {
  app = await createIntApp({ clock, env: { DEMO_LOGINS: "true", WEB_URL: WEB } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
  await prisma.outboxMessage.updateMany({ where: { kind: MESSAGE_SEND }, data: { status: "done" } }); // the seed's texts
  vi.spyOn(app.get<SmsProvider>(SMS_PROVIDER), "send").mockImplementation(async (sms) => {
    calls.push(sms);
    const outcome = outcomes.shift() ?? "ok";
    if (outcome !== "ok") throw outcome;
    return { providerRef: `test:${sms.messageId}`, segments: 2 };
  });
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  clock.set(NIGHT);
  calls.length = 0;
  outcomes = [];
  await prisma.rateLimitCounter.deleteMany();
});

const http = () => request(app.getHttpServer());
const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
const signIn = async (email: string, password = DEMO_PASSWORD) => cookieOf(await http().post("/api/auth/login").send({ email, password, clinicId: "clinic_demo" }));
const drain = async () => {
  while ((await app.get(OutboxWorker).drain()) > 0);
};
/** The token the parent's phone received last, from the provider's call (the database never holds it). */
const lastToken = (number?: string) => calls.filter((c) => !number || c.number === number).at(-1)!.body.split("#t=")[1]!;
const check = (token: string) => http().post("/api/auth/password-link").send({ token });
const accept = (token: string, password: string) => http().post("/api/auth/password-link/accept").send({ token, password });
const login = (email: string, password: string) => http().post("/api/auth/login").send({ email, password });

let desk = "";
/** A new child with two guardians: a mother on `phone` and a father on a landline. */
async function family(name: string, phone: string, reminders = true, email?: string) {
  const input: RegisterPatientInput = {
    firstName: name, lastName: "Portal", birthDate: "2019-03-14", sex: "female", address: "",
    guardians: [
      { id: `g_m_${name}`, fullName: `Rosa ${name}`, relationship: "Mother", phone, email, isPrimary: true },
      { id: `g_f_${name}`, fullName: `Jun ${name}`, relationship: "Father", phone: "(046) 471 2580", isPrimary: false },
    ],
    emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: `g_m_${name}`, photos: true, reminders, confirmed: true },
  };
  const res = await http().post("/api/patients").set("Cookie", desk).send(input);
  expect(res.status).toBe(201);
  return Patient.parse(res.body);
}
const access = async (id: string) => PortalAccess.array().parse((await http().get(`/api/patients/${id}/portal-access`).set("Cookie", desk)).body);
const invite = (id: string, g: string, cookie = desk) => http().post(`/api/patients/${id}/guardians/${g}/portal-invite`).set("Cookie", cookie);
const turnOff = (id: string, g: string) => http().post(`/api/patients/${id}/guardians/${g}/portal-off`).set("Cookie", desk);

describe("portal invitations on MySQL (B11)", () => {
  beforeAll(async () => {
    desk = await signIn("frontdesk@gmail.com");
  });

  it("shows a new family as not invited, with the landline blocked (decisions 1, 17)", async () => {
    const kid = await family("Ana", "09170000001");
    const [mother, father] = await access(kid.id);
    expect(mother).toEqual({ guardianId: "g_m_Ana", state: "not_invited" });
    expect(father).toMatchObject({ state: "not_invited", blocked: "Add a mobile number for Jun Ana to invite them" });
    expect((await access("patient_sibling"))[0]).toMatchObject({ state: "active" }); // a seeded parent (decision 13)
  });

  it("texts an invite at night to a family that declined reminders, the real link only to the phone (decisions 12, 20, E5)", async () => {
    const kid = await family("Bo", "09170000002", false);
    const res = await invite(kid.id, "g_m_Bo");
    expect(PortalAccess.parse(res.body)).toMatchObject({ state: "invited", inviteExpiresAt: new Date(NIGHT.getTime() + 72 * 3_600_000).toISOString() });
    await drain();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.number).toBe("639170000002");
    expect(calls[0]!.body).toMatch(new RegExp(`for Bo\\. Set your password within 72 hours: ${WEB}/set-password#t=[\\w-]{32}$`));
    const [logged] = Message.array().parse((await http().get(`/api/messages?patientId=${kid.id}`).set("Cookie", desk)).body);
    expect(logged).toMatchObject({ kind: "portal_invite", status: "sent", to: "09170000002" });
    expect(logged!.body).toContain("[link]");
    expect(logged!.body).not.toContain("#t=");
    const stored = await prisma.portalLink.findFirstOrThrow({ where: { guardianId: "g_m_Bo" } });
    expect(stored.tokenHash).toHaveLength(64);
    expect(stored.demoToken).toBe(lastToken()); // DEMO_LOGINS only (E6)
    expect(DemoTexts.parse((await http().get("/api/auth/demo-texts")).body).texts[0]).toMatchObject({ name: "Rosa Bo", purpose: "invite" });
  });

  it("checks the link, sets the password, signs in with the notice step, and works once (CHUNKS B11 done-when)", async () => {
    const kid = await family("Cy", "0917 000 0003");
    await invite(kid.id, "g_m_Cy");
    await drain();
    const token = lastToken();
    expect(PasswordLink.parse((await check(token)).body)).toEqual({ purpose: "invite", name: "Rosa Cy", clinicName: expect.any(String), login: "0917 ••• 0003" });
    const first = await accept(token, pw(1));
    expect(first.status).toBe(200);
    expect(Session.parse(first.body).user).toMatchObject({ role: "parent", guardianId: "g_m_Cy", mustAcknowledge: "notice" });
    expect([(await accept(token, pw(2))).status, (await check(token)).status]).toEqual([410, 410]);
    expect((await login("09170000003", pw(1))).status).toBe(200);
    expect((await login("09170000003", DEMO_PASSWORD)).status).toBe(401); // their own password, not the demo one
    expect((await access(kid.id))[0]).toMatchObject({ state: "active" });
    // Another family's child: 403 (the guard's own-scope check).
    const parent = cookieOf(first);
    const other = await inClinic("clinic_demo", () => prisma.patient.findFirstOrThrow({ where: { id: { not: kid.id } }, select: { id: true } }));
    expect((await http().get(`/api/patients/${other.id}`).set("Cookie", parent)).status).toBe(403);
  });

  it("makes only the newest link work: a resend, and a retry after a failed send (decision 5, E5)", async () => {
    const kid = await family("Di", "09170000004");
    await invite(kid.id, "g_m_Di");
    await drain();
    const first = lastToken();
    await invite(kid.id, "g_m_Di");
    await drain();
    const second = lastToken();
    expect([(await check(first)).status, (await check(second)).status]).toEqual([410, 200]);

    outcomes = [new SmsUnavailable("down")];
    await invite(kid.id, "g_m_Di");
    await drain();
    const failed = lastToken();
    clock.set(new Date(NIGHT.getTime() + 61_000)); // the first retry delay (B9 decision 5)
    await drain();
    clock.set(NIGHT);
    expect(calls.at(-2)!.body).not.toBe(calls.at(-1)!.body);
    expect([(await check(failed)).status, (await check(lastToken())).status]).toEqual([410, 200]);

    // A resend before the first text went out withdraws it: one text cancelled, one waiting, one sent.
    const early = await family("Dy", "09170000016");
    await invite(early.id, "g_m_Dy");
    await invite(early.id, "g_m_Dy");
    const log = Message.array().parse((await http().get(`/api/messages?patientId=${early.id}`).set("Cookie", desk)).body);
    expect(log.map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);
    await drain();
    expect(calls.filter((c) => c.number === "639170000016")).toHaveLength(1);
  });

  it("refuses a second guardian on a number another parent uses, under parallel invites too (decision 14)", async () => {
    const one = await family("Ed", "09170000005");
    const two = await family("Fe", "0917-000-0005");
    const res = await Promise.all([invite(one.id, "g_m_Ed"), invite(two.id, "g_m_Fe")]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(res.find((r) => r.status === 409)!.text).toMatch(/already signs in to the portal as Rosa (Ed|Fe)/);
    const blocked = res[0]!.status === 409 ? one : two;
    expect((await access(blocked.id))[0]!.blocked).toMatch(/Rosa (Ed|Fe)/);
    const sibling = seedPlatform().tenants.clinic_demo!.patients.find((p) => p.id === "patient_sibling")!;
    expect((await invite(sibling.id, sibling.guardians[0]!.id)).status).toBe(409); // already active
  });

  it("lets one of two parallel accepts of one link through (single use under a race)", async () => {
    const kid = await family("Gi", "09170000006");
    await invite(kid.id, "g_m_Gi");
    await drain();
    const token = lastToken();
    const res = await Promise.all([accept(token, pw(3)), accept(token, pw(4))]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 410]);
  });

  it("turns access off: the parent is signed out and can be invited again (decision 18)", async () => {
    const kid = await family("Ha", "09170000007");
    await invite(kid.id, "g_m_Ha");
    await drain();
    const parent = cookieOf(await accept(lastToken(), pw(5)));
    expect((await http().get("/api/auth/me").set("Cookie", parent)).status).toBe(200);
    expect(PortalAccess.parse((await turnOff(kid.id, "g_m_Ha")).body).state).toBe("off");
    expect((await http().get("/api/auth/me").set("Cookie", parent)).status).toBe(401);
    expect((await login("09170000007", pw(5))).status).toBe(401);
    expect((await turnOff(kid.id, "g_m_Ha")).status).toBe(409);
    expect(PortalAccess.parse((await invite(kid.id, "g_m_Ha")).body).state).toBe("invited");
  });

  it("stops a link already texted to the old number when staff change the number (decision 15, B11 audit)", async () => {
    const kid = await family("Ku", "09170000010");
    await invite(kid.id, "g_m_Ku");
    await drain();
    const stale = lastToken("639170000010");
    const quick = (phone: string) => http().patch(`/api/patients/${kid.id}`).set("Cookie", desk).send({ phone, nickname: "", tags: [], alerts: [] });
    expect((await quick("09170000011")).status).toBe(200); // a typo fixed: the text went to someone else
    expect((await check(stale)).status).toBe(410);
    const [status] = await access(kid.id);
    expect([status!.state, status!.blocked, status!.inviteExpiresAt]).toEqual(["invited", undefined, undefined]); // staff resend it
    await invite(kid.id, "g_m_Ku");
    await drain();
    const parent = cookieOf(await accept(lastToken("639170000011"), pw(10)));
    // A reset link texted before a number change stops too.
    expect((await http().post("/api/auth/password-reset").send({ login: "09170000011" })).status).toBe(202);
    await drain();
    const reset = lastToken("639170000011");
    expect((await quick("09170000012")).status).toBe(200);
    expect([(await check(reset)).status, (await http().get("/api/auth/me").set("Cookie", parent)).status]).toEqual([410, 401]);
  });

  it("lets an invite lapse after 72 hours and a reset after 30 minutes (decisions 5, 6)", async () => {
    const kid = await family("La", "09170000013");
    await invite(kid.id, "g_m_La");
    await drain();
    const token = lastToken("639170000013");
    clock.set(new Date(NIGHT.getTime() + 72 * 3_600_000 + 1000));
    desk = await signIn("frontdesk@gmail.com"); // three days on, the morning's session has ended
    expect((await check(token)).status).toBe(410);
    expect((await access(kid.id))[0]).toMatchObject({ state: "invited" });
    await invite(kid.id, "g_m_La"); // resend after it lapsed
    await drain();
    await accept(lastToken("639170000013"), pw(11));
    expect((await http().post("/api/auth/password-reset").send({ login: "09170000013" })).status).toBe(202);
    await drain();
    const reset = lastToken("639170000013");
    clock.set(new Date(clock.now().getTime() + 30 * 60_000 + 1000));
    expect((await check(reset)).status).toBe(410);
    clock.set(NIGHT);
    desk = await signIn("frontdesk@gmail.com");
  });

  it("leaves a parent whose email is another login's on their number only (decision 14)", async () => {
    const kid = await family("Ma", "09170000014", true, "parent@gmail.com"); // the seeded sibling family's address
    await invite(kid.id, "g_m_Ma");
    await drain();
    const res = await accept(lastToken("639170000014"), pw(12));
    expect(Session.parse(res.body).user.email).toBe("");
    expect((await login("09170000014", pw(12))).status).toBe(200);
    expect((await login("parent@gmail.com", pw(12))).status).toBe(401); // the email still opens only its own login
  });

  it("never marks a child 'no contact' for a failed invite (E4)", async () => {
    const kid = await family("Na", "09170000015");
    outcomes = [new SmsRejected("refused")];
    await invite(kid.id, "g_m_Na");
    await drain();
    const [logged] = Message.array().parse((await http().get(`/api/messages?patientId=${kid.id}`).set("Cookie", desk)).body);
    expect(logged).toMatchObject({ kind: "portal_invite", status: "failed" });
    const page = PatientPage.parse((await http().get(`/api/patient-summaries?q=${kid.firstName}`).set("Cookie", desk)).body);
    expect(page.rows.find((r) => r.id === kid.id)?.flags.noContact).toBe(false);
  });

  it("is front desk's, the Owner's and admins': a dentist and a parent get 403 (decision 16)", async () => {
    const kid = await family("Io", "09170000008");
    for (const cookie of [await signIn("dentist@gmail.com"), await signIn("parent@gmail.com")]) {
      expect((await http().get(`/api/patients/${kid.id}/portal-access`).set("Cookie", cookie)).status).toBe(403);
      expect((await invite(kid.id, "g_m_Io", cookie)).status).toBe(403);
    }
  });
});

describe("forgot password on MySQL (decisions 6, 19)", () => {
  const reset = (value: string) => http().post("/api/auth/password-reset").send({ login: value });

  it("answers 202 whether or not the number has an account, and texts only a parent's", async () => {
    const before = await inClinic("clinic_demo", () => prisma.message.count());
    expect((await reset("09995550000")).status).toBe(202);
    expect(await inClinic("clinic_demo", () => prisma.message.count())).toBe(before);

    const kid = await family("Jo", "09170000009");
    await invite(kid.id, "g_m_Jo");
    await drain();
    const old = cookieOf(await accept(lastToken("639170000009"), pw(6)));
    expect((await reset("0917 000 0009")).status).toBe(202);
    await drain();
    expect(calls.at(-1)!.body).toMatch(/Reset your parent portal password within 30 minutes\. .* https:\/\/web\.example\.test\/set-password#t=/);
    const token = lastToken("639170000009");
    expect(PasswordLink.parse((await check(token)).body).purpose).toBe("reset");
    expect((await accept(token, pw(7))).status).toBe(200);
    expect((await http().get("/api/auth/me").set("Cookie", old)).status).toBe(401); // every device on the old password
    expect([(await login("09170000009", pw(6))).status, (await login("09170000009", pw(7))).status]).toEqual([401, 200]);
  });

  it("allows 3 texts per number in any hour, unknown numbers too, and keeps only a hash of what was typed", async () => {
    clock.set(at("2026-10-20T22:58:00"));
    for (let i = 0; i < 3; i++) expect((await reset("09995550001")).status).toBe(202);
    clock.set(at("2026-10-20T23:01:00")); // a new clock hour: still the same rolling hour
    expect((await reset("0999 555 0001")).status).toBe(429);
    clock.set(at("2026-10-20T23:59:30"));
    expect((await reset("09995550001")).status).toBe(202);
    const buckets = (await prisma.rateLimitCounter.findMany({ select: { bucket: true } })).map((r) => r.bucket);
    expect(buckets.some((b) => b.includes("9995550001"))).toBe(false);
  });
});

describe("a parent's own password on a demo deployment (decision 7)", () => {
  it("keeps a seeded parent on the demo password, and lets a parent with their own change it", async () => {
    const seeded = await signIn("parent@gmail.com");
    expect((await http().post("/api/auth/password").set("Cookie", seeded).send({ current: DEMO_PASSWORD, next: pw(20) })).status).toBe(403);
    const kid = await family("Pe", "09170000017");
    await invite(kid.id, "g_m_Pe");
    await drain();
    const own = cookieOf(await accept(lastToken("639170000017"), pw(21)));
    expect((await http().post("/api/auth/password").set("Cookie", own).send({ current: pw(21), next: pw(22) })).status).toBe(200);
    expect((await login("09170000017", pw(22))).status).toBe(200);
  });
});
