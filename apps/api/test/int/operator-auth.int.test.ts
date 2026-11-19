import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, seedPlatform } from "@pedia/seed";
import { OperatorSession, OperatorUser } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { base32Decode, hotp, newTotpSecret, totpStep } from "../../src/auth/totp";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

const OPERATOR_EMAIL = "operator@primolar.demo";
let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => { await prisma.rateLimitCounter.deleteMany(); });

const http = () => request(app.getHttpServer());
const cookie = (res: request.Response, name: string) =>
  ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith(`${name}=`))?.split(";")[0];
const operatorLogin = (password: string) => http().post("/api/operator/auth/login").send({ email: OPERATOR_EMAIL, password });

describe("operator sign-in on MySQL", () => {
  it("signs in on pd_operator alone, and me answers with the operator (B2 done-when)", async () => {
    const res = await operatorLogin(DEMO_PASSWORD);
    expect(OperatorSession.parse(res.body)).toMatchObject({ token: "operator.cookie", operator: { email: OPERATOR_EMAIL } });
    expect(cookie(res, "pd_session")).toBeUndefined();
    const op = cookie(res, "pd_operator")!;
    expect(OperatorUser.parse((await http().get("/api/operator/auth/me").set("Cookie", op)).body).email).toBe(OPERATOR_EMAIL);
  });

  it("refuses a wrong password and an unknown email alike", async () => {
    expect((await operatorLogin("nope")).status).toBe(401);
    expect((await http().post("/api/operator/auth/login").send({ email: "nobody@primolar.demo", password: DEMO_PASSWORD })).status).toBe(401);
  });

  it("is not a clinic login, and a clinic session is not an operator one (decision #25)", async () => {
    expect((await http().post("/api/auth/login").send({ email: OPERATOR_EMAIL, password: DEMO_PASSWORD })).status).toBe(401);
    const clinic = await http().post("/api/auth/login").send({ email: "admin@gmail.com", password: DEMO_PASSWORD, clinicId: "clinic_demo" });
    const clinicToken = cookie(clinic, "pd_session")!.split("=")[1]!;
    expect((await http().get("/api/operator/auth/me").set("Cookie", `pd_session=${clinicToken}`)).status).toBe(401);
    expect((await http().get("/api/operator/auth/me").set("Cookie", `pd_operator=${clinicToken}`)).status).toBe(401);
    const op = cookie(await operatorLogin(DEMO_PASSWORD), "pd_operator")!;
    expect((await http().get("/api/auth/me").set("Cookie", op.replace("pd_operator", "pd_session"))).status).toBe(401);
  });

  it("asks an enrolled operator for the authenticator code, and takes each code once (security review #8)", async () => {
    const secret = newTotpSecret();
    await prisma.operatorUser.update({ where: { email: OPERATOR_EMAIL }, data: { totpSecret: secret, totpLastStep: null } });
    try {
      const withCode = (code?: string) => http().post("/api/operator/auth/login").send({ email: OPERATOR_EMAIL, password: DEMO_PASSWORD, code });
      const none = await withCode();
      expect([none.status, none.text]).toEqual([401, "Enter the 6-digit code from your authenticator app"]);
      const code = hotp(base32Decode(secret)!, totpStep(new Date()));
      const ok = await withCode(code.replace(/^(\d{3})/, "$1 ")); // as the app shows it, "123 456"
      expect([ok.status, cookie(ok, "pd_operator")]).toEqual([200, expect.stringMatching(/^pd_operator=/)]);
      const replayed = await withCode(code);
      expect([replayed.status, replayed.text]).toEqual([401, expect.stringContaining("already used")]);
      expect((await prisma.operatorUser.findUniqueOrThrow({ where: { email: OPERATOR_EMAIL } })).totpLastStep).toBeGreaterThan(0);
      // Two parallel sign-ins with one fresh code: only one gets in.
      await prisma.operatorUser.update({ where: { email: OPERATOR_EMAIL }, data: { totpLastStep: null } });
      await prisma.rateLimitCounter.deleteMany();
      const fresh = hotp(base32Decode(secret)!, totpStep(new Date()));
      const both = await Promise.all([withCode(fresh), withCode(fresh)]);
      expect(both.map((r) => r.status).sort()).toEqual([200, 401]);
    } finally {
      await prisma.operatorUser.update({ where: { email: OPERATOR_EMAIL }, data: { totpSecret: null, totpLastStep: null } });
    }
  });

  it("locks the operator login after five wrong passwords, as the clinic sign-in (security review #7)", async () => {
    for (let i = 0; i < 5; i++) expect((await operatorLogin("nope")).status).toBe(401);
    const locked = await operatorLogin(DEMO_PASSWORD);
    expect([locked.status, locked.text]).toEqual([429, "Too many wrong passwords. Try again in 1 minute."]);
    await prisma.rateLimitCounter.deleteMany();
  });

  it("ends the operator session on sign-out", async () => {
    const op = cookie(await operatorLogin(DEMO_PASSWORD), "pd_operator")!;
    expect((await http().post("/api/operator/auth/logout").set("Cookie", op)).status).toBe(200);
    expect((await http().get("/api/operator/auth/me").set("Cookie", op)).status).toBe(401);
  });
});
