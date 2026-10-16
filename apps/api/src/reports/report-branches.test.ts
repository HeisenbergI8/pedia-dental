import { DEFAULT_OPENING_HOURS, type Branch } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { reportBranches } from "./report-branches";

const branch = (id: string, archived = false): Branch => ({ id, clinicId: "c", name: id, address: "a", phone: "p", openingHours: DEFAULT_OPENING_HOURS, archived });
const [imus, dasma, old] = [branch("imus"), branch("dasma"), branch("old", true)];
const every = [imus, dasma, old];

describe("reportBranches (mocks/access.ts:86–98)", () => {
  it("gives the device's branch when none or the device's own is asked", () => {
    expect(reportBranches(undefined, imus, "small", ["front_desk"], [imus], every)).toEqual(["imus"]);
    expect(reportBranches("imus", imus, "small", ["front_desk"], [imus], every)).toEqual(["imus"]);
  });

  it("refuses another branch on the Small plan", () => {
    expect(reportBranches("dasma", imus, "small", ["owner"], [imus, dasma], every)).toEqual({ status: 403, message: "Reports across branches come with the Mid and Big plans. Contact Primolar to upgrade." });
  });

  it("refuses a caller who works at one open branch", () => {
    expect(reportBranches("dasma", imus, "mid", ["admin"], [imus], every)).toEqual({ status: 403, message: "Reports across branches need two open branches you work at" });
  });

  it("gives all branches, archived too, to the Owner only", () => {
    expect(reportBranches("all", imus, "mid", ["admin"], [imus, dasma], every)).toEqual({ status: 403, message: "Only the clinic's Owner sees all branches together" });
    expect(reportBranches("all", imus, "mid", ["owner", "dentist"], [imus, dasma], every)).toEqual(["imus", "dasma", "old"]);
  });

  it("gives another branch only to someone who works there", () => {
    expect(reportBranches("old", imus, "big", ["admin"], [imus, dasma], every)).toEqual({ status: 403, message: "You don't work at that branch" });
    expect(reportBranches("dasma", imus, "big", ["admin"], [imus, dasma], every)).toEqual(["dasma"]);
  });
});
