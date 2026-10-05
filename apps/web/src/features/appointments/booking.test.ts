import { describe, expect, it } from "vitest";
import { pesos } from "@pedia/shared";
import { bookLabel, procedureHint, rankPatients, whenLabel } from "./booking";

describe("procedureHint", () => {
  it("gives the length and the fee, per tooth when it is charged per tooth", () => {
    const p = { clinicId: "c", code: "restoration", name: "Restoration", defaultDurationMin: 45, fee: pesos(2000), perTooth: true };
    expect(procedureHint(p)).toMatch(/^45 min · ₱2,000\.00 per tooth$/);
  });
});

describe("bookLabel", () => {
  it("says when, in words", () => {
    const now = new Date(2026, 9, 5, 14, 45);
    expect(bookLabel(now, now)).toBe("Book today, 2:45 PM");
    expect(whenLabel(new Date(2030, 0, 2, 9, 0), now)).toBe("Wed, Jan 2, 9:00 AM");
  });
});

describe("rankPatients", () => {
  it("puts a patient booked soon before everyone else, then sorts by surname", () => {
    const people = [
      { id: "a", firstName: "Ana", lastName: "Abad" },
      { id: "z", firstName: "Zoe", lastName: "Zamora" },
      { id: "c", firstName: "Cara", lastName: "Cruz" },
    ];
    expect(rankPatients(people, ["z"]).map((p) => p.lastName)).toEqual(["Zamora", "Abad", "Cruz"]);
  });
});
