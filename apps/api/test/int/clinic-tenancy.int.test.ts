import { Controller, Get, type INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { Branch, ClinicContext, SessionUser, StaffMember } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** A controller route missing from access-rules.ts: deny by default must name it. */
@Controller()
class Unruled {
  @Get("unruled") reached() { return "reached"; }
}

let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

beforeAll(async () => {
  app = await createIntApp({ controllers: [Unruled] });
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());

/** `pd_session` for this login (and `pd_branch`, the device's branch), as the browser sends them. */
const as = async (clinicId: string, accountId: string, branch?: string) =>
  [`pd_session=${await sessions.openClinic(clinicId, accountId)}`, branch && `pd_branch=${branch}`].filter(Boolean).join("; ");
const get = <T extends z.ZodType>(path: string, cookie: string, schema: T) =>
  request(app.getHttpServer()).get(`/api${path}`).set("Cookie", cookie).then((res) => {
    if (res.status !== 200) throw Object.assign(new Error(`${path}: ${res.status} ${res.text}`), { status: res.status, text: res.text });
    return schema.parse(res.body) as z.infer<T>;
  });
const status = (path: string, cookie = "") => request(app.getHttpServer()).get(`/api${path}`).set("Cookie", cookie).then((r) => r.status);
const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("clinic account isolation (tenancy.test.ts)", () => {
  it("lists only the signed-in account's staff and branches", async () => {
    const tan = await as("clinic_ngiti", "ngiti_staff_tan");
    expect(ids(await get("/staff", tan, z.array(StaffMember))).every((id) => id.startsWith("ngiti_"))).toBe(true);
    expect((await get("/branches", tan, z.array(Branch))).every((b) => b.clinicId === "clinic_ngiti")).toBe(true);
    const delacruz = await as("clinic_demo", "staff_delacruz");
    expect(ids(await get("/staff", delacruz, z.array(StaffMember))).some((id) => id.startsWith("ngiti_"))).toBe(false);
  });

  it("lists staff in the order the clinic added them, as the mock does", async () => {
    const owner = await as("clinic_demo", "staff_villanueva");
    expect(ids(await get("/staff", owner, z.array(StaffMember)))).toEqual(seedPlatform().tenants.clinic_demo!.staff.map((s) => s.id));
  });

  it("ignores a branch cookie that names another account's branch", async () => {
    const context = await get("/clinic", await as("clinic_ngiti", "ngiti_staff_tan", "branch_imus"), ClinicContext);
    expect([context.account.name, context.activeBranchId]).toEqual(["Ngiti Kids Dental", "branch_ngiti_bacoor"]);
  });
});

describe("roles and branches (tenancy.test.ts)", () => {
  it("keeps an Admin to their assigned branch, whatever the cookie says, and gives the Owner every branch", async () => {
    const admin = await as("clinic_demo", "staff_delacruz", "branch_dasma");
    const a = await get("/clinic", admin, ClinicContext);
    expect([ids(a.branches), a.activeBranchId]).toEqual([["branch_imus"], "branch_imus"]);
    expect((await get("/auth/me", admin, SessionUser)).roles).toEqual(["admin", "dentist"]); // decision #45
    const owner = await as("clinic_demo", "staff_villanueva", "branch_dasma");
    const o = await get("/clinic", owner, ClinicContext);
    expect([ids(o.branches), o.activeBranchId]).toEqual([["branch_imus", "branch_dasma"], "branch_dasma"]); // the mock's order
    expect(await get("/auth/me", owner, SessionUser)).toMatchObject({ role: "owner", roles: ["owner", "dentist"], clinicId: "clinic_demo" });
  });

  it("moves a staff member at two branches between them by the device's branch (B2 done-when)", async () => {
    const token = await sessions.openClinic("clinic_demo", "staff_reyes");
    for (const branch of ["branch_dasma", "branch_imus", "branch_dasma"]) {
      const context = await get("/clinic", `pd_session=${token}; pd_branch=${branch}`, ClinicContext);
      expect([context.activeBranchId, ids(context.branches)]).toEqual([branch, ["branch_imus", "branch_dasma"]]);
    }
  });

  it("starts a staff member at two branches at their first, Imus, when the device has no branch yet (the mock's order)", async () => {
    const token = await sessions.openClinic("clinic_demo", "staff_reyes");
    expect((await get("/clinic", `pd_session=${token}`, ClinicContext)).activeBranchId).toBe("branch_imus");
    expect(ids(await get("/branches", `pd_session=${token}`, z.array(Branch)))).toEqual(["branch_imus", "branch_dasma"]);
  });
});

describe("access control (handlers.test.ts, operator.test.ts)", () => {
  it("answers 403 naming a route with no rule once signed in, and 401 before (B2 done-when)", async () => {
    expect(await status("/unruled")).toBe(401);
    const res = await request(app.getHttpServer()).get("/api/unruled").set("Cookie", await as("clinic_demo", "staff_villanueva"));
    expect([res.status, res.text]).toEqual([403, "No access rule for GET /unruled"]);
  });

  it("refuses the clinic reads without a clinic session, the operator's included", async () => {
    const operator = `pd_operator=${await sessions.openOperator("operator_primolar")}`;
    for (const path of ["/clinic", "/branches", "/staff"]) {
      expect([path, await status(path)]).toEqual([path, 401]);
      expect([path, await status(path, operator)]).toEqual([path, 401]);
    }
  });

  it("serves every role the clinic reads, with emails to the Owner only", async () => {
    const parent = await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_demo", guardianId: { not: null } } });
    for (const accountId of ["staff_villanueva", "staff_delacruz", "staff_reyes", "staff_cruz", parent.accountId]) {
      const cookie = await as("clinic_demo", accountId);
      const staff = await get("/staff", cookie, z.array(StaffMember));
      expect(staff.every((s) => !!s.email), accountId).toBe(accountId === "staff_villanueva");
      expect((await get("/branches", cookie, z.array(Branch))).length, accountId).toBeGreaterThan(0);
      expect((await get("/clinic", cookie, ClinicContext)).account.id, accountId).toBe("clinic_demo");
    }
  });

  it("lets dentist and front desk load everything the patient record and documents tab read", async () => {
    const id = seedPlatform().tenants.clinic_demo!.patients[0]!.id;
    const paths = [
      ...["", "/visits", "/notes", "/chart", "/growth", "/plan", "/photos", "/appointments", "/invoices", "/payments", "/documents"].map((p) => `/patients/${id}${p}`),
      "/staff", "/procedures", "/chairs", "/note-templates", "/message-templates",
    ];
    for (const accountId of ["staff_reyes", "staff_cruz"]) {
      const cookie = await as("clinic_demo", accountId);
      for (const path of paths) expect([accountId, path, await status(path, cookie)]).toEqual([accountId, path, 200]);
    }
  });

  it("lets a suspended clinic's parents read, and nobody else (decisions #41, #44)", async () => {
    const parent = await prisma.credential.findFirstOrThrow({ where: { clinicId: "clinic_ngiti", guardianId: { not: null } } });
    const [staff, family] = [await as("clinic_ngiti", "ngiti_staff_tan"), await as("clinic_ngiti", parent.accountId)];
    await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "suspended" } });
    try {
      expect(await status("/clinic", staff)).toBe(401);
      expect((await get("/clinic", family, ClinicContext)).account.status).toBe("suspended");
    } finally {
      await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "active" } });
    }
  });
});
