import { seedPlatform } from "@pedia/seed";
import type { ClinicalNote } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { noteRow, toNote as fromRow } from "./note.rows";

/** The seed's input row read back as a stored one: Prisma types JSON input and output differently. */
const toNote = (row: object) => fromRow(row as Parameters<typeof fromRow>[0]);

const notes = Object.values(seedPlatform().tenants).flatMap((t) => t.notes);
const draft = (over: Partial<ClinicalNote> = {}): ClinicalNote => ({
  id: "n1", clinicId: "c", patientId: "p", visitId: "v", templateId: "tpl_oral_exam", values: {}, behavior: ["cooperative"],
  authorId: "staff_reyes", createdAt: "2026-06-01T01:30:00.000Z", ...over,
});

describe("note rows", () => {
  it("stores every seeded note so that toNote reads back exactly the same note", () => {
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(toNote({ ...noteRow(n), clinicId: n.clinicId })).toEqual(n);
  });

  it("leaves signedAt and behaviorNote absent when they are, and keeps an empty behaviour note", () => {
    const back = toNote({ ...noteRow(draft()), clinicId: "c" });
    expect(back).not.toHaveProperty("signedAt");
    expect(back).not.toHaveProperty("behaviorNote");
    expect(toNote({ ...noteRow(draft({ behaviorNote: "" })), clinicId: "c" }).behaviorNote).toBe("");
  });

  it("refuses a stored behaviour rating the contract doesn't know", () => {
    expect(() => toNote({ ...noteRow(draft()), behavior: ["sleepy"], clinicId: "c" })).toThrow();
  });
});
