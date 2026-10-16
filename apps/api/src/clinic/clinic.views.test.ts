import { describe, expect, it } from "vitest";
import { brandingRefusal, logoUrlOf, toClinicAccount, toStaffMember } from "./clinic.views";

const row = {
  id: "staff_x", clinicId: "c1", fullName: "Dr. Ana Cruz", role: "dentist" as const, alsoRoles: [], isOwner: false,
  branchIds: ["b1"], licenseNo: "0012345", email: "ana@clinic.ph", deactivatedAt: new Date("2026-10-01T00:00:00Z"),
};

describe("clinic views", () => {
  it("refuses a colour below AA with the nearest that passes, in the mock's words, and passes one that is fine", () => {
    expect(brandingRefusal("#e07a48")).toMatch(/too light for text and buttons.*Try #[0-9a-f]{6}\.$/);
    expect(brandingRefusal("#0d6e8c")).toBeUndefined();
  });

  it("serves a staff member's email to the Owner only, and who was deactivated to staff only", () => {
    expect(toStaffMember(row, ["owner", "dentist"])).toMatchObject({ email: "ana@clinic.ph", deactivatedAt: "2026-10-01T00:00:00.000Z" });
    const dentist = toStaffMember(row, ["dentist"]);
    expect(["email" in dentist, "deactivatedAt" in dentist]).toEqual([false, true]);
    const parent = toStaffMember(row, ["parent"]);
    expect(["email" in parent, "deactivatedAt" in parent, parent.licenseNo]).toEqual([false, false, "0012345"]);
  });

  it("leaves unset optionals out instead of sending null or []", () => {
    const s = toStaffMember({ ...row, licenseNo: null, deactivatedAt: null }, ["admin"]);
    expect(Object.keys(s).sort()).toEqual(["branchIds", "clinicId", "fullName", "id", "role"]);
    const account = toClinicAccount({ id: "c1", name: "Ngiti", logoRef: null, contactEmail: "a@b.ph", tin: "123-456-789", tier: "small", status: "active", brandColor: "#0f766e", headingFont: null });
    expect(["logoRef" in account, "headingFont" in account]).toEqual([false, false]);
  });

  it("points a seeded logo at the web's static file and an upload at the API", () => {
    expect([logoUrlOf(undefined), logoUrlOf("demo/bulilit.svg"), logoUrlOf("k 1")]).toEqual([null, "/demo/bulilit.svg", "/api/clinic/logo?v=k%201"]);
  });
});
