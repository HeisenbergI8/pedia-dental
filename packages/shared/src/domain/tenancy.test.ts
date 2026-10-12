import { describe, expect, it } from "vitest";
import { OpeningHours } from "../schemas/tenancy";
import { DEFAULT_OPENING_HOURS, TIER_LIMITS, canAddUnder, holdsRole, rolesOf, usableBranches, worksAt } from "./tenancy";

describe("tier limits", () => {
  it("matches decision #5: Small 1 branch and 5 logins, Mid 3 and 20, Big unlimited", () => {
    expect([TIER_LIMITS.small, TIER_LIMITS.mid, TIER_LIMITS.big].map((t) => [t.branches, t.staffLogins])).toEqual([
      [1, 5],
      [3, 20],
      [null, null],
    ]);
  });

  it("blocks only the next one, so a downgraded account keeps what it has", () => {
    expect(canAddUnder("small", "branches", 0)).toBe(true);
    expect(canAddUnder("small", "branches", 1)).toBe(false);
    expect(canAddUnder("small", "staffLogins", 7)).toBe(false); // over the limit after a downgrade: no error, no new login
    expect(canAddUnder("big", "staffLogins", 10_000)).toBe(true);
  });

  it("gives cross-branch views to Mid and Big, and the heading font to Big only", () => {
    expect(TIER_LIMITS.small.crossBranchViews).toBe(false);
    expect(TIER_LIMITS.mid.crossBranchViews).toBe(true);
    expect([TIER_LIMITS.mid.headingFont, TIER_LIMITS.big.headingFont]).toEqual([false, true]);
  });
});

describe("opening hours", () => {
  it("accepts the default hours and refuses closing before opening", () => {
    expect(OpeningHours.safeParse(DEFAULT_OPENING_HOURS).success).toBe(true);
    expect(OpeningHours.safeParse({ ...DEFAULT_OPENING_HOURS, closesAt: 7 * 60 }).success).toBe(false);
  });
});

describe("roles and usable branches", () => {
  const b = (id: string, archived = false) => ({ clinicId: "c", id, name: id, address: "a", phone: "p", openingHours: DEFAULT_OPENING_HOURS, archived });
  const all = [b("imus"), b("dasma"), b("old", true)];
  it("gives the Owner every open branch, staff their assignments, and nobody an archived one", () => {
    expect(usableBranches(["owner", "dentist"], ["imus"], all).map((x) => x.id)).toEqual(["imus", "dasma"]);
    expect(usableBranches(["admin"], ["imus"], all).map((x) => x.id)).toEqual(["imus"]);
    expect(usableBranches(["dentist"], ["imus", "old"], all).map((x) => x.id)).toEqual(["imus"]);
  });
  it("lists every role held, highest first, for an Owner and for any staff role with a second one", () => {
    expect(rolesOf({ role: "dentist", isOwner: true })).toEqual(["owner", "dentist"]);
    expect(rolesOf({ role: "admin", alsoRoles: ["dentist"] })).toEqual(["admin", "dentist"]);
    expect(rolesOf({ role: "front_desk", alsoRoles: ["admin"] })).toEqual(["admin", "front_desk"]);
    expect(holdsRole({ role: "admin", alsoRoles: ["dentist"] }, "dentist")).toBe(true);
    expect(holdsRole({ role: "front_desk" }, "dentist")).toBe(false);
  });
  it("says who works at a branch: their assignment, or every branch for the Owner", () => {
    expect(worksAt({ role: "dentist", branchIds: ["imus"] }, b("dasma"))).toBe(false);
    expect(worksAt({ role: "dentist", branchIds: ["imus"], isOwner: true }, b("dasma"))).toBe(true);
    expect(worksAt({ role: "front_desk", branchIds: ["dasma"] }, b("dasma"))).toBe(true);
  });
});
