import { describe, expect, it } from "vitest";
import { auditCursor, copySections, readAuditCursor, recordsCopyFileName } from "./privacy-operations";

describe("copy of records sections (B13c2a)", () => {
  it("gives the Owner every section and a parent no clinical one", () => {
    expect(copySections(["owner"]).omitted).toEqual([]);
    expect(copySections(["parent"]).omitted).toEqual(["visits", "chart", "notes", "growth", "documents"]);
    expect(copySections(["parent"]).included).toContain("photos"); // their own uploads (uploads.create)
  });
  it("leaves the message log out of a dentist's copy, and adds it for an Admin + Dentist", () => {
    expect(copySections(["dentist"]).omitted).toEqual(["messages"]);
    expect(copySections(["admin", "dentist"]).omitted).toEqual([]);
  });
  it("names the file after the child and the day, safely", () => {
    const patient = { firstName: "Ana Marie", lastName: "Dela Cruz/Ñ" } as never;
    expect(recordsCopyFileName({ patient, generatedAt: "2026-10-19T03:00:00.000Z" })).toBe("records-dela-cruz-n-ana-marie-2026-10-19.json");
  });
  it("reads back its own cursor and nothing else", () => {
    const e = { at: "2026-10-19T03:00:00.000Z", id: "a1" };
    expect(readAuditCursor(auditCursor(e))).toEqual(e);
    for (const bad of ["", "x|y", "2026-10-19T03:00:00.000Z", "2026-10-19T03:00:00.000Z|a|b"]) expect(readAuditCursor(bad), bad).toBeUndefined();
  });
});
