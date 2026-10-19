import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, seedPlatform } from "@pedia/seed";
import { AcknowledgementPrompt, CONFIDENTIALITY_NOTICE, Session, SessionUser } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** Fake fixture secrets for a login made in this test (never a real credential). */
const EXAMPLE_TEMPORARY = "EXAMPLE-temp-1";
const EXAMPLE_CHOSEN = "EXAMPLE-chosen-1";

let app: INestApplication;
let prisma: PrismaService;
const hasher = new Hasher();

beforeAll(async () => {
  app = await createIntApp({ env: { DEMO_LOGINS: "true" } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => { await prisma.rateLimitCounter.deleteMany(); });

const http = () => request(app.getHttpServer());
const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
/** Signs in through POST /auth/login; `branch` is the device's pd_branch, as the web store writes it. */
async function signIn(email: string, branch?: string) {
  const res = await http().post("/api/auth/login").send({ email, password: DEMO_PASSWORD, clinicId: "clinic_demo" });
  return [cookieOf(res), branch && `pd_branch=${branch}`].filter(Boolean).join("; ");
}
const pinOf = async (accountId: string) => (await prisma.demoLogin.findFirstOrThrow({ where: { clinicId: "clinic_demo", accountId } })).pin!;
const switchTo = async (cookie: string, accountId: string, pin?: string) =>
  http().post("/api/auth/switch").set("Cookie", cookie).send({ accountId, pin: pin ?? (await pinOf(accountId)) });
const trail = (actorId: string, record: string) =>
  inClinic("clinic_demo", () => prisma.auditEvent.findMany({ where: { actorId, record }, orderBy: { at: "asc" }, select: { action: true } })).then((r) => r.map((e) => e.action));
const me = (cookie: string) => http().get("/api/auth/me").set("Cookie", cookie);

describe("POST /auth/switch on MySQL", () => {
  it("switches with the person's own PIN, logs who left and who arrived, and rotates the session", async () => {
    const desk = await signIn("frontdesk@gmail.com");
    const res = await switchTo(desk, "staff_reyes");
    expect(Session.parse(res.body).user).toMatchObject({ id: "staff_reyes", role: "dentist" });
    expect(await trail("staff_cruz", "Session (switched user)")).toEqual(["sign_out"]);
    expect(await trail("staff_reyes", "Session (PIN switch)")).toEqual(["sign_in"]);
    expect((await me(desk)).status).toBe(401);
    expect(SessionUser.parse((await me(cookieOf(res))).body).id).toBe("staff_reyes");
  });

  it("refuses a wrong PIN with the tries left, then locks that person after five, even with the right PIN", async () => {
    const desk = await signIn("frontdesk@gmail.com");
    for (const left of ["4 tries", "3 tries", "2 tries", "1 try"]) {
      const res = await switchTo(desk, "staff_santos", "0000");
      expect([res.status, res.text]).toEqual([401, expect.stringContaining(`${left} left`)]);
    }
    expect((await switchTo(desk, "staff_santos", "0000")).status).toBe(429);
    expect((await switchTo(desk, "staff_santos")).status).toBe(429);
    expect(await trail("staff_santos", "Session (PIN switch)")).toEqual([...Array(5).fill("sign_in_failed"), "denied"]);
    expect(Session.parse((await switchTo(desk, "staff_delacruz")).body).user.role).toBe("admin"); // per person, not per device
  });

  it("never switches to a parent, never from a parent, and never without a session", async () => {
    const parent = await prisma.demoLogin.findFirstOrThrow({ where: { clinicId: "clinic_demo", role: "parent" } });
    expect((await switchTo(await signIn("frontdesk@gmail.com"), parent.accountId, "1234")).status).toBe(400);
    expect((await switchTo(await signIn("parent@gmail.com"), "staff_cruz")).status).toBe(403);
    expect((await switchTo("", "staff_cruz")).status).toBe(401);
  });

  it("switches only to staff who work at this device's branch (tenancy.test.ts)", async () => {
    const reyes = await signIn("dentist@gmail.com", "branch_dasma");
    const refused = await switchTo(reyes, "staff_cruz");
    expect([refused.status, refused.text]).toEqual([400, expect.stringContaining("doesn't work at Dasmariñas")]);
    const cruz = await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_demo", accountId: "staff_cruz" } });
    expect(cruz.pinFailedAt).toEqual([]); // not a PIN attempt
    expect(Session.parse((await switchTo(reyes, "staff_villanueva")).body).user.role).toBe("owner"); // the Owner works everywhere
  });
});

describe("POST /auth/password and /auth/acknowledgement on MySQL", () => {
  it("keeps the demo password on a demo deployment", async () => {
    const admin = await signIn("admin@gmail.com");
    expect((await http().post("/api/auth/password").set("Cookie", admin).send({ current: DEMO_PASSWORD, next: EXAMPLE_CHOSEN })).status).toBe(403);
  });

  it("takes a login the Owner added from its temporary password, through confidentiality, to work", async () => {
    await inClinic("clinic_demo", () =>
      prisma.staff.create({ data: { id: "staff_new", clinicId: "clinic_demo", fullName: "Nina Ramos", role: "front_desk", alsoRoles: [], branchIds: ["branch_imus"], email: "nina@bulilit.demo" } }));
    await prisma.credential.create({
      data: { clinicId: "clinic_demo", accountId: "staff_new", email: "nina@bulilit.demo", staffId: "staff_new", name: "Nina Ramos", passwordHash: await hasher.hash(EXAMPLE_TEMPORARY), mustChange: true, pinFailedAt: [] },
    });
    const first = await http().post("/api/auth/login").send({ email: "nina@bulilit.demo", password: EXAMPLE_TEMPORARY });
    expect(Session.parse(first.body).user.mustChangePassword).toBe(true);
    const temp = cookieOf(first);
    expect((await switchTo(temp, "staff_reyes")).text).toBe("Choose your own password to continue");

    const change = (current: string) => http().post("/api/auth/password").set("Cookie", temp).send({ current, next: EXAMPLE_CHOSEN });
    expect((await change("not-it")).status).toBe(400);
    const changed = await change(EXAMPLE_TEMPORARY);
    expect(Session.parse(changed.body).user).toMatchObject({ mustAcknowledge: "confidentiality" });
    expect(changed.body.user.mustChangePassword).toBeUndefined();
    expect((await me(temp)).status).toBe(401); // every session on the old password ended
    expect(await trail("staff_new", "Password")).toEqual(["denied", "update"]);

    const own = cookieOf(changed);
    const prompt = AcknowledgementPrompt.parse((await http().get("/api/auth/acknowledgement").set("Cookie", own)).body);
    expect([prompt.kind, prompt.version]).toEqual(["confidentiality", CONFIDENTIALITY_NOTICE.version]);
    expect(prompt.paragraphs[0]).toContain("every access is logged");
    const ack = (version: number) => http().post("/api/auth/acknowledgement").set("Cookie", own).send({ kind: "confidentiality", version });
    expect((await ack(CONFIDENTIALITY_NOTICE.version + 1)).status).toBe(409);
    expect(Session.parse((await ack(CONFIDENTIALITY_NOTICE.version)).body).user.mustAcknowledge).toBeUndefined();
    expect(await trail("staff_new", "Confidentiality (acknowledged)")).toEqual(["create"]);
    expect((await http().get("/api/patients").set("Cookie", own)).status).toBe(200); // to work
    expect((await http().get("/api/auth/acknowledgement").set("Cookie", own)).status).toBe(409);
  });
});
