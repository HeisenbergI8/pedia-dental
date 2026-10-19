import { describe, expect, it } from "vitest";
import { STAFF_ROLES, roleCan } from "./permissions";
import { addWorkingDays, readRequestCursor, requestCursor, requestStanding } from "./privacy-requests";

describe("privacy request deadlines (B13c2b)", () => {
  it("counts working days, Monday to Friday", () => {
    expect(addWorkingDays("2026-10-19", 15)).toBe("2026-11-09"); // a Monday + 3 weeks
    expect(addWorkingDays("2026-10-23", 1)).toBe("2026-10-26"); // Friday → Monday
    expect(addWorkingDays("2026-10-24", 1)).toBe("2026-10-26"); // received on a Saturday
  });
  it("says overdue after the due day and due soon within three working days, for open requests only", () => {
    expect(requestStanding({ status: "open", dueOn: "2026-10-19" }, "2026-10-20")).toBe("overdue");
    expect(requestStanding({ status: "open", dueOn: "2026-10-22" }, "2026-10-19")).toBe("due_soon");
    expect(requestStanding({ status: "open", dueOn: "2026-11-09" }, "2026-10-19")).toBeUndefined();
    expect(requestStanding({ status: "done", dueOn: "2026-10-01" }, "2026-10-19")).toBeUndefined();
  });
  it("reads back its own cursor", () => {
    expect(readRequestCursor(requestCursor({ closedAt: "2026-10-19T03:00:00.000Z", id: "r1" }))).toEqual({ at: "2026-10-19T03:00:00.000Z", id: "r1" });
  });
  it("gives privacy.manage to the Owner and admins only", () => {
    expect(STAFF_ROLES.filter((r) => roleCan(r, "privacy.manage"))).toEqual(["owner", "admin"]);
    expect(roleCan("parent", "privacy.manage")).toBe(false);
  });
});
