import { describe, expect, it } from "vitest";
import { phoneAfterPrefix, relationshipChoice, requiredProgress, splitName, storedPhone, withMedicalAnswers } from "./intake";

describe("relationshipChoice", () => {
  it("matches a chip whatever the case, and calls anything else Other", () => {
    expect(relationshipChoice("mother")).toBe("Mother");
    expect(relationshipChoice("legal guardian")).toBe("Other");
    expect(relationshipChoice(" ")).toBe("");
  });
});

describe("phone after +63", () => {
  it("stores the local format however it was typed", () => {
    expect(storedPhone("+63 917 123 4567")).toBe("09171234567");
    expect(storedPhone("0917 123 4567")).toBe("09171234567");
    expect(storedPhone("9171234567")).toBe("09171234567");
    expect(storedPhone("")).toBe("");
  });
  it("shows the stored number without its leading zero", () => expect(phoneAfterPrefix("09171234567")).toBe("9171234567"));
});

describe("splitName", () => {
  it("takes the last word as the surname", () => {
    expect(splitName(" Ana Maria  Cruz ")).toEqual({ firstName: "Ana Maria", lastName: "Cruz" });
    expect(splitName("Bea")).toEqual({ firstName: "Bea", lastName: "" });
  });
});

describe("withMedicalAnswers", () => {
  const lists: { allergies: string[]; medicalConditions: string[]; medications: string[]; noKnownAllergies?: boolean } = { allergies: [], medicalConditions: [], medications: [] };
  it("reads listed items on an older record as an answer", () => {
    expect(withMedicalAnswers({ ...lists, allergies: ["Latex"], medications: ["Inhaler"] })).toMatchObject({ noKnownAllergies: false, noKnownConditions: false });
  });
  it("leaves an empty, unanswered record unanswered, and never overrides an answer", () => {
    expect(withMedicalAnswers(lists).noKnownAllergies).toBeUndefined();
    expect(withMedicalAnswers({ ...lists, noKnownAllergies: true }).noKnownAllergies).toBe(true);
  });
});

describe("requiredProgress", () => {
  const child = { firstName: "Bea", lastName: "Cruz", birthDate: "2020-07-02", sex: "female" };
  it("needs the phone only when the editor can see contacts", () => {
    const guardians = [{ fullName: "Rosa Cruz", relationship: "Mother" }];
    expect(requiredProgress({ ...child, guardians }, true).guardian).toBe(false);
    expect(requiredProgress({ ...child, guardians }, false).guardian).toBe(true);
  });
  it("counts the medical section done once both questions are answered", () => {
    expect(requiredProgress({ ...child, noKnownAllergies: true }, true).medical).toBe(false);
    expect(requiredProgress({ ...child, noKnownAllergies: true, noKnownConditions: false }, true)).toMatchObject({ child: true, medical: true });
  });
});
