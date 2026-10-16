import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { ChartEntry, Patient, Visit, deriveChart, surfacesFor, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { TenantScopeError } from "../../src/prisma/tenant-scope";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web's chart handler tests, against the API, plus CHUNKS B5's done-when. The system clock: entries order by time. */
const platform = seedPlatform();
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post", path: string, cookie: string, body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};

let n = 0;
const newPatient = (): RegisterPatientInput => ({
  firstName: "Bea", lastName: `Chart${++n}`, birthDate: "2020-07-02", sex: "female", address: "",
  guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
  emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
  dentalHistory: { previousClinic: "", notes: "" },
  privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
} as RegisterPatientInput);
const register = async () => (await ok(call("post", "/patients", await as(FRONT_DESK), newPatient()), Patient, 201)).id;
const start = async (patientId: string, cookie: string, dentistId = "staff_reyes") =>
  ok(call("post", `/patients/${patientId}/visits`, cookie, { dentistId }), Visit, 201);
const complete = async (visitId: string, cookie: string) => ok(call("post", `/visits/${visitId}/complete`, cookie), Visit);
const chart = (id: string) => `/patients/${id}/chart`;
const entries = async (id: string, cookie: string) => ok(call("get", chart(id), cookie), z.array(ChartEntry));
const auditOf = (patientId: string) =>
  inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.findMany({ where: { patientId, record: "Dental chart" }, select: { action: true } }));

describe("chart (apps/web handlers.test.ts → chart)", () => {
  it("records one finding on several teeth as one entry each, or none at all", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const visit = await start(id, admin);
    const rows = await ok(call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [74, 84, 75], surfaces: ["O"], condition: "caries" }), z.array(ChartEntry), 201);
    expect(rows.map((e) => e.tooth)).toEqual([74, 84, 75]);
    const derived = deriveChart(await entries(id, admin));
    expect([74, 84, 75].map((t) => derived.get(t)?.surfaces.O)).toEqual(["caries", "caries", "caries"]);

    await ok(call("post", chart(id), admin, { visitId: visit.id, tooth: 85, surfaces: [], condition: "extracted" }), ChartEntry, 201);
    const before = (await entries(id, admin)).length;
    const refused = await call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [54, 85], surfaces: [], condition: "sealant" });
    expect([refused.status, refused.text]).toEqual([409, "Tooth 85 is recorded as extracted or missing. Unpick it, or correct that entry"]);
    expect(await entries(id, admin)).toHaveLength(before);
    expect((await call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [51, 74], surfaces: ["O"], condition: "caries" })).status).toBe(400);
  });

  it("serves seeded entries in the shared schema, on surfaces the tooth has", async () => {
    const admin = await as(ADMIN);
    const all = (await Promise.all(platform.tenants[DEMO_CLINIC_ID]!.patients.map((p) => entries(p.id, admin)))).flat();
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((e) => e.surfaces.every((s) => surfacesFor(e.tooth).includes(s)))).toBe(true);
  });

  it("matches the mock's chart for every seeded patient (done-when)", async () => {
    const admin = await as(ADMIN);
    const db = platform.tenants[DEMO_CLINIC_ID]!;
    for (const p of db.patients) {
      const seeded = db.chartEntries
        .filter((e) => e.patientId === p.id)
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id))
        .map((e) => ({ ...e, clinicId: DEMO_CLINIC_ID }));
      const api = await entries(p.id, admin);
      expect(api).toEqual(seeded);
      expect(deriveChart(api)).toEqual(deriveChart(seeded));
    }
  });

  it("records caries on 74-O, restores it in a later visit, and keeps both in history (done-when)", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const first = await start(id, admin);
    await ok(call("post", chart(id), admin, { visitId: first.id, tooth: 74, surfaces: ["O"], condition: "caries" }), ChartEntry, 201);
    await complete(first.id, admin);
    const late = { visitId: first.id, tooth: 74, surfaces: ["O"], condition: "restored" };
    const refused = await call("post", chart(id), admin, late);
    expect([refused.status, refused.text]).toEqual([409, "Findings can only be recorded during a visit in progress"]);

    const second = await start(id, admin, "staff_santos");
    const restored = await ok(call("post", chart(id), admin, { ...late, visitId: second.id }), ChartEntry, 201);
    expect(restored.recordedBy).toBe("staff_santos");
    const tooth = deriveChart(await entries(id, admin)).get(74);
    expect(tooth?.surfaces.O).toBe("restored");
    expect(tooth?.history.map((e) => [e.visitId, e.condition])).toEqual([[first.id, "caries"], [second.id, "restored"]]);
  });

  it("shows the chart as of an earlier visit, the way the chart tab derives it", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const first = await start(id, admin);
    await ok(call("post", chart(id), admin, { visitId: first.id, tooth: 74, surfaces: ["O"], condition: "caries" }), ChartEntry, 201);
    await complete(first.id, admin);
    const second = await start(id, admin);
    await ok(call("post", chart(id), admin, { visitId: second.id, tooth: 74, surfaces: ["O"], condition: "restored" }), ChartEntry, 201);

    const visits = await ok(call("get", `/patients/${id}/visits`, admin), z.array(Visit));
    const asOf = (visitId: string) => {
      const until = visits.find((v) => v.id === visitId)!.startedAt;
      const upTo = new Set(visits.filter((v) => v.startedAt <= until).map((v) => v.id));
      return deriveChart(all.filter((e) => upTo.has(e.visitId))).get(74);
    };
    const all = await entries(id, admin);
    expect(asOf(first.id)?.surfaces.O).toBe("caries");
    expect(asOf(second.id)?.surfaces.O).toBe("restored");
    expect(asOf(second.id)?.history.map((e) => e.condition)).toEqual(["caries", "restored"]);
  });

  it("corrects an entry once, never in place, and rejects impossible findings", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const visit = await start(id, admin);
    const wrong = await ok(call("post", chart(id), admin, { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "caries" }), ChartEntry, 201);
    const fix = { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "sound", supersedes: wrong.id };
    await ok(call("post", chart(id), admin, fix), ChartEntry, 201);
    const again = await call("post", chart(id), admin, fix);
    expect([again.status, again.text]).toEqual([409, "That entry has already been corrected"]);
    const otherTooth = await call("post", chart(id), admin, { ...fix, tooth: 52 });
    expect([otherTooth.status, otherTooth.text]).toEqual([400, "A correction must replace an entry on the same tooth"]);

    const all = await entries(id, admin);
    expect(all.find((e) => e.id === wrong.id)?.condition).toBe("caries"); // the original is untouched
    expect(deriveChart(all).get(51)?.surfaces.M).toBe("sound");

    const extraction = { visitId: visit.id, tooth: 85, surfaces: [], condition: "extracted" };
    const extracted = await ok(call("post", chart(id), admin, extraction), ChartEntry, 201);
    const onGone = { visitId: visit.id, tooth: 85, surfaces: ["O"], condition: "caries" };
    const gone = await call("post", chart(id), admin, onGone);
    expect([gone.status, gone.text]).toEqual([409, "Tooth 85 is recorded as extracted or missing. Correct that entry instead"]);
    await ok(call("post", chart(id), admin, { ...extraction, condition: "sound", supersedes: extracted.id }), ChartEntry, 201);
    await ok(call("post", chart(id), admin, onGone), ChartEntry, 201); // once the extraction is corrected, the tooth is charted again

    const noSurface = await call("post", chart(id), admin, { visitId: visit.id, tooth: 51, surfaces: ["O"], condition: "caries" });
    expect([noSurface.status, noSurface.text]).toEqual([400, "Tooth 51 has no such surface"]);
    const wholeTooth = await call("post", chart(id), admin, { visitId: visit.id, tooth: 51, surfaces: ["M"], condition: "extracted" });
    expect([wholeTooth.status, Array.isArray(wholeTooth.body)]).toEqual([400, true]);
  });

  it("refuses update and delete on chart entries at the repository level (done-when)", async () => {
    const target = platform.tenants[DEMO_CLINIC_ID]!.chartEntries[0]!;
    await inClinic(DEMO_CLINIC_ID, async () => {
      const where = { id: target.id };
      const attempts = [
        () => prisma.chartEntry.update({ where, data: { condition: "sound" } }),
        () => prisma.chartEntry.updateMany({ where, data: { condition: "sound" } }),
        () => prisma.chartEntry.upsert({ where, create: { ...where, clinicId: DEMO_CLINIC_ID, patientId: "p", visitId: "v", tooth: 51, surfaces: [], condition: "sound", recordedBy: "d", recordedAt: new Date() }, update: { condition: "sound" } }),
        () => prisma.chartEntry.delete({ where }),
        () => prisma.chartEntry.deleteMany({ where }),
      ];
      for (const attempt of attempts) {
        await expect(attempt()).rejects.toThrow(TenantScopeError);
        await expect(attempt()).rejects.toThrow(/append-only/);
      }
      expect((await prisma.chartEntry.findUniqueOrThrow({ where, select: { condition: true } })).condition).toBe(target.condition);

      // The backstop: one correction per entry, at the database.
      const row = { patientId: target.patientId, visitId: target.visitId, tooth: target.tooth, surfaces: [], condition: "sound" as const, recordedBy: "d", recordedAt: new Date(), supersedes: target.id };
      await prisma.chartEntry.create({ data: { clinicId: DEMO_CLINIC_ID, ...row } });
      await expect(prisma.chartEntry.create({ data: { clinicId: DEMO_CLINIC_ID, ...row } })).rejects.toMatchObject({ code: "P2002" });
    });
  });

  it("corrects an entry exactly once under parallel requests (decision 5)", async () => {
    const admin = await as(ADMIN);
    for (let round = 0; round < 3; round++) {
      const id = await register();
      const visit = await start(id, admin);
      const original = await ok(call("post", chart(id), admin, { visitId: visit.id, tooth: 74, surfaces: ["O"], condition: "caries" }), ChartEntry, 201);
      const fix = { visitId: visit.id, tooth: 74, surfaces: ["O"], condition: "restored", supersedes: original.id };
      const results = await Promise.all(Array.from({ length: 10 }, () => call("post", chart(id), admin, fix)));
      expect(results.map((r) => r.status).sort()).toEqual([201, ...Array(9).fill(409)]);
      expect(results.filter((r) => r.status === 409).every((r) => r.text === "That entry has already been corrected")).toBe(true);
      expect(await inClinic(DEMO_CLINIC_ID, () => prisma.chartEntry.count({ where: { supersedes: original.id } }))).toBe(1);
    }
  });

  it("answers in the mock's order, with its words", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    const other = await register();
    const otherVisit = await start(other, admin);
    expect((await call("post", chart(id), admin, { visitId: "no_such_visit", tooth: 99 })).status).toBe(400); // the body first
    for (const visitId of ["no_such_visit", otherVisit.id]) {
      const res = await call("post", chart(id), admin, { visitId, tooth: 74, surfaces: ["O"], condition: "caries" });
      expect([res.status, res.text]).toEqual([404, "Visit not found for this patient"]);
    }
    const visit = await start(id, admin);
    await complete(visit.id, admin);
    const closed = await call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [74, 84], surfaces: ["O"], condition: "caries" });
    expect([closed.status, closed.text]).toEqual([409, "Findings can only be recorded during a visit in progress"]);
    const one = await call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [74], surfaces: [], condition: "caries" });
    expect([one.status, JSON.stringify(one.body)]).toEqual([400, expect.stringContaining("Pick at least two teeth")]);
    const twice = await call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [74, 74], surfaces: [], condition: "caries" });
    expect([twice.status, JSON.stringify(twice.body)]).toEqual([400, expect.stringContaining("A tooth is picked twice")]);
  });

  it("lets front desk read a chart but not write one", async () => {
    const id = await register();
    const desk = await as(FRONT_DESK);
    expect((await call("get", chart(id), desk)).status).toBe(200);
    const res = await call("post", chart(id), desk, {});
    expect([res.status, res.text]).toEqual([403, "You don't have access to this"]); // the gate before the body
  });

  it("audits reads and writes once per request, and a refused write leaves nothing", async () => {
    const admin = await as(ADMIN);
    const id = await register();
    await entries(id, admin);
    await entries(id, admin); // within five minutes: one view entry
    const visit = await start(id, admin);
    await ok(call("post", chart(id), admin, { visitId: visit.id, tooth: 85, surfaces: [], condition: "extracted" }), ChartEntry, 201);
    await ok(call("post", `${chart(id)}/batch`, admin, { visitId: visit.id, teeth: [74, 84, 75], surfaces: ["O"], condition: "caries" }), z.array(ChartEntry), 201);
    expect((await call("post", chart(id), admin, { visitId: visit.id, tooth: 85, surfaces: ["O"], condition: "caries" })).status).toBe(409);
    expect((await auditOf(id)).map((e) => e.action).sort()).toEqual(["update", "update", "view"]);
  });

  it("never reaches another clinic's chart", async () => {
    const db = platform.tenants[DEMO_CLINIC_ID]!;
    // Not the patient the repository-level case added a correction for.
    const patient = db.patients.find((p) => p.id !== db.chartEntries[0]!.patientId && db.chartEntries.some((e) => e.patientId === p.id))!;
    const visit = db.visits.find((v) => v.patientId === patient.id)!;
    const ngiti = await as(NGITI_OWNER);
    expect(await entries(patient.id, ngiti)).toEqual([]);
    const res = await call("post", chart(patient.id), ngiti, { visitId: visit.id, tooth: 74, surfaces: ["O"], condition: "caries" });
    expect([res.status, res.text]).toEqual([404, "Visit not found for this patient"]);
    const count = await inClinic(DEMO_CLINIC_ID, () => prisma.chartEntry.count({ where: { patientId: patient.id } }));
    expect(count).toBe(db.chartEntries.filter((e) => e.patientId === patient.id).length);
  });
});
