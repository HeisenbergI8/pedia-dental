import { DEMO_CLINIC_ID } from "@pedia/seed";
import { Appointment, ClinicalNote, DueItem, dueBucket } from "@pedia/shared";
import { addDays, addMonths, format } from "date-fns";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { NotesService } from "../../src/notes/notes.service";
import { runInTransaction } from "../../src/prisma/transaction";
import { DueItemsService } from "../../src/recalls/due-items.service";
import { inClinic } from "./support/database";
import { ADMIN, clinicalApp } from "./clinical-support";

/** apps/web's follow-up and recall handler tests (recalls), against the API (CHUNKS B7), with the backfill (E8). */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
beforeAll(async () => {
  t = await clinicalApp();
  admin = await t.as(ADMIN);
}, 60_000);
afterAll(() => t.app.close());

const today = () => format(new Date(), "yyyy-MM-dd"); // the visit's day: the process is pinned to Manila (E3)
const plus = (d: { days?: number; months?: number }) => format(addDays(addMonths(new Date(), d.months ?? 0), d.days ?? 0), "yyyy-MM-dd");
const extraction = { teeth: [75], reason: "Caries, non-restorable" };
const exam = (caries_risk: "Low" | "High") => ({ oral_hygiene: "Good", caries_risk });
const draft = async (patientId: string, visitId: string, templateId: string, values: object) =>
  t.ok(t.call("post", `/patients/${patientId}/notes`, admin, { visitId, templateId, values, behavior: [] }), ClinicalNote, 201);
const sign = (id: string) => t.call("post", `/notes/${id}/sign`, admin);
/** A signed note in a visit of its own (started and completed here). */
const signedNote = async (patientId: string, templateId: string, values: object) => {
  const visit = await t.start(patientId, admin);
  const note = await draft(patientId, visit.id, templateId, values);
  await t.ok(sign(note.id), ClinicalNote);
  await t.complete(visit.id, admin);
  return note;
};
const dueList = async () => t.ok(t.call("get", "/due-items", admin), z.array(DueItem));
const dueOf = async (patientId: string) => (await dueList()).filter((i) => i.patientId === patientId);
const rowsOf = (patientId: string) =>
  inClinic(DEMO_CLINIC_ID, () => t.prisma.dueItem.findMany({ where: { patientId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, ruleId: true, appointmentId: true, closedAt: true } }));

// One 30-minute slot each, Mondays to Saturdays of 2031, chair 3 (the seed keeps it free), Manila times.
let k = 0;
const nextSlot = () => {
  const i = k++;
  const day = addDays(new Date("2031-01-06T00:00:00+08:00"), Math.floor(i / 18) + Math.floor(Math.floor(i / 18) / 6)); // skip Sundays
  return new Date(day.getTime() + 8 * 3_600_000 + (i % 18) * 30 * 60_000).toISOString();
};
const book = (patientId: string, over: object = {}) =>
  t.call("post", "/appointments", admin, { patientId, dentistId: "staff_reyes", chairId: "chair_3", startsAt: nextSlot(), durationMin: 30, reason: "Follow-up", ...over });
const setStatus = (id: string, body: object) => t.ok(t.call("post", `/appointments/${id}/status`, admin, body), Appointment);

describe("the backfill (E8)", () => {
  const backfillAll = async () => {
    let made = 0;
    for (const clinicId of clinics()) {
      made += await inClinic(clinicId, () => runInTransaction(t.prisma, async (tx) => t.app.get(DueItemsService).backfill(tx, await t.app.get(NotesService).signedForBackfill(tx))));
    }
    return made;
  };
  const clinics = () => Object.keys(t.platform.tenants);
  const allRows = async () => (await Promise.all(clinics().map((c) => inClinic(c, () => t.prisma.dueItem.findMany({ orderBy: { id: "asc" } }))))).flat();

  it("rebuilds the seed's items from the signed notes, and a second run creates nothing", async () => {
    const before = await allRows();
    expect(before.length).toBeGreaterThan(0);
    for (const c of clinics()) await inClinic(c, () => t.prisma.dueItem.deleteMany({}));
    expect(await backfillAll()).toBe(before.length);
    expect(await allRows()).toEqual(before);
    expect(await backfillAll()).toBe(0);
  });

  it("opens the item of a note signed before B7 (afterSign stubbed), as due_<noteId>", async () => {
    const id = await t.register();
    const spy = vi.spyOn(t.app.get(DueItemsService), "afterSign").mockResolvedValue();
    const note = await signedNote(id, "tpl_extraction", extraction);
    spy.mockRestore();
    expect(await rowsOf(id)).toEqual([]);
    expect(await backfillAll()).toBe(1);
    expect(await rowsOf(id)).toEqual([{ id: `due_${note.id}`, ruleId: "extraction", appointmentId: null, closedAt: null }]);
  });
});

describe("due items (apps/web handlers.test.ts → recalls)", () => {
  it("makes an extraction due in 7 days on signing, takes it on booking, and gives it back on a cancel (done-when)", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_extraction", extraction);
    expect(await dueOf(id)).toEqual([]); // a draft makes nothing due
    await t.ok(sign(note.id), ClinicalNote);
    const [item, ...rest] = await dueOf(id);
    expect(rest).toEqual([]);
    expect(item).toMatchObject({ ruleId: "extraction", kind: "follow_up", procedure: "extraction", dueOn: plus({ days: 7 }), sourceNoteId: note.id, dentistId: "staff_reyes" });
    expect(dueBucket(item!.dueOn, today())).toBe("this_week");

    const booked = await t.ok(book(id, { sourceRuleId: "extraction" }), Appointment, 201);
    expect(await dueOf(id)).toEqual([]);
    await setStatus(booked.id, { status: "cancelled", cancelReason: "Family is away" });
    expect((await dueOf(id)).map((i) => i.id)).toEqual([item!.id]);
  });

  it("replaces the 6-month recall with the 3-month one after a high-risk exam", async () => {
    const id = await t.register();
    await signedNote(id, "tpl_oral_exam", exam("Low"));
    expect((await dueOf(id)).map((i) => [i.ruleId, i.dueOn])).toEqual([["routine", plus({ months: 6 })]]);
    await signedNote(id, "tpl_oral_exam", exam("High"));
    expect((await dueOf(id)).map((i) => [i.ruleId, i.kind, i.dueOn])).toEqual([["routine_high_risk", "recall", plus({ months: 3 })]]);
    expect((await rowsOf(id)).map((r) => [r.ruleId, !!r.closedAt])).toEqual([["routine", true], ["routine_high_risk", false]]);
  });

  it("serves the seeded items: recalls only, one per patient, as the seed made them", async () => {
    const seeded = t.platform.tenants[DEMO_CLINIC_ID]!.dueItems;
    const list = (await dueList()).filter((i) => seeded.some((s) => s.id === i.id));
    expect(list.length).toBeGreaterThan(0); // not vacuous
    expect(list.every((i) => i.kind === "recall" && ["routine", "routine_high_risk"].includes(i.ruleId))).toBe(true);
    expect(new Set(list.map((i) => i.patientId)).size).toBe(list.length);
    const open = seeded.filter((s) => list.some((i) => i.id === s.id));
    const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);
    expect(list.map(({ dentistId: _, ...i }) => i).sort(byId)).toEqual(open.map((s) => ({ ...s, clinicId: DEMO_CLINIC_ID })).sort(byId));
    expect(list.map((i) => i.dueOn)).toEqual(list.map((i) => i.dueOn).sort()); // soonest first
  });

  it("books without an open item, holds the item for the first booking, and frees it on a no-show", async () => {
    const id = await t.register();
    await t.ok(book(id, { sourceRuleId: "pulpotomy" }), Appointment, 201); // no item: still books, changes nothing
    expect(await rowsOf(id)).toEqual([]);
    await signedNote(id, "tpl_pulpotomy", { teeth: [84], medicament: "MTA" });
    const first = await t.ok(book(id, { sourceRuleId: "pulpotomy" }), Appointment, 201);
    const second = await t.ok(book(id, { sourceRuleId: "pulpotomy" }), Appointment, 201);
    expect((await rowsOf(id)).map((r) => r.appointmentId)).toEqual([first.id]);
    await setStatus(first.id, { status: "no_show" });
    const third = await t.ok(book(id, { sourceRuleId: "pulpotomy" }), Appointment, 201);
    expect((await rowsOf(id)).map((r) => r.appointmentId)).toEqual([third.id]);
    expect(second.id).not.toBe(third.id);
  });

  it("closes a routine recall once a later oral exam appointment is done", async () => {
    const id = await t.register();
    await signedNote(id, "tpl_oral_exam", exam("Low"));
    expect((await dueOf(id)).map((i) => i.ruleId)).toEqual(["routine"]);
    const a = await t.ok(book(id, { procedureCode: "oral_exam" }), Appointment, 201);
    await setStatus(a.id, { status: "arrived" });
    const visit = await t.ok(t.call("post", `/patients/${id}/visits`, admin, { dentistId: "staff_reyes", appointmentId: a.id }), z.object({ id: z.string() }), 201);
    expect((await dueOf(id)).map((i) => i.ruleId)).toEqual(["routine"]); // in chair: not yet
    await t.complete(visit.id, admin);
    expect(await dueOf(id)).toEqual([]);
    expect((await rowsOf(id)).map((r) => r.closedAt)).toEqual([null]); // closed by the appointment, not stored
  });

  it("makes a pulpotomy due in 14 days, and a restoration nothing (closing nothing)", async () => {
    const id = await t.register();
    await signedNote(id, "tpl_pulpotomy", { teeth: [84], medicament: "MTA" });
    expect((await dueOf(id)).map((i) => [i.ruleId, i.dueOn])).toEqual([["pulpotomy", plus({ days: 14 })]]);
    await signedNote(id, "tpl_restoration", { teeth: [51], material: "Composite" });
    expect((await rowsOf(id)).map((r) => [r.ruleId, r.closedAt])).toEqual([["pulpotomy", null]]);
  });

  it("keeps signing and booking from the due list consistent when they race, round after round", async () => {
    for (let round = 0; round < 10; round++) {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const [first, second] = [await draft(id, visit.id, "tpl_extraction", extraction), await draft(id, visit.id, "tpl_extraction", extraction)];
      await t.ok(sign(first.id), ClinicalNote);
      const [signed, booked] = await Promise.all([sign(second.id), book(id, { sourceRuleId: "extraction" })]);
      expect([signed.status, booked.status], `round ${round}`).toEqual([200, 201]);
      const rows = await rowsOf(id);
      expect(rows.map((r) => !!r.closedAt), `round ${round}`).toEqual([true, false]); // the first closed, the new one open
      // Serial either way: the booking took the first item before the sign, or the new one after it.
      const takers = rows.filter((r) => r.appointmentId === booked.body.id);
      expect(takers, `round ${round}`).toHaveLength(1);
    }
  });

  it("lets two parallel bookings from one item both stand, the item held by one of them", async () => {
    const id = await t.register();
    await signedNote(id, "tpl_extraction", extraction);
    const answers = await Promise.all([book(id, { sourceRuleId: "extraction" }), book(id, { sourceRuleId: "extraction" })]);
    expect(answers.map((r) => r.status)).toEqual([201, 201]);
    const [row] = await rowsOf(id);
    expect(answers.map((r) => r.body.id)).toContain(row!.appointmentId);
    expect(await dueOf(id)).toEqual([]);
  });

  it("audits no due list read, and nothing beyond the signed note on signing", async () => {
    const id = await t.register();
    const all = () => inClinic(DEMO_CLINIC_ID, () => t.prisma.auditEvent.count());
    const before = await all();
    await dueList();
    expect(await all()).toBe(before);
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_extraction", extraction);
    const mark = await all();
    await t.ok(sign(note.id), ClinicalNote);
    expect(await all()).toBe(mark + 1);
    expect((await t.auditOf(id, "Clinical note (signed)")).map((e) => e.action)).toEqual(["update"]);
  });
});
