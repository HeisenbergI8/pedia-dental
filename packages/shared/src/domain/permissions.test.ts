import { describe, expect, it } from "vitest";
import { Permission } from "../schemas/auth";
import { Role } from "../schemas/common";
import { OWNER_ONLY, READ_ONLY_DENIED, STAFF_ROLES, permissionScope, permissionScopeFor, roleCan, rolesCan } from "./permissions";

const PARENT_ONLY = ["appointments.request", "uploads.create"];

describe("ROLE_PERMISSIONS", () => {
  it("gives the Owner every staff permission, and admin every one but the Owner's", () => {
    for (const p of Permission.options.filter((p) => !PARENT_ONLY.includes(p))) {
      expect(permissionScope("owner", p), p).toBe("all");
      if (!OWNER_ONLY.includes(p)) expect(permissionScope("admin", p), p).toBe("all");
    }
    expect(permissionScope("admin", "branches.all")).toBeUndefined();
    expect(Role.options.filter((r) => roleCan(r, "branches.all"))).toEqual(["owner"]);
    // Owner settings (decision #11): an Admin + Dentist still can't manage the account.
    expect(Role.options.filter((r) => roleCan(r, "clinic.manage"))).toEqual(["owner"]);
    expect(rolesCan(["admin", "dentist"], "clinic.manage")).toBe(false);
  });

  it("gives someone with two roles everything either grants", () => {
    expect(rolesCan(["front_desk"], "clinical.write")).toBe(false);
    expect(rolesCan(["front_desk", "dentist"], "clinical.write")).toBe(true); // dentist's
    expect(rolesCan(["front_desk", "dentist"], "billing.collect")).toBe(true); // front desk's
    expect(rolesCan(["dentist", "front_desk"], "patients.contact", "all")).toBe(true);
    expect(permissionScopeFor(["parent"], "patients.view")).toBe("own");
    expect(permissionScopeFor(["admin", "dentist"], "branches.all")).toBeUndefined();
  });

  it("lets every staff role switch user on a shared device, and never a parent", () => {
    expect(Role.options.filter((r) => roleCan(r, "session.switch"))).toEqual([...STAFF_ROLES]);
  });

  it("keeps the finance dashboard to the Owner and admin", () => {
    expect(Role.options.filter((r) => roleCan(r, "dashboard.view"))).toEqual(["owner", "admin"]);
  });

  it("shows today at a glance to every staff role, and every family's contacts only to admin and front desk", () => {
    expect(Role.options.filter((r) => roleCan(r, "today.view"))).toEqual(["owner", "admin", "dentist", "front_desk"]);
    expect(Role.options.filter((r) => roleCan(r, "patients.contact", "all"))).toEqual(["owner", "admin", "front_desk"]);
    expect(permissionScope("parent", "patients.contact")).toBe("own");
  });

  it("lets front desk read clinical records but not write them", () => {
    expect(roleCan("front_desk", "clinical.view")).toBe(true);
    expect(roleCan("front_desk", "plan.view")).toBe(true);
    expect(roleCan("front_desk", "clinical.write")).toBe(false);
    expect(roleCan("front_desk", "plan.write")).toBe(false);
  });

  it("lets dentists chart but not take payments", () => {
    expect(roleCan("dentist", "clinical.write")).toBe(true);
    expect(roleCan("dentist", "billing.view")).toBe(true);
    expect(roleCan("dentist", "billing.collect")).toBe(false);
  });

  it("never gives a parent clinic-wide access to patient data, or any clinical record", () => {
    for (const p of Permission.options.filter((p) => p !== "clinic.view")) {
      expect(permissionScope("parent", p), p).not.toBe("all");
    }
    expect(roleCan("parent", "clinical.view")).toBe(false);
    expect(roleCan("parent", "plan.view")).toBe(true);
    expect(roleCan("parent", "plan.view", "all")).toBe(false);
  });

  it("withholds exactly the portal's write actions from a read-only session", () => {
    const parentReads = ["patients.view", "patients.contact", "appointments.view", "plan.view", "billing.view", "messages.view"];
    expect([...READ_ONLY_DENIED].sort()).toEqual(Permission.options.filter((p) => permissionScope("parent", p) === "own" && !parentReads.includes(p)).sort());
  });

  it("grants every permission to at least one role", () => {
    for (const p of Permission.options) expect(Role.options.some((r) => roleCan(r, p)), p).toBe(true);
  });

  it("lets only the Owner and admins refund or void (B8 decisions 2, 3)", () => {
    expect(rolesCan(["owner"], "billing.adjust")).toBe(true);
    expect(rolesCan(["admin"], "billing.adjust")).toBe(true);
    expect(rolesCan(["front_desk"], "billing.adjust")).toBe(false);
    expect(rolesCan(["dentist"], "billing.adjust")).toBe(false);
    expect(rolesCan(["front_desk", "dentist"], "billing.adjust")).toBe(false); // two roles, neither holds it
    expect(permissionScope("parent", "billing.adjust")).toBeUndefined();
    expect(rolesCan(["front_desk"], "billing.collect")).toBe(true); // payments and deposits stay front desk's
  });
});
