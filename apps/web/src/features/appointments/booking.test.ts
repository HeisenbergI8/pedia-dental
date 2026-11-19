import { describe, expect, it } from "vitest";
import { pesos } from "@pedia/shared";
import { PAST_START, TOO_FAR_AHEAD, bookLabel, canMarkNoShow, dateBounds, procedureHint, rankPatients, whenLabel, whenProblem } from "./booking";

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

describe("booking times (#6, #7)", () => {
  const now = new Date(2026, 10, 19, 10, 0);

  it("books from now to five years ahead", () => {
    expect(whenProblem(new Date(2026, 10, 19, 9, 45), now)).toBe(PAST_START);
    expect(whenProblem(new Date(2026, 10, 19, 10, 0), now)).toBeUndefined();
    expect(whenProblem(new Date(2031, 10, 19, 10, 0), now)).toBeUndefined();
    expect(whenProblem(new Date(2031, 10, 19, 10, 15), now)).toBe(TOO_FAR_AHEAD);
    expect(whenProblem(new Date(9999, 0, 4, 9, 0), now)).toBe(TOO_FAR_AHEAD);
    expect(dateBounds(now)).toEqual({ min: "2026-11-19", max: "2031-11-19" });
  });

  it("marks a no-show only from the start time on", () => {
    expect(canMarkNoShow({ startsAt: new Date(2026, 10, 19, 10, 15).toISOString() }, now)).toBe(false);
    expect(canMarkNoShow({ startsAt: now.toISOString() }, now)).toBe(true);
    expect(canMarkNoShow({ startsAt: new Date(2026, 10, 18, 9, 0).toISOString() }, now)).toBe(true);
  });
});
