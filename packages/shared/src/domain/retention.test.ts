import { describe, expect, it } from "vitest";
import { RECORD_RETENTION, retentionConfirmed, retentionEnded, retentionEndsOn } from "./retention";

const P = { yearsAfterLastVisit: 10, untilAge: 18 };

describe("record retention (B13c2b-2)", () => {
  it("ships unconfirmed: no end date, nothing ends (confirm with counsel)", () => {
    expect(RECORD_RETENTION).toEqual({ yearsAfterLastVisit: null, untilAge: null });
    expect(retentionConfirmed(RECORD_RETENTION)).toBe(false);
    expect(retentionEndsOn({ birthDate: "2000-01-01", lastActivityOn: "2001-01-01" }, RECORD_RETENTION)).toBeUndefined();
    expect(retentionEnded({ birthDate: "2000-01-01", lastActivityOn: "2001-01-01" }, RECORD_RETENTION, "2099-01-01")).toBe(false);
  });
  it("needs both periods", () => {
    expect(retentionEndsOn({ birthDate: "2000-01-01", lastActivityOn: "2001-01-01" }, { yearsAfterLastVisit: 10, untilAge: null })).toBeUndefined();
    expect(retentionEndsOn({ birthDate: "2000-01-01", lastActivityOn: "2001-01-01" }, { yearsAfterLastVisit: null, untilAge: 18 })).toBeUndefined();
  });
  it("takes the later of the two ends", () => {
    expect(retentionEndsOn({ birthDate: "2015-03-10", lastActivityOn: "2020-01-05" }, P)).toBe("2033-03-10"); // the age
    expect(retentionEndsOn({ birthDate: "2015-03-10", lastActivityOn: "2030-06-01" }, P)).toBe("2040-06-01"); // the visit
  });
  it("moves a 29 February birthday to the 28th", () => {
    expect(retentionEndsOn({ birthDate: "2016-02-29", lastActivityOn: "2017-01-01" }, P)).toBe("2034-02-28");
  });
  it("ends the day after the end date, not on it", () => {
    const child = { birthDate: "2015-03-10", lastActivityOn: "2020-01-05" };
    expect(retentionEnded(child, P, "2033-03-10")).toBe(false);
    expect(retentionEnded(child, P, "2033-03-11")).toBe(true);
  });
});
