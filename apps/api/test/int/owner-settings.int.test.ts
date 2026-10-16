import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, seedPlatform } from "@pedia/seed";
import {
  AddStaffResult, Branch, CONFIDENTIALITY_NOTICE, ClinicContext, ClinicUsage, DEFAULT_OPENING_HOURS, Session, StaffMember,
  type AddStaffInput, type BranchInput,
} from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web/src/mocks/owner-settings.test.ts, against the API (CHUNKS B3 done-when). Cases share one seeded database. */
const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

type Login = readonly [clinicId: string, accountId: string];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];
const DEMO_OWNER: Login = ["clinic_demo", "staff_villanueva"];
const DEMO_ADMIN: Login = ["clinic_demo", "staff_delacruz"];
const EXAMPLE_NEW = "EXAMPLE-chosen-at-first-sign-in";
const EXAMPLE_WRONG = "EXAMPLE-wrong";

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post" | "put", path: string, cookie = "", body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};
/** The API's own pd_session from a response (sign-in, password change: both set a new one). */
const sessionCookie = (res: request.Response) => (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
const login = (email: string, password: string) => call("post", "/auth/login", "", { email, password });
const branch = (name: string): BranchInput => ({ name, address: `1 ${name} Road, Cavite`, phone: "(046) 400 0000", openingHours: DEFAULT_OPENING_HOURS });
const newcomer = (email: string): AddStaffInput => ({ fullName: "Nora Ramos", email, role: "front_desk", branchIds: ["branch_ngiti_bacoor"] });

describe("Small tier at its limits (done-when)", () => {
  it("shows Ngiti at 1 of 1 branches and 5 of 5 logins", async () => {
    const usage = await ok(call("get", "/clinic/usage", await as(NGITI_OWNER)), ClinicUsage);
    expect(usage).toEqual({ tier: "small", branches: { inUse: 1, limit: 1 }, staffLogins: { inUse: 5, limit: 5 } });
  });

  it("refuses a second branch and a sixth login, naming the limit and how to lift it", async () => {
    const cookie = await as(NGITI_OWNER);
    const b = await call("post", "/branches", cookie, branch("Kawit"));
    expect([b.status, b.text]).toEqual([409, "Your Small plan includes 1 branch. Contact Primolar to upgrade."]);
    const s = await call("post", "/staff", cookie, newcomer("nora@ngiti.demo"));
    expect([s.status, s.text]).toEqual([409, "Your Small plan includes 5 staff logins. Contact Primolar to upgrade."]);
    // The limit is checked before the body (the mock's order): an empty body still gets the 409.
    expect((await call("post", "/staff", cookie, {})).status).toBe(409);
  });

  it("never archives the last open branch", async () => {
    expect((await call("post", "/branches/branch_ngiti_bacoor/archive", await as(NGITI_OWNER))).status).toBe(409);
  });
});

describe("deactivating frees a seat (decisions #10, #23)", () => {
  let added: AddStaffResult;

  it("refuses to deactivate the Owner", async () => {
    expect((await call("post", "/staff/ngiti_staff_lim/deactivate", await as(NGITI_OWNER))).status).toBe(400);
  });

  it("deactivates Joy Tan, which ends her session, then adds Nora in her seat", async () => {
    const tansSession = await as(["clinic_ngiti", "ngiti_staff_tan"]);
    const owner = await as(NGITI_OWNER);
    const tan = await ok(call("post", "/staff/ngiti_staff_tan/deactivate", owner), StaffMember);
    expect(tan.deactivatedAt).toBeDefined();
    expect((await call("get", "/staff", tansSession)).status).toBe(401);
    expect(await prisma.session.count({ where: { clinicId: "clinic_ngiti", accountId: "ngiti_staff_tan" } })).toBe(0);

    added = await ok(call("post", "/staff", owner, newcomer("nora@ngiti.demo")), AddStaffResult, 201);
    expect(added.temporaryPassword).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(added.pin).toMatch(/^\d{4}$/);
    expect((await ok(call("get", "/clinic/usage", owner), ClinicUsage)).staffLogins).toEqual({ inUse: 5, limit: 5 });
    // Her name stays for what she recorded; the temporary password is never served again, nor stored in the clear.
    const staff = await ok(call("get", "/staff", owner), z.array(StaffMember));
    expect(staff.find((s) => s.id === "ngiti_staff_tan")?.fullName).toBe("Joy Tan");
    expect(staff.at(-1)?.id).toBe(added.staff.id); // new logins go last
    expect(JSON.stringify(staff)).not.toContain(added.temporaryPassword);
    const cred = await prisma.credential.findFirst({ where: { clinicId: "clinic_ngiti", accountId: added.staff.id } });
    expect([cred?.mustChange, cred?.passwordHash.startsWith("$argon2id$")]).toEqual([true, true]);
  });

  it("won't reactivate Joy while the account is full", async () => {
    expect((await call("post", "/staff/ngiti_staff_tan/reactivate", await as(NGITI_OWNER))).status).toBe(409);
  });

  it("makes Nora choose her own password before anything else (decision #21)", async () => {
    expect((await login("nora@ngiti.demo", DEMO_PASSWORD)).status).toBe(401);
    const first = await login("nora@ngiti.demo", added.temporaryPassword);
    expect(Session.parse(first.body).user.mustChangePassword).toBe(true);
    let cookie = sessionCookie(first);

    const gated = await call("get", "/staff", cookie);
    expect([gated.status, gated.text]).toEqual([403, "Choose your own password to continue"]);
    // Nor can the device be handed on to a colleague's PIN to get past it.
    expect((await call("post", "/auth/switch", cookie, { accountId: "ngiti_staff_reyes", pin: "3691" })).status).toBe(403);
    expect((await call("post", "/auth/password", cookie, { current: EXAMPLE_WRONG, next: EXAMPLE_NEW })).status).toBe(400);
    const changed = await call("post", "/auth/password", cookie, { current: added.temporaryPassword, next: EXAMPLE_NEW });
    const user = Session.parse(changed.body).user;
    expect([user.mustChangePassword, user.mustAcknowledge]).toEqual([undefined, "confidentiality"]);
    cookie = sessionCookie(changed); // a password change rotates the session (B2)
    const ack = await call("get", "/staff", cookie);
    expect([ack.status, ack.text]).toEqual([403, "Acknowledge patient confidentiality to continue"]);
    await ok(call("post", "/auth/acknowledgement", cookie, { kind: "confidentiality", version: CONFIDENTIALITY_NOTICE.version }), Session);
    expect((await ok(call("get", "/staff", cookie), z.array(StaffMember))).length).toBeGreaterThan(0);

    expect((await login("nora@ngiti.demo", added.temporaryPassword)).status).toBe(401);
    expect((await login("nora@ngiti.demo", EXAMPLE_NEW)).status).toBe(200);
  });

  it("won't let Nora deactivate herself (clinic.manage is the Owner's)", async () => {
    const nora = await as(["clinic_ngiti", added.staff.id]);
    expect((await call("post", `/staff/${added.staff.id}/deactivate`, nora)).status).toBe(403);
  });
});

describe("one login per email, and who sees staff emails (audit findings)", () => {
  // Tenant tables are read inside the clinic's context (the extension refuses them otherwise).
  const joyEmail = async () => (await inClinic("clinic_ngiti", () => prisma.staff.findFirstOrThrow({ where: { id: "ngiti_staff_tan" }, select: { email: true } }))).email;

  it("won't reuse a deactivated login's email, so reactivating can't make two logins one email", async () => {
    const owner = await as(NGITI_OWNER);
    expect((await call("post", "/staff/ngiti_staff_dizon/deactivate", owner)).status).toBe(200); // a free seat: only the email can refuse
    const res = await call("post", "/staff", owner, newcomer(await joyEmail()));
    expect([res.status, res.text]).toEqual([409, `${await joyEmail()} already signs in to Ngiti Kids Dental`]);
  });

  it("won't reactivate a login whose email another login (a parent's) now has", async () => {
    // Two staff can't share an email any more (unique index), so the duplicate that "slipped in" is a parent's login.
    const row = await prisma.credential.create({
      data: { clinicId: "clinic_ngiti", accountId: "guardian.b3_probe", email: await joyEmail(), guardianId: "b3_probe", name: "Probe", passwordHash: "x", pinFailedAt: [] },
    });
    try {
      const res = await call("post", "/staff/ngiti_staff_tan/reactivate", await as(NGITI_OWNER));
      expect([res.status, res.text]).toEqual([409, `${await joyEmail()} is now another login's email. Reactivating would give two logins one email.`]);
    } finally {
      await prisma.credential.delete({ where: { id: row.id } });
    }
  });

  it("serves sign-in emails to the Owner only, and deactivation to staff only", async () => {
    const owners = await ok(call("get", "/staff", await as(NGITI_OWNER)), z.array(StaffMember));
    expect(owners.some((s) => s.email === "nora@ngiti.demo")).toBe(true);
    expect(owners.find((s) => s.id === "ngiti_staff_tan")?.deactivatedAt).toBeDefined();

    const dentists = await ok(call("get", "/staff", await as(["clinic_ngiti", "ngiti_staff_reyes"])), z.array(StaffMember));
    expect(dentists.some((s) => s.email)).toBe(false);
    expect(dentists.find((s) => s.id === "ngiti_staff_tan")?.deactivatedAt).toBeDefined();

    const guardian = platform.tenants.clinic_ngiti!.patients[0]!.guardians[0]!;
    const parents = await ok(call("get", "/staff", await as(["clinic_ngiti", `guardian.${guardian.id}`])), z.array(StaffMember));
    expect(parents.some((s) => s.email || s.deactivatedAt)).toBe(false);
    expect(parents.map((s) => s.fullName)).toContain("Joy Tan");
  });

  it("writes the mock's audit entries for each staff change, in the Owner's name", async () => {
    const rows = await inClinic("clinic_ngiti", () => prisma.auditEvent.findMany({ where: { actorId: "ngiti_staff_lim" }, orderBy: { at: "asc" }, select: { action: true, record: true } }));
    expect(rows).toEqual(expect.arrayContaining([
      { action: "update", record: "Staff login (deactivated)" },
      { action: "create", record: "Staff login" },
    ]));
  });
});

describe("archiving frees a branch slot (Mid, decisions #10, #22)", () => {
  let third: Branch;

  it("adds a third branch, refuses a fourth, and allows it once one is archived", async () => {
    const owner = await as(DEMO_OWNER);
    third = await ok(call("post", "/branches", owner, branch("Bacoor")), Branch, 201);
    const fourth = await call("post", "/branches", owner, branch("Kawit"));
    expect([fourth.status, fourth.text]).toEqual([409, "Your Mid plan includes 3 branches. Contact Primolar to upgrade."]);
    expect((await ok(call("post", `/branches/${third.id}/archive`, owner), Branch)).archived).toBe(true);
    expect((await ok(call("post", "/branches", owner, branch("Kawit")), Branch, 201)).archived).toBe(false);
    // The archived one leaves the switcher (decision #22) but stays in GET /branches for old records, in order.
    expect((await ok(call("get", "/clinic", owner), ClinicContext)).branches.map((b) => b.name)).not.toContain("Bacoor");
    expect((await ok(call("get", "/branches", owner), z.array(Branch))).map((b) => b.name)).toEqual(["Imus", "Dasmariñas", "Bacoor", "Kawit"]);
  });

  it("won't reopen the archived branch while the plan is full", async () => {
    const res = await call("post", `/branches/${third.id}/reopen`, await as(DEMO_OWNER));
    expect([res.status, res.text]).toEqual([409, "Your Mid plan includes 3 branches. Contact Primolar to upgrade."]);
  });

  it("won't archive a branch some staff work only at, and says who", async () => {
    const res = await call("post", "/branches/branch_imus/archive", await as(DEMO_OWNER));
    expect(res.status).toBe(409);
    expect(res.text).toMatch(/only at Imus\. Deactivate/);
  });

  it.todo("won't archive a branch with upcoming bookings (B7: appointments; BranchesService.upcomingAt)");

  it("keeps an over-limit account working after a downgrade, but adds nothing (decision #9)", async () => {
    await prisma.clinicAccount.update({ where: { id: "clinic_demo" }, data: { tier: "small" } }); // the operator's change (B12), made directly
    try {
      const owner = await as(DEMO_OWNER);
      expect((await ok(call("get", "/clinic", owner), ClinicContext)).branches).toHaveLength(3); // Imus, Dasmariñas, Kawit
      expect((await call("post", "/branches", owner, branch("Rosario"))).status).toBe(409);
    } finally {
      await prisma.clinicAccount.update({ where: { id: "clinic_demo" }, data: { tier: "mid" } });
    }
  });

  it("is the Owner's alone", async () => {
    const admin = await as(DEMO_ADMIN);
    expect((await call("post", "/staff", admin, newcomer("x@bulilit.demo"))).status).toBe(403);
    expect((await call("post", "/branches", admin, branch("Silang"))).status).toBe(403);
  });
});
