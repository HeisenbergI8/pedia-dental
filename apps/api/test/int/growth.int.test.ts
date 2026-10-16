import { DEMO_CLINIC_ID } from "@pedia/seed";
import { format, parseISO } from "date-fns";
import { GrowthRecord, Visit, habitTimeline } from "@pedia/shared";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp } from "./clinical-support";

/** apps/web's growth handler tests, against the API (CHUNKS B6). System clock: races compare recordedAt and completedAt. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
beforeAll(async () => {
  t = await clinicalApp();
}, 60_000);
afterAll(() => t.app.close());

const save = (visitId: string, body: unknown, cookie: string) => t.call("put", `/visits/${visitId}/growth`, cookie, body);
const list = async (patientId: string, cookie: string) => t.ok(t.call("get", `/patients/${patientId}/growth`, cookie), z.array(GrowthRecord));
/** The clinic day of a timestamp, as habitTimeline computes it (local time: Manila since B7). */
const day = (iso: string) => format(parseISO(iso), "yyyy-MM-dd");
const thumb = { habit: "thumb_sucking", startedOn: "2023-06-01" } as const;

describe("growth (apps/web handlers.test.ts → growth)", () => {
  it("shows a habit recorded at one visit and stopped at a later one (done-when)", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    const first = await t.start(id, admin);
    const a = await t.ok(save(first.id, { habits: [thumb, { habit: "pacifier" }] }, admin), GrowthRecord);
    const b = await t.ok(save(first.id, { habits: [thumb] }, admin), GrowthRecord); // a re-save replaces the record
    expect(b.id).toBe(a.id);
    await t.complete(first.id, admin);
    const late = await save(first.id, { habits: [] }, admin);
    expect([late.status, late.text]).toEqual([409, "Growth is recorded during a visit in progress"]);

    const second = await t.start(id, admin);
    await t.ok(save(second.id, { habits: [{ ...thumb, stoppedOn: "2026-05-20" }], speech: "Lisps on /s/" }, admin), GrowthRecord);
    const records = await list(id, admin);
    expect(records.map((r) => r.visitId)).toEqual([first.id, second.id]);
    expect(habitTimeline(records)).toEqual([{ habit: "thumb_sucking", startedOn: "2023-06-01", stoppedOn: "2026-05-20", visitIds: [first.id, second.id] }]);
  });

  it("shows a habit left unticked at a later visit as stopped there", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    const first = await t.start(id, admin);
    await t.ok(save(first.id, { habits: [{ habit: "mouth_breathing" }] }, admin), GrowthRecord);
    await t.complete(first.id, admin);
    const second = await t.start(id, admin);
    const later = await t.ok(save(second.id, { habits: [] }, admin), GrowthRecord);
    const [habit] = habitTimeline(await list(id, admin));
    expect(habit).toMatchObject({ habit: "mouth_breathing", stopInferred: true, stoppedOn: day(later.recordedAt) });
  });

  it("serves the seeded examples as the mock does", async () => {
    const admin = await t.as(ADMIN);
    const seeded = t.platform.tenants[DEMO_CLINIC_ID]!.growth;
    const patients = [...new Set(seeded.map((g) => g.patientId))];
    expect(patients).toHaveLength(3);
    const timelines = [];
    for (const id of patients) {
      const mine = seeded.filter((g) => g.patientId === id).sort((x, y) => x.recordedAt.localeCompare(y.recordedAt));
      const api = await list(id, admin);
      expect(api).toEqual(mine.map((g) => ({ ...g, clinicId: DEMO_CLINIC_ID })));
      timelines.push(habitTimeline(api));
    }
    expect(timelines.some((tl) => tl.some((h) => h.stoppedOn && !h.stopInferred))).toBe(true);
    expect(timelines.some((tl) => tl.some((h) => !h.stoppedOn))).toBe(true);
    expect(timelines.some((tl) => tl.some((h) => h.stopInferred))).toBe(true);
  });

  it("rejects impossible habits", async () => {
    const admin = await t.as(ADMIN);
    const visit = await t.start(await t.register(), admin);
    const issues = z.array(z.object({ path: z.array(z.unknown()), message: z.string() }));
    const backwards = await save(visit.id, { habits: [{ habit: "bruxism", startedOn: "2026-05-01", stoppedOn: "2026-01-01" }] }, admin);
    expect(backwards.status).toBe(400);
    expect(issues.parse(backwards.body)[0]).toMatchObject({ path: ["habits", 0, "stoppedOn"], message: "Stopped before it started" });
    const twice = await save(visit.id, { habits: [{ habit: "bruxism" }, { habit: "bruxism" }] }, admin);
    expect([twice.status, JSON.stringify(twice.body)]).toEqual([400, expect.stringContaining("Each habit once")]);
    const nextYear = `${new Date().getFullYear() + 1}-01-01`;
    const future = await save(visit.id, { habits: [{ habit: "bruxism", startedOn: nextYear }] }, admin);
    expect([future.status, JSON.stringify(future.body)]).toEqual([400, expect.stringContaining("Can't be in the future")]);
  });

  it("answers in the mock's order, with its words", async () => {
    const admin = await t.as(ADMIN);
    const unknown = await save("no_such_visit", { habits: "nope" }, admin);
    expect([unknown.status, unknown.text, unknown.type]).toEqual([404, "Visit not found", "text/plain"]);
    const visit = await t.start(await t.register(), admin);
    await t.complete(visit.id, admin);
    const closed = await save(visit.id, { habits: "nope" }, admin);
    expect([closed.status, closed.type]).toEqual([409, "text/plain"]);
  });

  it("lets front desk read growth but not record it", async () => {
    const id = await t.register();
    const visit = await t.start(id, await t.as(ADMIN));
    const desk = await t.as(FRONT_DESK);
    expect((await t.call("get", `/patients/${id}/growth`, desk)).status).toBe(200);
    const res = await save(visit.id, { habits: [] }, desk);
    expect([res.status, res.text]).toEqual([403, "You don't have access to this"]);
  });

  it("never reaches another clinic's visit", async () => {
    const id = await t.register();
    const visit = await t.start(id, await t.as(ADMIN));
    const ngiti = await t.as(NGITI_OWNER);
    const res = await save(visit.id, { habits: [] }, ngiti);
    expect([res.status, res.text]).toEqual([404, "Visit not found"]);
    expect(await list(id, ngiti)).toEqual([]);
  });

  it("audits reads and saves, and a refused save leaves nothing", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    const visit = await t.start(id, admin);
    await t.ok(save(visit.id, { habits: [thumb] }, admin), GrowthRecord);
    await t.ok(save(visit.id, { habits: [] }, admin), GrowthRecord);
    await list(id, admin);
    await list(id, admin); // within five minutes: one view
    expect((await save(visit.id, { habits: "nope" }, admin)).status).toBe(400);
    await t.complete(visit.id, admin);
    expect((await save(visit.id, { habits: [] }, admin)).status).toBe(409);
    expect((await t.auditOf(id, "Growth and habits")).map((e) => e.action)).toEqual(["update", "update", "view"]);
  });

  it("keeps one record per visit under parallel saves", async () => {
    const admin = await t.as(ADMIN);
    for (let round = 0; round < 3; round++) {
      const visit = await t.start(await t.register(), admin);
      const speeches = Array.from({ length: 10 }, (_, i) => `note ${i}`);
      const results = await Promise.all(speeches.map((speech) => save(visit.id, { habits: [], speech }, admin)));
      expect(results.map((r) => r.status)).toEqual(Array(10).fill(200));
      expect(new Set(results.map((r) => GrowthRecord.parse(r.body).id)).size).toBe(1);
      const rows = await inClinic(DEMO_CLINIC_ID, () => t.prisma.growthRecord.findMany({ where: { visitId: visit.id }, select: { speech: true } }));
      expect(rows).toHaveLength(1);
      expect(speeches).toContain(rows[0]!.speech);
    }
  });

  it("never records growth after its visit was completed, when the two race", async () => {
    const admin = await t.as(ADMIN);
    for (let round = 0; round < 3; round++) {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const saves = Array.from({ length: 6 }, (_, i) => save(visit.id, { habits: [], speech: `r${i}` }, admin));
      const [done, ...answers] = await Promise.all([t.call("post", `/visits/${visit.id}/complete`, admin), ...saves]);
      const completedAt = Visit.parse(done!.body).completedAt!;
      for (const res of answers) {
        expect([200, 409]).toContain(res.status);
        if (res.status === 409) expect(res.text).toBe("Growth is recorded during a visit in progress");
      }
      for (const r of await list(id, admin)) expect(r.recordedAt <= completedAt).toBe(true);
    }
  });
});
