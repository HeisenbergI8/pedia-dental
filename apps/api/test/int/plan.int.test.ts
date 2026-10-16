import { DEMO_CLINIC_ID, childrenOf } from "@pedia/seed";
import { PlanItem, planProgress } from "@pedia/shared";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp } from "./clinical-support";

/** apps/web's treatment-plan handler tests, against the API (CHUNKS B6). Sign-driven cases are in notes.int.test.ts. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
beforeAll(async () => {
  t = await clinicalApp();
}, 60_000);
afterAll(() => t.app.close());

const plan = (id: string) => `/patients/${id}/plan`;
const list = async (id: string, cookie: string) => t.ok(t.call("get", plan(id), cookie), z.array(PlanItem));
const add = (id: string, body: unknown, cookie: string) => t.call("post", plan(id), cookie, body);
const patch = (itemId: string, body: unknown, cookie: string) => t.call("patch", `/plan-items/${itemId}`, cookie, body);
const demo = () => t.platform.tenants[DEMO_CLINIC_ID]!;

describe("treatment plan (apps/web handlers.test.ts → treatment plan)", () => {
  it("seeds the spec's example plan at 3 of 6 done (done-when)", async () => {
    const example = await list(demo().planItems[0]!.patientId, await t.as(ADMIN));
    expect(example.map((i) => [i.procedureCode, i.tooth])).toEqual([
      ["prophylaxis", undefined], ["fluoride", undefined], ["restoration", 51], ["restoration", 74], ["restoration", 84], ["follow_up", undefined],
    ]);
    expect(planProgress(example)).toEqual({ done: 3, total: 6 });
    expect(example.filter((i) => i.status === "done").every((i) => i.completedNoteId)).toBe(true);
    // Items planned from a finding name a seeded chart entry on the same tooth.
    const sourced = example.filter((i) => i.sourceChartEntryId);
    expect(sourced.length).toBeGreaterThan(0);
    for (const i of sourced) expect(demo().chartEntries.find((e) => e.id === i.sourceChartEntryId)?.tooth).toBe(i.tooth);
  });

  it("adds items and changes their status, but never to done", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    const items = [];
    for (const body of [{ procedureCode: "restoration", tooth: 74, fee: 150000 }, { procedureCode: "restoration", tooth: 84, fee: 150000 }, { procedureCode: "pulpotomy", tooth: 75, fee: 250000 }]) {
      const item = await t.ok(add(id, body, admin), PlanItem, 201);
      expect(item.status).toBe("planned");
      items.push(item);
    }
    const perTooth = await add(id, { procedureCode: "restoration", fee: 150000 }, admin);
    expect([perTooth.status, perTooth.text]).toEqual([400, "Restoration is planned per tooth"]);
    const done = await patch(items[0]!.id, { status: "done" }, admin);
    expect([done.status, Array.isArray(done.body)]).toEqual([400, true]);
    expect((await t.ok(patch(items[0]!.id, { status: "in_progress" }, admin), PlanItem)).status).toBe("in_progress");
    await t.ok(patch(items[1]!.id, { status: "declined" }, admin), PlanItem);
    expect(planProgress(await list(id, admin))).toEqual({ done: 0, total: 2 });
    expect((await t.ok(patch(items[1]!.id, { status: "planned" }, admin), PlanItem)).status).toBe("planned");
  });

  it("never changes a completed item", async () => {
    const admin = await t.as(ADMIN);
    const doneItem = demo().planItems.find((i) => i.status === "done")!;
    for (const status of ["planned", "done"]) {
      const res = await patch(doneItem.id, { status }, admin);
      expect([res.status, res.text], status).toEqual([409, "A completed item can't change"]); // 409 before the body's 400
    }
  });

  it("answers in the mock's order, with its words", async () => {
    const admin = await t.as(ADMIN);
    const unknown = await add("no_such_patient", {}, admin);
    expect([unknown.status, unknown.text, unknown.type]).toEqual([404, "Patient not found", "text/plain"]);
    const id = await t.register();
    const bad = await add(id, {}, admin);
    expect([bad.status, Array.isArray(bad.body)]).toEqual([400, true]);
    const proc = await add(id, { procedureCode: "teleportation", fee: 100 }, admin);
    expect([proc.status, proc.text]).toEqual([400, "Unknown procedure"]);
    const missing = await patch("no_such_item", {}, admin);
    expect([missing.status, missing.text, missing.type]).toEqual([404, "Plan item not found", "text/plain"]);
  });

  it("keeps the chart entry an item was planned from, as given (decision 4)", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    expect((await t.ok(add(id, { procedureCode: "restoration", tooth: 74, fee: 1, sourceChartEntryId: "entry_x" }, admin), PlanItem, 201)).sourceChartEntryId).toBe("entry_x");
    expect(await t.ok(add(id, { procedureCode: "restoration", tooth: 84, fee: 1 }, admin), PlanItem, 201)).not.toHaveProperty("sourceChartEntryId");
  });

  it("lets front desk and a parent read a plan, and only staff with plan.write change it", async () => {
    const own = demo().planItems[0]!.patientId;
    const desk = await t.as(FRONT_DESK);
    expect((await t.call("get", plan(own), desk)).status).toBe(200);
    for (const res of [await add(own, { procedureCode: "fluoride", fee: 1 }, desk), await patch(demo().planItems[0]!.id, { status: "planned" }, desk)]) {
      expect([res.status, res.text]).toEqual([403, "You don't have access to this"]);
    }
    const guardian = demo().patients.find((p) => p.id === own)!.guardians[0]!;
    const mine = new Set(childrenOf(demo(), guardian.id).map((p) => p.id));
    const parent = await t.as([DEMO_CLINIC_ID, `guardian.${guardian.id}`]);
    expect((await t.call("get", plan(own), parent)).status).toBe(200);
    const other = demo().patients.find((p) => !mine.has(p.id))!;
    const refused = await t.call("get", plan(other.id), parent);
    expect([refused.status, refused.text]).toEqual([403, "This isn't one of your children's records"]);
    expect((await add(own, { procedureCode: "fluoride", fee: 1 }, parent)).status).toBe(403);
  });

  it("never reaches another clinic's plan", async () => {
    const ngiti = await t.as(NGITI_OWNER);
    const item = demo().planItems.find((i) => i.status !== "done")!;
    const res = await patch(item.id, { status: "declined" }, ngiti);
    expect([res.status, res.text]).toEqual([404, "Plan item not found"]);
    expect(await list(item.patientId, ngiti)).toEqual([]);
  });

  it("audits reads and changes, and a refused change leaves nothing", async () => {
    const admin = await t.as(ADMIN);
    const id = await t.register();
    const item = await t.ok(add(id, { procedureCode: "restoration", tooth: 74, fee: 1 }, admin), PlanItem, 201);
    await t.ok(patch(item.id, { status: "in_progress" }, admin), PlanItem);
    await list(id, admin);
    await list(id, admin);
    expect((await patch(item.id, { status: "done" }, admin)).status).toBe(400);
    expect((await add(id, { procedureCode: "teleportation", fee: 1 }, admin)).status).toBe(400);
    const done = demo().planItems.find((i) => i.status === "done")!;
    expect((await patch(done.id, { status: "planned" }, admin)).status).toBe(409);
    expect((await patch("no_such_item", { status: "planned" }, admin)).status).toBe(404);
    expect((await t.auditOf(id, "Treatment plan")).map((e) => e.action)).toEqual(["update", "update", "view"]);
    expect((await t.auditOf(done.patientId, "Treatment plan")).filter((e) => e.action === "update")).toEqual([]);
  });
});
