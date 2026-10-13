import { describe, expect, it } from "vitest";
import { OpeningHours } from "../schemas/tenancy";
import {
  DEFAULT_OPENING_HOURS,
  TIER_LIMITS,
  accountUsage,
  archiveProblem,
  canAddUnder,
  formatTin,
  holdsRole,
  isActiveStaff,
  limitMessage,
  reportBranchFilter,
  rolesOf,
  transferProblem,
  usableBranches,
  worksAt,
} from "./tenancy";

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
    expect(worksAt({ role: "front_desk", branchIds: ["dasma"], deactivatedAt: "2026-10-01T00:00:00.000Z" }, b("dasma"))).toBe(false);
  });
});

describe("limits in use (decisions #8, #10, #37)", () => {
  const s = (fullName: string, branchIds: string[], extra: Partial<{ isOwner: boolean; deactivatedAt: string }> = {}) => ({ fullName, branchIds, ...extra });
  it("counts open branches and active logins, the Owner included", () => {
    const usage = accountUsage({
      branches: [{ archived: false }, { archived: true }],
      staff: [s("Owner", ["a"], { isOwner: true }), s("Gone", ["a"], { deactivatedAt: "2026-10-01T00:00:00.000Z" }), s("Here", ["a"])],
    });
    expect(usage).toEqual({ branches: 1, staffLogins: 2 });
    expect(isActiveStaff({ deactivatedAt: undefined })).toBe(true);
  });

  it("says the limit and how to lift it, the same words everywhere", () => {
    expect(limitMessage("small", "branches")).toBe("Your Small plan includes 1 branch. Contact Primolar to upgrade.");
    expect(limitMessage("small", "staffLogins")).toBe("Your Small plan includes 5 staff logins. Contact Primolar to upgrade.");
    expect(limitMessage("mid", "branches")).toBe("Your Mid plan includes 3 branches. Contact Primolar to upgrade.");
  });

  it("never archives the last open branch, strands a login, or drops a booking (decision #22)", () => {
    const branches = [{ id: "imus", archived: false }, { id: "dasma", archived: false }, { id: "old", archived: true }];
    const imus = { id: "imus", name: "Imus" };
    const staff = [s("Owner", ["imus"], { isOwner: true }), s("Liza Cruz", ["imus"]), s("Ana Reyes", ["imus", "dasma"])];
    expect(archiveProblem(imus, { branches: branches.filter((b) => b.id !== "dasma"), staff: [], upcoming: 0 })).toMatch(/always keeps one open branch/);
    expect(archiveProblem(imus, { branches, staff, upcoming: 0 })).toBe("Liza Cruz works only at Imus. Deactivate them first.");
    const free = staff.filter((x) => x.fullName !== "Liza Cruz");
    expect(archiveProblem(imus, { branches, staff: free, upcoming: 2 })).toBe("Imus has 2 upcoming appointments. Move or cancel them first.");
    expect(archiveProblem(imus, { branches, staff: free, upcoming: 0 })).toBeUndefined();
    // A deactivated login doesn't hold a branch open.
    expect(archiveProblem(imus, { branches, staff: [...free, s("Gone", ["imus"], { deactivatedAt: "2026-10-01T00:00:00.000Z" })], upcoming: 0 })).toBeUndefined();
  });

  it("formats a TIN as typed (decision #42)", () => {
    expect(formatTin("123456789")).toBe("123-456-789");
    expect(formatTin("123 456 789 0001")).toBe("123-456-789-0001");
    expect(formatTin("12345")).toBe("123-45");
  });
});

describe("reportBranchFilter (decision #20)", () => {
  const branch = (id: string) => ({ clinicId: "c", id, name: id, address: "a", phone: "p", openingHours: DEFAULT_OPENING_HOURS, archived: false });
  const two = [branch("branch_a"), branch("branch_b")];
  it("is not offered on Small", () => expect(reportBranchFilter("small", ["owner", "dentist"], two)).toBeUndefined());
  it("is not offered at a single branch", () => expect(reportBranchFilter("mid", ["owner"], [two[0]!])).toBeUndefined());
  it("gives the Owner every branch and All branches", () =>
    expect(reportBranchFilter("mid", ["owner", "dentist"], two)).toEqual({ branches: two, all: true }));
  it("gives staff at two branches those two, without All branches", () =>
    expect(reportBranchFilter("big", ["admin"], two)).toEqual({ branches: two, all: false }));
});

describe("transferProblem (decision #13)", () => {
  const staff = [
    { id: "s_owner", fullName: "Dr. Owner", isOwner: true },
    { id: "s_admin", fullName: "Ana Admin" },
    { id: "s_gone", fullName: "Gil Gone", deactivatedAt: "2026-10-01T00:00:00.000Z" },
  ];
  it("allows an active staff login", () => expect(transferProblem(staff, "s_admin")).toBeUndefined());
  it("refuses a deactivated login", () => expect(transferProblem(staff, "s_gone")).toMatch(/deactivated/));
  it("refuses the current Owner", () => expect(transferProblem(staff, "s_owner")).toMatch(/already the Owner/));
  it("refuses someone outside the account", () => expect(transferProblem(staff, "staff_elsewhere")).toMatch(/Choose/));
});
