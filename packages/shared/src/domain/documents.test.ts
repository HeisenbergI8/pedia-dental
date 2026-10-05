import { describe, expect, it } from "vitest";
import { GenerateDocumentInput } from "../schemas/document";
import { FORMULARY, allergyConflicts } from "./documents";

const rx = (drugId: string, sig = "Give 5 mL by mouth every 8 hours for 7 days.") => ({
  type: "prescription",
  issuedBy: "staff_reyes",
  items: [{ drugId, sig, quantity: "1 bottle" }],
});
const messages = (input: unknown) => {
  const r = GenerateDocumentInput.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("documents", () => {
  it("never prescribes a controlled (S2) drug", () => {
    for (const drug of FORMULARY.filter((d) => d.controlled)) {
      expect(messages(rx(drug.id)).join()).toContain("controlled (S2)");
    }
    expect(messages(rx("not_a_drug"))).toEqual(["That medicine isn't in the clinic's formulary"]);
  });

  it("prescribes a formulary drug once the dentist writes the dose", () => {
    expect(messages(rx("amoxicillin_250_susp", FORMULARY[0]!.defaultSig))).toEqual(["Write the dose where it says ___"]);
    expect(messages(rx("amoxicillin_250_susp"))).toEqual([]);
    expect(messages({ type: "prescription", issuedBy: "staff_reyes", items: [] })).toEqual(["Add at least one medicine"]);
  });

  it("asks only for what isn't in the record", () => {
    expect(messages({ type: "referral_letter", issuedBy: "staff_reyes" })).toHaveLength(2);
    expect(messages({ type: "referral_letter", issuedBy: "staff_reyes", details: { referredTo: "Dr. Lim, orthodontist", reason: "Crossbite" } })).toEqual([]);
    expect(messages({ type: "dental_certificate", issuedBy: "staff_reyes" })).toEqual(["Pick the visit the certificate is for"]);
    expect(messages({ type: "patient_summary", issuedBy: "staff_cruz" })).toEqual([]);
    expect(messages({ type: "dental_clearance", issuedBy: "staff_reyes" })).toEqual([
      "Pick the exam visit the clearance is based on",
      "Say what the child is cleared for, e.g. school enrolment or surgery",
    ]);
    expect(messages({ type: "dental_clearance", issuedBy: "staff_reyes", sourceId: "v1", details: { purpose: "School enrolment" } })).toEqual([]);
  });

  it("flags a recorded allergy against the prescribed drug", () => {
    expect(allergyConflicts(["Penicillin"], [{ drugId: "amoxicillin_250_susp" }]).map((d) => d.name)).toEqual(["Amoxicillin"]);
    expect(allergyConflicts(["NSAIDs"], [{ drugId: "ibuprofen_100_susp" }, { drugId: "paracetamol_120_syr" }]).map((d) => d.name)).toEqual(["Ibuprofen"]);
    expect(allergyConflicts([], [{ drugId: "amoxicillin_250_susp" }])).toEqual([]);
  });
});
