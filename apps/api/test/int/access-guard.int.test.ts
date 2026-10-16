import { Controller, Get, type INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, demoLogins, seedPlatform } from "@pedia/seed";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { requestContext } from "../../src/common/request-context";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { createIntApp } from "./support/int-app";
import { resetDatabase } from "./support/database";

@Controller()
class Routes {
  @Get("clinic") clinic() { return requestContext.current(); }
  @Get("reports/finance") finance() { return "reached"; }
  @Get("operator/accounts") accounts() { return "reached"; }
  @Get("patients/:id/plan") plan() { return "reached"; }
}

const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

beforeAll(async () => {
  app = await createIntApp({ controllers: [Routes] });
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

/** A session for the login with this email in this clinic, as B2c's login will open it. */
async function signIn(email: string, clinicId = DEMO_CLINIC_ID) {
  const cred = await prisma.credential.findFirstOrThrow({ where: { clinicId, email } });
  return { token: await sessions.openClinic(clinicId, cred.accountId), cred };
}
const get = (path: string, cookie: string) => request(app.getHttpServer()).get(path).set("Cookie", cookie);

describe("the access guard on MySQL", () => {
  it("lets every seeded login (each role, both clinics of a shared email) read its clinic, in its own clinic", async () => {
    for (const { email } of demoLogins(platform)) {
      const clinics = (await prisma.credential.findMany({ where: { email }, select: { clinicId: true } })).map((c) => c.clinicId);
      for (const clinicId of clinics) {
        const { token } = await signIn(email, clinicId);
        const res = await get("/api/clinic", `pd_session=${token}`);
        expect([email, res.status, res.body.clinicId]).toEqual([email, 200, clinicId]);
      }
    }
  });

  it("decides the finance report by role: the Owner yes, the dentist no", async () => {
    expect((await get("/api/reports/finance", `pd_session=${(await signIn("owner@gmail.com")).token}`)).status).toBe(200);
    expect((await get("/api/reports/finance", `pd_session=${(await signIn("dentist@gmail.com")).token}`)).status).toBe(403);
  });

  it("signs a suspended clinic's staff out on their next request, and keeps its parent read-only", async () => {
    const staff = await signIn("frontdesk@gmail.com");
    const parent = await signIn("parent@gmail.com");
    await prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "suspended" } });
    try {
      expect((await get("/api/clinic", `pd_session=${staff.token}`)).status).toBe(401);
      expect(await sessions.resolveClinic(staff.token)).toBeUndefined(); // closed, not just refused
      expect((await get("/api/clinic", `pd_session=${parent.token}`)).status).toBe(200);
    } finally {
      await prisma.clinicAccount.update({ where: { id: DEMO_CLINIC_ID }, data: { status: "active" } });
    }
  });

  it("holds a login that must change its password, or hasn't acknowledged confidentiality", async () => {
    const { token, cred } = await signIn("admin@gmail.com");
    await prisma.credential.updateMany({ where: { id: cred.id }, data: { mustChange: true } });
    expect((await get("/api/clinic", `pd_session=${token}`)).text).toBe("Choose your own password to continue");
    await prisma.credential.updateMany({ where: { id: cred.id }, data: { mustChange: false } });
    // Raw SQL on purpose: the extension refuses deletes on an append-only table, and this is test setup.
    await prisma.$executeRaw`DELETE FROM Acknowledgement WHERE clinicId = ${DEMO_CLINIC_ID} AND accountId = ${cred.accountId}`;
    expect((await get("/api/clinic", `pd_session=${token}`)).text).toBe("Acknowledge patient confidentiality to continue");
  });

  it("never accepts a clinic session as the operator's, or the reverse", async () => {
    const clinic = (await signIn("owner@gmail.com")).token;
    const operator = await sessions.openOperator("operator_primolar");
    expect((await get("/api/operator/accounts", `pd_session=${clinic}`)).status).toBe(401);
    expect((await get("/api/operator/accounts", `pd_operator=${clinic}`)).status).toBe(401);
    expect((await get("/api/clinic", `pd_session=${operator}`)).status).toBe(401);
    const res = await get("/api/operator/accounts", `pd_operator=${operator}`);
    expect(res.status).toBe(200);
  });

  it("ignores a pd_branch from another clinic", async () => {
    const { token } = await signIn("dentist@gmail.com");
    const [foreign] = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Branch WHERE clinicId <> ${DEMO_CLINIC_ID} LIMIT 1`;
    const res = await get("/api/clinic", `pd_session=${token}; pd_branch=${foreign!.id}`);
    const [row] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM Branch WHERE clinicId = ${DEMO_CLINIC_ID} AND id = ${res.body.branchId}`;
    expect(Number(row!.n)).toBe(1);
  });

  it("refuses a parent another family's record (and, until B11, any child's record)", async () => {
    const { token } = await signIn("parent@gmail.com");
    const res = await get("/api/patients/patient_sibling/plan", `pd_session=${token}`);
    expect([res.status, res.text]).toEqual([403, "This isn't one of your children's records"]);
  });
});
