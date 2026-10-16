import type { INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { DEFAULT_OPENING_HOURS } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;
const hasher = new Hasher();

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
}, 60_000);
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, hasher, { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());

const as = async (clinicId: string, accountId: string) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const post = (path: string, cookie: string, body?: object) => request(app.getHttpServer()).post(`/api${path}`).set("Cookie", cookie).send(body);
const front = (email: string) => ({ fullName: "Parallel Person", email, role: "front_desk", branchIds: ["branch_ngiti_bacoor"] });
const statuses = (rs: request.Response[]) => rs.map((r) => r.status).sort();

describe("tier limits hold under concurrent requests (B3, Decision 4)", () => {
  it("two adds racing for Ngiti's last seat leave exactly one login", async () => {
    const owner = await as("clinic_ngiti", "ngiti_staff_lim");
    expect((await post("/staff/ngiti_staff_tan/deactivate", owner)).status).toBe(200); // 4 of 5
    const results = await Promise.all([post("/staff", owner, front("a@ngiti.demo")), post("/staff", owner, front("b@ngiti.demo"))]);
    expect(statuses(results)).toEqual([201, 409]);
    expect(await inClinic("clinic_ngiti", () => prisma.staff.count({ where: { deactivatedAt: null } }))).toBe(5);
  });

  it("a reactivation and an add racing for one seat leave exactly one", async () => {
    const owner = await as("clinic_ngiti", "ngiti_staff_lim");
    await post("/staff/ngiti_staff_tan/deactivate", owner);
    const results = await Promise.all([post("/staff/ngiti_staff_tan/reactivate", owner), post("/staff", owner, front("c@ngiti.demo"))]);
    expect(statuses(results).filter((s) => s === 409)).toHaveLength(1);
    expect(await inClinic("clinic_ngiti", () => prisma.staff.count({ where: { deactivatedAt: null } }))).toBe(5);
  });

  it("two branches racing for Bulilit's third slot leave exactly one", async () => {
    const owner = await as("clinic_demo", "staff_villanueva");
    const add = (name: string) => post("/branches", owner, { name, address: `1 ${name} Road, Cavite`, phone: "(046) 400 0000", openingHours: DEFAULT_OPENING_HOURS });
    expect(statuses(await Promise.all([add("Bacoor"), add("Kawit")]))).toEqual([201, 409]);
    expect(await inClinic("clinic_demo", () => prisma.branch.count({ where: { archived: false } }))).toBe(3);
  });

  it("two adds of one email at once leave one login (Mid has room, so only the email can refuse)", async () => {
    const owner = await as("clinic_demo", "staff_villanueva");
    const body = { fullName: "Twin", email: "twin@bulilit.demo", role: "front_desk", branchIds: ["branch_imus"] };
    expect(statuses(await Promise.all([post("/staff", owner, body), post("/staff", owner, body)]))).toEqual([201, 409]);
  });

  it("never blocks another clinic: Ngiti's lock doesn't hold up Bulilit", async () => {
    const [ngiti, demo] = [await as("clinic_ngiti", "ngiti_staff_lim"), await as("clinic_demo", "staff_villanueva")];
    const results = await Promise.all([post("/staff", ngiti, front("full@ngiti.demo")), post("/staff", demo, { ...front("free@bulilit.demo"), branchIds: ["branch_imus"] })]);
    expect(results.map((r) => r.status)).toEqual([409, 201]);
  });
});
