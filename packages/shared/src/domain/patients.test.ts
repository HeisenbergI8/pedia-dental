import { describe, expect, it } from "vitest";
import { filledProfile, findDuplicates, isReservedTag, nextPatientNo, normalizeName, sameText } from "./patients";

describe("patient helpers", () => {
  it("numbers patients one past the highest, never refilling a gap", () => {
    expect(nextPatientNo([])).toBe("KS-00001");
    expect(nextPatientNo([{ patientNo: "KS-00002" }, { patientNo: "KS-00007" }])).toBe("KS-00008");
  });

  it("title-cases all-lower and ALL-CAPS names, keeping particles lower inside a name", () => {
    expect(normalizeName("  juan   dela cruz ")).toBe("Juan dela Cruz");
    expect(normalizeName("dela cruz")).toBe("Dela Cruz");
    expect(normalizeName("MARIA DE LOS ANGELES")).toBe("Maria de los Angeles");
    expect(normalizeName("ana-marie o'neil")).toBe("Ana-Marie O'Neil");
  });

  it("keeps a mixed-case spelling as the family wrote it", () => {
    expect(normalizeName("McArthur")).toBe("McArthur");
    expect(normalizeName("dela Cruz")).toBe("dela Cruz");
  });

  it("finds a duplicate by name and birth date, ignoring case, accents and spacing", () => {
    const rows = [{ id: "1", firstName: "Peña", lastName: "Dela Cruz", birthDate: "2020-01-02" }];
    expect(findDuplicates({ firstName: "pena", lastName: "dela  cruz", birthDate: "2020-01-02" }, rows)).toHaveLength(1);
    expect(findDuplicates({ firstName: "Pena", lastName: "Dela Cruz", birthDate: "2020-01-03" }, rows)).toHaveLength(0);
  });

  it("reserves the patient list's computed labels", () => {
    expect(isReservedTag("balance  DUE")).toBe(true);
    expect(isReservedTag("Anxious")).toBe(false);
  });

  it("shows only the profile details that were filled in", () => {
    expect(filledProfile(undefined)).toEqual([]);
    expect(filledProfile({ school: "  ", bloodType: "O+", diet: "Vegetarian" }).map((r) => r.label)).toEqual(["Blood type", "Diet"]);
  });

  it("compares tags ignoring case, accents and spacing", () => {
    expect(sameText("Penicillin ")).toBe(sameText("penicillin"));
    expect(sameText("Peña")).toBe(sameText("pena"));
  });
});
