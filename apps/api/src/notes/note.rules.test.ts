import { NOTE_TEMPLATES } from "@pedia/seed";
import { describe, expect, it } from "vitest";
import { checkValues, editRefusal, signRefusal, startRefusal, teethOf } from "./note.rules";

const pulpotomy = NOTE_TEMPLATES.find((t) => t.id === "tpl_pulpotomy")!;

describe("note rules (notes/mocks.ts)", () => {
  it("starts a note only on this patient's visit in progress", () => {
    expect(startRefusal(undefined)).toEqual({ status: 404, message: "Visit not found for this patient" });
    expect(startRefusal({ status: "completed" })).toEqual({ status: 409, message: "Notes are started during a visit in progress" });
    expect(startRefusal({ status: "in_progress" })).toBeUndefined();
  });

  it("refuses to edit or re-sign a signed note, each in its own words", () => {
    const signed = { signedAt: "2026-06-01T01:30:00.000Z" };
    expect(editRefusal(signed)).toEqual({ status: 409, message: "A signed note can't be changed" });
    expect(signRefusal(signed)).toEqual({ status: 409, message: "This note is already signed" });
    expect([editRefusal({}), signRefusal({})]).toEqual([undefined, undefined]);
  });

  it("checks values against the template, dropping unknown keys", () => {
    expect(checkValues(undefined, {})).toEqual({ refusal: { status: 400, message: "Unknown note template" } });
    expect(checkValues(pulpotomy, { teeth: [84], medicament: "MTA", hemostasis: true, extra: 1 })).toEqual({
      values: { teeth: [84], medicament: "MTA", hemostasis: true },
    });
    const bad = checkValues(pulpotomy, { teeth: [] });
    expect("issues" in bad && bad.issues.map((i) => i.message)).toEqual(["Pick at least one tooth", "Choose medicament"]);
  });

  it("reads the teeth a note completes items for", () => {
    expect([teethOf({ teeth: [74, 84] }), teethOf({ teeth: "74" }), teethOf({})]).toEqual([[74, 84], [], []]);
  });
});
