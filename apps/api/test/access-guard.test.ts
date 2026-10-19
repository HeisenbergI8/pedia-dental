import "reflect-metadata";
import { Controller, Get, Post, Put, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { AuditService } from "../src/audit/audit.service";
import { PatientRestrictions } from "../src/auth/patient-restrictions";
import { RecordOwners } from "../src/auth/record-owners";
import { IdentityService, type ClinicIdentity } from "../src/auth/identity.service";
import { SessionService } from "../src/auth/session.service";
import { requestContext } from "../src/common/request-context";
import { loadEnv } from "../src/config/env";
import { PrismaService } from "../src/prisma/prisma.service";

@Controller()
class Routes {
  @Get("clinic") clinic() { return requestContext.current(); }
  @Get("unruled") unruled() { return "reached"; }
  @Get("reports/finance") finance() { return "reached"; }
  @Get("operator/accounts") accounts() { return "reached"; }
  @Get("patients/:id/plan") plan() { return "reached"; }
  @Get("patients/:id") patient() { return "reached"; }
  @Post("appointments/:id/status") status() { return "reached"; }
  @Put("notes/:id") note() { return "reached"; }
  @Get("signups/x/unruled") signupsUnruled() { return "reached"; }
  @Get("operator/unruled") operatorUnruled() { return "reached"; }
}

/** A fake RecordOwners with only the appointment route registered; `lookups` counts the guard's calls. */
const appointmentOwner: Record<string, string> = { appt1: "kid1", appt2: "kid2" };
let lookups = 0;
/** B13c2b: the fake PatientRestrictions' answer; `denials` counts the guard's "denied" audit writes. */
let restricted: ReadonlySet<string> = new Set();
let denials: unknown[][] = [];

const branch = { id: "b1", clinicId: "c1", name: "Imus", address: "a", phone: "(046) 471 2580", openingHours: { opensAt: 480, closesAt: 1080, closedWeekdays: [0] }, archived: false };
let who: ClinicIdentity | undefined;
const as = (roles: ClinicIdentity["user"]["roles"], extra: Partial<ClinicIdentity> = {}): ClinicIdentity => ({
  clinicId: "c1", user: { id: "u1", name: "Ana", role: roles[0]!, roles }, email: "a@x", readOnly: false, billingOnly: false, mustChangePassword: false, branches: [branch], ...extra,
});

/** No database: the session and identity are fakes, the guard and the route map are real. */
describe("AccessGuard over HTTP", () => {
  let app: INestApplication;
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(loadEnv({ DATABASE_URL: "mysql://unused", LOG_LEVEL: "silent" }))], controllers: [Routes] })
      .overrideProvider(PrismaService).useValue({ $disconnect: async () => {} })
      .overrideProvider(SessionService).useValue({
        resolveClinic: async (t?: string) => (t === "good" ? { clinicId: "c1", accountId: "u1" } : undefined),
        resolveOperator: async (t?: string) => (t === "op" ? { operatorId: "operator_primolar" } : undefined),
        closeClinic: async () => {},
      })
      .overrideProvider(IdentityService).useValue({
        forSession: async () => who,
        branchFor: (w: ClinicIdentity, id?: string) => w.branches.find((b) => b.id === id) ?? w.branches[0],
        operator: async (id: string) => ({ id, name: "Op", email: "op@x" }),
      })
      .overrideProvider(RecordOwners).useValue({
        register: () => {},
        of: async (path: string, id?: string) => { lookups++; return path === "/appointments/:id/status" && id ? appointmentOwner[id] : undefined; },
      })
      .overrideProvider(PatientRestrictions).useValue({ register: () => {}, restricted: async () => restricted })
      .overrideProvider(AuditService).useValue({ record: async (...args: unknown[]) => { denials.push(args); } })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix("api");
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => { who = as(["dentist"]); lookups = 0; restricted = new Set(); denials = []; });

  const get = (path: string, cookie = "pd_session=good") => request(app.getHttpServer()).get(path).set("Cookie", cookie);

  it("answers 401 signed out, and 403 naming a route with no rule once signed in", async () => {
    expect((await get("/api/unruled", "")).status).toBe(401);
    const res = await get("/api/unruled");
    expect([res.status, res.text]).toEqual([403, "No access rule for GET /unruled"]);
  });

  it("decides by permission: the finance report for an admin, not a dentist", async () => {
    expect((await get("/api/reports/finance")).status).toBe(403);
    who = as(["admin"]);
    expect((await get("/api/reports/finance")).status).toBe(200);
  });

  it("fills the request context with clinic, user and a validated branch", async () => {
    const res = await get("/api/clinic", "pd_session=good; pd_branch=someone_elses");
    expect(res.body).toMatchObject({ clinicId: "c1", branchId: "b1", user: { id: "u1", roles: ["dentist"] }, operator: false });
  });

  it("holds every route behind a pending acknowledgement or password change", async () => {
    who = as(["dentist"], { mustAcknowledge: "confidentiality" });
    expect((await get("/api/clinic")).text).toBe("Acknowledge patient confidentiality to continue");
    who = as(["owner"], { mustChangePassword: true });
    expect((await get("/api/clinic")).text).toBe("Choose your own password to continue");
  });

  it("lets a parent reach their own child's record and refuses another's (decision 5)", async () => {
    who = as(["parent"], { guardianId: "g1", children: new Set(["kid1"]) });
    expect((await get("/api/patients/kid1/plan")).status).toBe(200);
    const other = await get("/api/patients/kid2/plan");
    expect([other.status, other.text]).toEqual([403, "This isn't one of your children's records"]);
  });

  it("still refuses a parent with no children on record", async () => {
    who = as(["parent"], { guardianId: "g1" });
    expect((await get("/api/patients/kid1/plan")).status).toBe(403);
  });

  it("asks a record route's registered owner for a parent (B7 decision 2)", async () => {
    who = as(["parent"], { guardianId: "g1", children: new Set(["kid1"]) });
    const post = (path: string) => request(app.getHttpServer()).post(path).set("Cookie", "pd_session=good");
    expect((await post("/api/appointments/appt1/status")).status).toBe(201); // reached the handler
    for (const id of ["appt2", "unknown"]) { // another child's, and an id with no record
      const res = await post(`/api/appointments/${id}/status`);
      expect([res.status, res.text]).toEqual([403, "This isn't one of your children's records"]);
    }
    expect(lookups).toBe(3);
  });

  it("still refuses a parent on a record route with no registered owner", async () => {
    who = as(["parent"], { guardianId: "g1", children: new Set(["kid1"]) });
    expect((await request(app.getHttpServer()).put("/api/notes/n1").set("Cookie", "pd_session=good")).status).toBe(403);
  });

  it("never looks the record up for staff who hold the permission at all", async () => {
    who = as(["front_desk"]);
    expect((await request(app.getHttpServer()).post("/api/appointments/appt2/status").set("Cookie", "pd_session=good")).status).toBe(201);
    expect(lookups).toBe(0);
  });

  it("refuses a restricted child's record to anyone without privacy.manage, and lets the Owner and admins read it (B13c2b)", async () => {
    restricted = new Set(["kid1"]);
    const refused = await get("/api/patients/kid1");
    expect(refused.status).toBe(403);
    expect(refused.text).toBe("This child's record is restricted after a privacy request. Ask the clinic's Owner.");
    expect(denials).toEqual([["denied", "Patient record (restricted)", "kid1"]]);
    expect((await get("/api/patients/kid2")).status).toBe(200);
    who = as(["admin"]);
    expect((await get("/api/patients/kid1")).status).toBe(200);
  });

  it("looks a record route's child up only when the clinic has a restricted child (B13c2b)", async () => {
    who = as(["front_desk"]);
    const status = () => request(app.getHttpServer()).post("/api/appointments/appt1/status").set("Cookie", "pd_session=good");
    await status();
    expect(lookups).toBe(0);
    restricted = new Set(["kid1"]);
    expect((await status()).status).toBe(403); // appt1 belongs to kid1
    expect(lookups).toBe(1);
  });

  it("keeps the operator and clinic cookies apart", async () => {
    expect((await get("/api/operator/accounts")).status).toBe(401); // a clinic session is not an operator
    expect((await get("/api/operator/accounts", "pd_operator=op")).status).toBe(200);
    expect((await get("/api/clinic", "pd_operator=op")).status).toBe(401); // nor the reverse
  });

  it("refuses a public route with no rule, and never needs a clinic session", async () => {
    const res = await request(app.getHttpServer()).get("/api/signups/x/unruled"); // no cookie at all (not /signups/unruled: that is GET /signups/:reference)
    expect([res.status, res.text]).toEqual([403, "No access rule for GET /signups/x/unruled"]);
    expect((await get("/api/clinic", "")).status).toBe(401); // the same browser has no clinic access
  });

  it("refuses an operator route with no rule", async () => {
    const res = await get("/api/operator/unruled", "pd_operator=op");
    expect([res.status, res.text]).toEqual([403, "No access rule for GET /operator/unruled"]);
  });
});
