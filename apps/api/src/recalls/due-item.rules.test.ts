import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import type { DueItem } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { bookedItem, dueBackfill, signChange, type SignedNote } from "./due-item.rules";

const item = (over: Partial<DueItem>): DueItem => ({
  id: "d", clinicId: "c", patientId: "p", ruleId: "routine", kind: "recall", procedure: "oral_exam", dueOn: "2027-01-01",
  sourceNoteId: "n", createdAt: "2026-07-01T00:00:00.000Z", ...over,
});

describe("signChange (notes/mocks.ts sign)", () => {
  it("opens the procedure's follow-up from the visit's day", () => {
    expect(signChange("extraction", "2026-10-16", {}, []).open).toEqual({ ruleId: "extraction", kind: "follow_up", procedure: "extraction", dueOn: "2026-10-23" });
    expect(signChange("pulpotomy", "2026-10-16", {}, []).open?.dueOn).toBe("2026-10-30");
  });

  it("picks the exam's recall by caries risk and closes the procedure's open items", () => {
    const routine = item({ id: "r1" });
    expect(signChange("oral_exam", "2026-10-16", { caries_risk: "Low" }, [routine])).toEqual({
      close: ["r1"], open: { ruleId: "routine", kind: "recall", procedure: "oral_exam", dueOn: "2027-04-16" },
    });
    expect(signChange("oral_exam", "2026-10-16", { caries_risk: "High" }, [routine]).open).toMatchObject({ ruleId: "routine_high_risk", dueOn: "2027-01-16" });
  });

  it("changes nothing without a rule, and never touches closed or other procedures' items", () => {
    const other = item({ id: "s1", procedure: "sealant", ruleId: "sealant" });
    const closed = item({ id: "r0", closedAt: "2026-08-01T00:00:00.000Z" });
    expect(signChange("restoration", "2026-10-16", {}, [item({ id: "r1" })])).toEqual({ close: [] });
    expect(signChange("oral_exam", "2026-10-16", { caries_risk: "Low" }, [other, closed]).close).toEqual([]);
  });
});

describe("bookedItem (appointments/mocks.ts book)", () => {
  const a = item({ id: "a", ruleId: "extraction", procedure: "extraction", kind: "follow_up", dueOn: "2026-10-20" });
  const b = item({ id: "b", ruleId: "extraction", procedure: "extraction", kind: "follow_up", dueOn: "2026-10-25" });
  const appt = (id: string, status: "booked" | "cancelled" | "no_show" | "done", over = {}) => ({ id, status, patientId: "p", startsAt: "2026-10-20T01:00:00.000Z", ...over });

  it("takes the earliest open item for the rule, skipping one already booked", () => {
    expect(bookedItem("p", "extraction", [b, a], [])?.id).toBe("a");
    expect(bookedItem("p", "extraction", [b, { ...a, appointmentId: "x" }], [appt("x", "booked")])?.id).toBe("b");
  });

  it("frees an item again when its appointment was cancelled or missed", () => {
    for (const s of ["cancelled", "no_show"] as const) expect(bookedItem("p", "extraction", [{ ...a, appointmentId: "x" }], [appt("x", s)])?.id).toBe("a");
  });

  it("never takes another rule's or another child's item, nor a recall a later exam closed", () => {
    expect(bookedItem("p", "pulpotomy", [a], [])).toBeUndefined();
    expect(bookedItem("q", "extraction", [a], [])).toBeUndefined();
    const recall = item({ id: "r", dueOn: "2027-01-01", createdAt: "2026-07-01T00:00:00.000Z" });
    const examDone = appt("e", "done", { procedureCode: "oral_exam", startsAt: "2026-08-01T01:00:00.000Z" });
    expect(bookedItem("p", "routine", [recall], [examDone])).toBeUndefined();
  });
});

describe("dueBackfill (E8)", () => {
  const db = seedPlatform().tenants[DEMO_CLINIC_ID]!;
  const templates = new Map(db.noteTemplates.map((t) => [t.id, t.procedure]));
  const visits = new Map(db.visits.map((v) => [v.id, v.date]));
  const notes: SignedNote[] = db.notes.filter((n) => n.signedAt).map((n) => ({
    id: n.id, patientId: n.patientId, visitId: n.visitId, procedure: templates.get(n.templateId)!, visitDate: visits.get(n.visitId)!, values: n.values, signedAt: n.signedAt!,
  }));

  it("rebuilds exactly the seed's due items from its signed notes, and then nothing", () => {
    const made = dueBackfill(notes, [], () => false).map((g) => g.create);
    const seeded = db.dueItems.map(({ clinicId: _c, closedAt: _x, appointmentId: _y, ...i }) => i);
    const strip = ({ visitId: _v, ...i }: (typeof made)[number]) => i;
    expect(made.map(strip).sort((x, y) => x.id.localeCompare(y.id))).toEqual([...seeded].sort((x, y) => x.id.localeCompare(y.id)));
    const ids = new Set(made.map((i) => i.sourceNoteId));
    expect(dueBackfill(notes, [], (id) => ids.has(id))).toEqual([]);
  });

  it("lets a later note for the procedure win and close the earlier group's open item", () => {
    const early: SignedNote = { id: "n1", patientId: "p", visitId: "v1", procedure: "extraction", visitDate: "2026-10-01", values: {}, signedAt: "2026-10-01T03:00:00.000Z" };
    const late = { ...early, id: "n2", visitId: "v2", visitDate: "2026-10-10", signedAt: "2026-10-10T03:00:00.000Z" };
    const open = item({ id: "due_n1", procedure: "extraction", ruleId: "extraction" });
    const [g] = dueBackfill([late, early], [open], (id) => id === "n1");
    expect([g!.note.id, g!.close, g!.create.id, g!.create.dueOn]).toEqual(["n2", ["due_n1"], "due_n2", "2026-10-17"]);
    expect(dueBackfill([{ ...early, procedure: "restoration" }], [], () => false)).toEqual([]);
  });
});
