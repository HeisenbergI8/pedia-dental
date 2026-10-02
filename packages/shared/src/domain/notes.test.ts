import { describe, expect, it } from "vitest";
import { noteValuesSchema } from "./notes";
import type { NoteTemplate } from "../schemas/notes";

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
