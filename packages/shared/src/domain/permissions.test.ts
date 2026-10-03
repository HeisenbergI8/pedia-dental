import { describe, expect, it } from "vitest";
import { Permission } from "../schemas/auth";
import { Role } from "../schemas/common";
import { permissionScope, roleCan } from "./permissions";

const PARENT_ONLY = ["appointments.request", "uploads.create"];

describe("ROLE_PERMISSIONS", () => {
  it("gives admin every staff permission, clinic-wide", () => {
    for (const p of Permission.options.filter((p) => !PARENT_ONLY.includes(p))) {
      expect(permissionScope("admin", p), p).toBe("all");
    }
  });

  it("keeps the finance dashboard admin-only", () => {
    expect(Role.options.filter((r) => roleCan(r, "dashboard.view"))).toEqual(["admin"]);
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

  it("grants every permission to at least one role", () => {
    for (const p of Permission.options) expect(Role.options.some((r) => roleCan(r, p)), p).toBe(true);
  });
});
