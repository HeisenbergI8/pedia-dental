import { describe, expect, it } from "vitest";
import { groupFields, noteServices, noteValuesSchema } from "./notes";
import { UpdateNoteInput, type NoteTemplate } from "../schemas/notes";

const pulpotomy: NoteTemplate = {
  id: "tpl_pulpotomy",
  name: "Pulpotomy",
  procedure: "pulpotomy",
  fields: [
    { type: "teeth", key: "teeth", label: "Teeth", required: true },
    { type: "select", key: "medicament", label: "Medicament", options: ["MTA", "Formocresol"], required: true },
    { type: "checkbox", key: "hemostasis", label: "Hemostasis achieved" },
    { type: "text", key: "notes", label: "Notes", multiline: true },
  ],
};

describe("noteValuesSchema", () => {
  const schema = noteValuesSchema(pulpotomy);
  it("accepts values that fit the template and drops unknown keys", () => {
    const parsed = schema.parse({ teeth: [84], medicament: "MTA", hemostasis: true, stray: 1 });
    expect(parsed).toEqual({ teeth: [84], medicament: "MTA", hemostasis: true });
  });
  it("requires required fields", () => {
    expect(schema.safeParse({ teeth: [], medicament: "MTA" }).success).toBe(false);
    expect(schema.safeParse({ teeth: [84] }).success).toBe(false);
  });
  it("rejects options and teeth that don't exist", () => {
    expect(schema.safeParse({ teeth: [84], medicament: "Glue" }).success).toBe(false);
    expect(schema.safeParse({ teeth: [19], medicament: "MTA" }).success).toBe(false);
  });
});

describe("note sections and services", () => {
  it("groups consecutive fields that share a section", () => {
    const f = (key: string, section?: string) => ({ type: "checkbox" as const, key, label: key, section });
    expect(groupFields([f("a"), f("b", "TMJ"), f("c", "TMJ"), f("d")]).map((g) => [g.section, g.fields.length])).toEqual([
      [undefined, 1],
      ["TMJ", 2],
      [undefined, 1],
    ]);
  });

  it("prices a completed item at its invoice line when billed, else at the plan fee", () => {
    const item = (id: string, fee: number) => ({
      id,
      clinicId: "c",
      patientId: "p",
      procedureCode: "restoration",
      tooth: 51,
      fee,
      status: "done" as const,
      completedNoteId: "n1",
      createdAt: "2026-10-01T00:00:00.000Z",
    });
    const invoices = [{ lines: [{ planItemId: "i1", procedureCode: "restoration", description: "Restoration", amount: 120000 }] }];
    const services = noteServices({ id: "n1" }, [item("i1", 150000), item("i2", 150000)], invoices, [{ code: "restoration", name: "Restoration" }]);
    expect(services.map((s) => [s.amount, s.billed])).toEqual([
      [120000, true],
      [150000, false],
    ]);
    expect(noteServices({ id: "other" }, [item("i1", 1)], invoices, [])).toEqual([]);
    // A voided bill no longer prices it (B8 decision 2); billed again on a live bill, it is.
    const voided = [{ ...invoices[0]!, voided: { at: "2026-10-02T00:00:00.000Z", by: "u", reason: "Wrong tooth" } }];
    expect(noteServices({ id: "n1" }, [item("i1", 150000)], voided, []).map((s) => [s.amount, s.billed])).toEqual([[150000, false]]);
    expect(noteServices({ id: "n1" }, [item("i1", 150000)], [...voided, ...invoices], []).map((s) => [s.amount, s.billed])).toEqual([[120000, true]]);
  });
});

describe("behavior note", () => {
  it("is limited to 300 characters on input", () => {
    expect(UpdateNoteInput.safeParse({ values: {}, behavior: [], behaviorNote: "x".repeat(301) }).success).toBe(false);
    expect(UpdateNoteInput.safeParse({ values: {}, behavior: [], behaviorNote: "x".repeat(300) }).success).toBe(true);
  });
});
