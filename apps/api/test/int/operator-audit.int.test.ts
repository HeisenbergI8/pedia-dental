import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, OPERATORS, seedPlatform } from "@pedia/seed";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** B13a Step 5.3 (F1): the platform trail of what the operator did, on MySQL. */
const OPERATOR = OPERATORS[0]!;
let app: INestApplication;
let prisma: PrismaService;
let op = "";

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
  op = await asOperator(app);
}, 60_000);

const http = () => request(app.getHttpServer());
const rows = () => prisma.operatorAuditEvent.findMany({ orderBy: { at: "asc" }, select: { operatorId: true, operatorName: true, action: true, record: true, detail: true, targetId: true } });
const clinicRows = async () => Number((await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM AuditEvent`)[0]!.n);

describe("the operator's audit trail", () => {
  it("records a change with its target, and nothing for a refused one or in the clinic's trail", async () => {
    const before = await clinicRows();
    expect((await http().post("/api/operator/accounts/clinic_ngiti/suspend").set("Cookie", op)).status).toBe(200);
    expect((await http().post("/api/operator/accounts/no_such_clinic/suspend").set("Cookie", op)).status).toBe(404);
    expect(await rows()).toEqual([
      { operatorId: OPERATOR.id, operatorName: OPERATOR.name, action: "update", record: "Clinic account", detail: "Account paused", targetId: "clinic_ngiti" },
    ]);
    expect(await clinicRows()).toBe(before);
  });

  it("records the price list with no target", async () => {
    const prices = (await http().get("/api/operator/prices").set("Cookie", op)).body;
    expect((await http().put("/api/operator/prices").set("Cookie", op).send(prices)).status).toBe(200);
    expect(await rows()).toMatchObject([{ record: "Price list", detail: "Price list saved", targetId: null }]);
  });

  it("records sign-in, a wrong password and sign-out; an unknown email records nothing", async () => {
    await prisma.rateLimitCounter.deleteMany();
    const login = (email: string, password: string) => http().post("/api/operator/auth/login").send({ email, password });
    const ok = await login(OPERATOR.email, DEMO_PASSWORD);
    expect(ok.status).toBe(200);
    expect((await login(OPERATOR.email, "wrong password!")).status).toBe(401);
    expect((await login("nobody@primolar.demo", DEMO_PASSWORD)).status).toBe(401);
    const cookie = ([] as string[]).concat(ok.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_operator="))!.split(";")[0]!;
    expect((await http().post("/api/operator/auth/logout").set("Cookie", cookie)).status).toBe(200);
    expect((await rows()).map((r) => [r.action, r.detail])).toEqual([["sign_in", "Signed in"], ["sign_in_failed", "Wrong password"], ["sign_out", "Signed out"]]);
  });

  it("is append-only", async () => {
    await http().post("/api/operator/accounts/clinic_ngiti/suspend").set("Cookie", op);
    const [row] = await prisma.operatorAuditEvent.findMany({ select: { id: true } });
    await expect(prisma.operatorAuditEvent.update({ where: { id: row!.id }, data: { detail: "x" } })).rejects.toThrow(/append-only|insert-only|OperatorAuditEvent/i);
  });
});
