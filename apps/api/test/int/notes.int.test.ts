import { DEMO_CLINIC_ID } from "@pedia/seed";
import { ClinicalNote, DueItem, Message, PlanItem, Visit } from "@pedia/shared";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inClinic } from "./support/database";
import { ADMIN, FRONT_DESK, NGITI_OWNER, clinicalApp } from "./clinical-support";

/** apps/web's notes and plan-by-signing handler tests, against the API (CHUNKS B6), with the race cases. */
let t: Awaited<ReturnType<typeof clinicalApp>>;
let admin = "";
beforeAll(async () => {
  t = await clinicalApp();
  admin = await t.as(ADMIN);
}, 60_000);
afterAll(() => t.app.close());

const notesOf = (id: string) => `/patients/${id}/notes`;
const post = (patientId: string, body: unknown, cookie = admin) => t.call("post", notesOf(patientId), cookie, body);
const draft = async (patientId: string, visitId: string, templateId: string, values: object, extra: object = {}) =>
  t.ok(post(patientId, { visitId, templateId, values, behavior: [], ...extra }), ClinicalNote, 201);
const edit = (id: string, body: unknown, cookie = admin) => t.call("put", `/notes/${id}`, cookie, body);
const sign = (id: string, cookie = admin) => t.call("post", `/notes/${id}/sign`, cookie);
const planOf = async (patientId: string) => t.ok(t.call("get", `/patients/${patientId}/plan`, admin), z.array(PlanItem));
const addItem = (patientId: string, procedureCode: string, tooth?: number) =>
  t.ok(t.call("post", `/patients/${patientId}/plan`, admin, { procedureCode, tooth, fee: 200000 }), PlanItem, 201);
const pulpotomy = { teeth: [84], medicament: "MTA", hemostasis: true };
const stored = (id: string) => inClinic(DEMO_CLINIC_ID, () => t.prisma.clinicalNote.findUniqueOrThrow({ where: { id }, select: { values: true, signedAt: true } }));

describe("notes (apps/web handlers.test.ts → notes, treatment plan)", () => {
  it("signs a pulpotomy note, after which it is read-only (done-when)", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy, { behavior: ["anxious", "needs_parent"] });
    expect([note.authorId, note.signedAt]).toEqual(["staff_reyes", undefined]);
    const changed = { values: { ...pulpotomy, medicament: "Biodentine" }, behavior: ["cooperative"] };
    expect((await t.ok(edit(note.id, changed), ClinicalNote)).values.medicament).toBe("Biodentine");
    const signed = await t.ok(sign(note.id), ClinicalNote);
    expect(signed.signedAt).toBeDefined();
    const after = await edit(note.id, { ...changed, values: { ...pulpotomy, medicament: "MTA" } });
    expect([after.status, after.text]).toEqual([409, "A signed note can't be changed"]);
    const again = await sign(note.id);
    expect([again.status, again.text]).toEqual([409, "This note is already signed"]);
    const [read] = await t.ok(t.call("get", notesOf(id), admin), z.array(ClinicalNote));
    expect(read!.values.medicament).toBe("Biodentine");
    expect((await stored(note.id)).values).toMatchObject({ medicament: "Biodentine" });
  });

  it("explains a rejected note in words", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const res = await post(id, { visitId: visit.id, templateId: "tpl_pulpotomy", values: { teeth: [] }, behavior: [] });
    expect(res.status).toBe(400);
    expect(z.array(z.object({ message: z.string() })).parse(res.body).map((i) => i.message).join(". ")).toBe("Pick at least one tooth. Choose medicament");
  });

  it("rejects values that don't fit the template, and drops what the template doesn't ask", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    expect((await post(id, { visitId: visit.id, templateId: "tpl_pulpotomy", values: { teeth: [], medicament: "MTA" }, behavior: [] })).status).toBe(400);
    const unknown = await post(id, { visitId: visit.id, templateId: "tpl_nope", values: {}, behavior: [] });
    expect([unknown.status, unknown.text]).toEqual([400, "Unknown note template"]);
    expect((await draft(id, visit.id, "tpl_pulpotomy", { ...pulpotomy, foo: 1 })).values).not.toHaveProperty("foo");
  });

  it("answers in the mock's order, with its words", async () => {
    expect((await post("no_such_patient", {})).status).toBe(400); // the body first
    const id = await t.register();
    const other = await t.register();
    const otherVisit = await t.start(other, admin);
    for (const visitId of ["no_such_visit", otherVisit.id]) {
      const res = await post(id, { visitId, templateId: "tpl_pulpotomy", values: pulpotomy, behavior: [] });
      expect([res.status, res.text]).toEqual([404, "Visit not found for this patient"]);
    }
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
    await t.complete(visit.id, admin);
    const closed = await post(id, { visitId: visit.id, templateId: "tpl_pulpotomy", values: pulpotomy, behavior: [] });
    expect([closed.status, closed.text]).toEqual([409, "Notes are started during a visit in progress"]);
    const missing = await edit("no_such_note", {});
    expect([missing.status, missing.text, missing.type]).toEqual([404, "Note not found", "text/plain"]);
    await t.ok(sign(note.id), ClinicalNote);
    expect((await edit(note.id, { nonsense: true })).status).toBe(409); // not the body's 400
    expect((await sign("no_such_note")).status).toBe(404);
  });

  it("keeps the behavior note unless it is sent", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy, { behaviorNote: "Calmer with mother present" });
    expect((await t.ok(edit(note.id, { values: pulpotomy, behavior: [] }), ClinicalNote)).behaviorNote).toBe("Calmer with mother present");
    expect((await t.ok(edit(note.id, { values: pulpotomy, behavior: [], behaviorNote: "" }), ClinicalNote)).behaviorNote).toBe("");
    const long = await edit(note.id, { values: pulpotomy, behavior: [], behaviorNote: "x".repeat(301) });
    expect([long.status, JSON.stringify(long.body)]).toEqual([400, expect.stringContaining("Keep the behavior note under 300 characters")]);
  });

  it("writes the visit's dentist as author, and lets a draft be finished after the visit (decision 5)", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin, "staff_santos");
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
    expect(note.authorId).toBe("staff_santos");
    await t.complete(visit.id, admin);
    await t.ok(edit(note.id, { values: { ...pulpotomy, medicament: "Biodentine" }, behavior: [] }), ClinicalNote);
    expect((await t.ok(sign(note.id), ClinicalNote)).signedAt).toBeDefined();
  });

  it("serves the seeded notes newest first, all signed", async () => {
    const db = t.platform.tenants[DEMO_CLINIC_ID]!;
    const id = db.planItems[0]!.patientId;
    const seeded = db.notes.filter((n) => n.patientId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const api = await t.ok(t.call("get", notesOf(id), admin), z.array(ClinicalNote));
    expect(api).toEqual(seeded.map((n) => ({ ...n, clinicId: DEMO_CLINIC_ID })));
    expect(api.length > 0 && api.every((n) => n.signedAt)).toBe(true);
  });

  it("completes the matching items when a note is signed, and only then", async () => {
    const id = await t.register();
    const [r74, r84, pulp] = [await addItem(id, "restoration", 74), await addItem(id, "restoration", 84), await addItem(id, "pulpotomy", 75)];
    await t.ok(t.call("patch", `/plan-items/${r84.id}`, admin, { status: "in_progress" }), PlanItem);
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_restoration", { teeth: [74, 84], material: "Composite" });
    expect((await planOf(id)).every((i) => i.status !== "done")).toBe(true); // a draft completes nothing
    await t.ok(sign(note.id), ClinicalNote);
    const items = await planOf(id);
    const byId = (itemId: string) => items.find((i) => i.id === itemId)!;
    expect(byId(r74.id)).toMatchObject({ status: "done", completedVisitId: visit.id, completedNoteId: note.id });
    expect(byId(r84.id).status).toBe("done");
    expect(byId(pulp.id).status).toBe("planned");
    expect((await t.call("patch", `/plan-items/${r74.id}`, admin, { status: "planned" })).status).toBe(409);
  });

  it("completes a follow-up item with a signed follow-up note", async () => {
    const id = await t.register();
    const item = await addItem(id, "follow_up");
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_follow_up", { healing: "Satisfactory" });
    await t.ok(sign(note.id), ClinicalNote);
    expect((await planOf(id))[0]).toMatchObject({ id: item.id, status: "done", completedNoteId: note.id });
  });

  it("lets front desk read notes but not write them", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
    const desk = await t.as(FRONT_DESK);
    expect((await t.call("get", notesOf(id), desk)).status).toBe(200);
    for (const res of [await post(id, { visitId: visit.id, templateId: "tpl_pulpotomy", values: pulpotomy, behavior: [] }, desk), await edit(note.id, {}, desk), await sign(note.id, desk)]) {
      expect([res.status, res.text]).toEqual([403, "You don't have access to this"]);
    }
  });

  it("never reaches another clinic's note", async () => {
    const id = await t.register();
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
    const ngiti = await t.as(NGITI_OWNER);
    for (const res of [await edit(note.id, { values: pulpotomy, behavior: [] }, ngiti), await sign(note.id, ngiti)]) {
      expect([res.status, res.text]).toEqual([404, "Note not found"]);
    }
    expect(await t.ok(t.call("get", notesOf(id), ngiti), z.array(ClinicalNote))).toEqual([]);
    expect((await post(id, { visitId: visit.id, templateId: "tpl_pulpotomy", values: pulpotomy, behavior: [] }, ngiti)).status).toBe(404);
    expect((await stored(note.id)).signedAt).toBeNull();
  });

  it("audits each step once, and a refused change leaves nothing", async () => {
    const id = await t.register();
    await addItem(id, "pulpotomy", 84);
    const visit = await t.start(id, admin);
    const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
    await t.ok(edit(note.id, { values: pulpotomy, behavior: ["cooperative"] }), ClinicalNote);
    await t.ok(sign(note.id), ClinicalNote);
    expect((await edit(note.id, { values: pulpotomy, behavior: [] })).status).toBe(409);
    expect((await sign(note.id)).status).toBe(409);
    await t.ok(t.call("get", notesOf(id), admin), z.array(ClinicalNote));
    const records = await inClinic(DEMO_CLINIC_ID, () =>
      t.prisma.auditEvent.findMany({ where: { patientId: id, record: { startsWith: "Clinical note" } }, orderBy: { at: "asc" }, select: { action: true, record: true } }));
    expect(records).toEqual([
      { action: "create", record: "Clinical note" },
      { action: "update", record: "Clinical note" },
      { action: "update", record: "Clinical note (signed)" },
      { action: "view", record: "Clinical notes" },
    ]);
    // Only the add: signing completed the item without a "Treatment plan" entry of its own (decision 7).
    expect((await t.auditOf(id, "Treatment plan")).map((e) => e.action)).toEqual(["update"]);
  });

  describe("under parallel requests (decisions 3 and 6)", () => {
    const rounds = [0, 1, 2];

    it.each(rounds)("signs a note exactly once (round %i)", async () => {
      const id = await t.register();
      const item = await addItem(id, "restoration", 74);
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_restoration", { teeth: [74], material: "Composite" });
      const results = await Promise.all(Array.from({ length: 10 }, () => sign(note.id)));
      expect(results.map((r) => r.status).sort()).toEqual([200, ...Array(9).fill(409)]);
      expect(results.filter((r) => r.status === 409).every((r) => r.text === "This note is already signed")).toBe(true);
      const winner = ClinicalNote.parse(results.find((r) => r.status === 200)!.body);
      expect((await stored(note.id)).signedAt?.toISOString()).toBe(winner.signedAt);
      expect((await planOf(id)).find((i) => i.id === item.id)).toMatchObject({ status: "done", completedNoteId: note.id });
    });

    it.each(rounds)("never changes a note after it is signed, when an edit races the signing (round %i)", async () => {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
      const meds = ["MTA", "Biodentine", "Formocresol", "MTA", "Biodentine"];
      const [signed, ...edits] = await Promise.all([sign(note.id), ...meds.map((m) => edit(note.id, { values: { ...pulpotomy, medicament: m }, behavior: [] }))]);
      expect(signed!.status).toBe(200);
      for (const res of edits) {
        expect([200, 409]).toContain(res.status);
        if (res.status === 409) expect(res.text).toBe("A signed note can't be changed");
      }
      expect((await stored(note.id)).values).toEqual(ClinicalNote.parse(signed!.body).values);
    });

    it.each(rounds)("completes a plan item once when two notes for it are signed together (round %i)", async () => {
      const id = await t.register();
      const item = await addItem(id, "restoration", 74);
      const visit = await t.start(id, admin);
      const a = await draft(id, visit.id, "tpl_restoration", { teeth: [74], material: "Composite" });
      const b = await draft(id, visit.id, "tpl_restoration", { teeth: [74], material: "Composite" });
      const results = await Promise.all([sign(a.id), sign(b.id)]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      const done = (await planOf(id)).filter((i) => i.status === "done");
      expect(done.map((i) => i.id)).toEqual([item.id]);
      // The note that signed first completed it; the later one found it done and left it alone.
      const [first] = results.map((r) => ClinicalNote.parse(r.body)).sort((x, y) => x.signedAt!.localeCompare(y.signedAt!));
      expect(done[0]!.completedNoteId).toBe(first!.id);
    });

    it.each(rounds)("never re-plans an item that a signing completed, when the two race (round %i)", async () => {
      const id = await t.register();
      const item = await addItem(id, "restoration", 84);
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_restoration", { teeth: [84], material: "Composite" });
      const [signed, ...patches] = await Promise.all([sign(note.id), ...Array.from({ length: 5 }, () => t.call("patch", `/plan-items/${item.id}`, admin, { status: "in_progress" }))]);
      expect(signed!.status).toBe(200);
      for (const res of patches) {
        expect([200, 409]).toContain(res.status);
        if (res.status === 409) expect(res.text).toBe("A completed item can't change");
      }
      expect((await planOf(id)).find((i) => i.id === item.id)).toMatchObject({ status: "done", completedNoteId: note.id });
    });

    it.each(rounds)("never starts a note after its visit was completed, when the two race (round %i)", async () => {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const body = { visitId: visit.id, templateId: "tpl_pulpotomy", values: pulpotomy, behavior: [] };
      const [done, ...posts] = await Promise.all([t.call("post", `/visits/${visit.id}/complete`, admin), ...Array.from({ length: 6 }, () => post(id, body))]);
      const completedAt = Visit.parse(done!.body).completedAt!;
      for (const res of posts) {
        expect([201, 409]).toContain(res.status);
        if (res.status === 409) expect(res.text).toBe("Notes are started during a visit in progress");
      }
      for (const n of await t.ok(t.call("get", notesOf(id), admin), z.array(ClinicalNote))) expect(n.createdAt <= completedAt).toBe(true);
    });
  });

  describe("parent messages (B9)", () => {
    const texts = (patientId: string) => inClinic(DEMO_CLINIC_ID, () => t.prisma.message.findMany({ where: { patientId } }));

    it("queues the procedure's care instructions when the note is signed, once", async () => {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_pulpotomy", pulpotomy);
      expect(await texts(id)).toEqual([]);
      await t.ok(sign(note.id), ClinicalNote);
      expect((await sign(note.id)).status).toBe(409);
      expect((await texts(id)).map((m) => [m.kind, m.noteId, m.status])).toEqual([["post_pulpotomy", note.id, "queued"]]);
    });

    it("queues post-extraction instructions when the note is signed, and a recall message from the due list once", async () => {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_extraction", { teeth: [75], reason: "Caries, non-restorable" });
      expect(await texts(id)).toEqual([]); // a draft sends nothing
      await t.ok(sign(note.id), ClinicalNote);
      const [instructions, ...rest] = await texts(id);
      expect(rest).toEqual([]);
      expect(instructions).toMatchObject({ kind: "post_extraction", noteId: note.id, status: "queued" });
      expect(instructions!.body).toContain("Bea");

      const desk = await t.as(FRONT_DESK);
      const [due] = (await t.ok(t.call("get", "/due-items", desk), z.array(DueItem))).filter((i) => i.patientId === id);
      const reminder = await t.ok(t.call("post", `/due-items/${due!.id}/message`, desk), Message, 201);
      expect(reminder).toMatchObject({ kind: "follow_up_reminder", dueItemId: due!.id });
      expect((await t.call("post", `/due-items/${due!.id}/message`, desk)).status).toBe(409);
    });

    it("queues nothing for a procedure with no instructions", async () => {
      const id = await t.register();
      const visit = await t.start(id, admin);
      const note = await draft(id, visit.id, "tpl_prophylaxis", { method: "Rubber cup and paste" });
      await t.ok(sign(note.id), ClinicalNote);
      expect(await texts(id)).toEqual([]);
    });
  });
});
