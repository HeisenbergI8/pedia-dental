import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, seedPlatform } from "@pedia/seed";
import { OperatorSession, OperatorUser } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
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

  it("ends the operator session on sign-out", async () => {
    const op = cookie(await operatorLogin(DEMO_PASSWORD), "pd_operator")!;
    expect((await http().post("/api/operator/auth/logout").set("Cookie", op)).status).toBe(200);
    expect((await http().get("/api/operator/auth/me").set("Cookie", op)).status).toBe(401);
  });
});
