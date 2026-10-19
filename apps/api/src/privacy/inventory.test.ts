import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { retentionInventory } from "./retention-schedule";

const DOC = readFileSync(new URL("../../../../PRIVACY_OPERATIONS.md", import.meta.url), "utf8");
const between = (start: string, end: string) => DOC.slice(DOC.indexOf(start) + start.length, DOC.indexOf(end)).trim();

describe("PRIVACY_OPERATIONS.md (B13c2a)", () => {
  // On failure: paste retentionInventory()'s output between the markers (the schedule is the source).
  it("carries the retention schedule's inventory, generated", () => {
    expect(between("<!-- inventory:start -->", "<!-- inventory:end -->")).toBe(retentionInventory());
  });
  it("marks every legal threshold for counsel", () => {
    for (const topic of ["Registration", "Retention", "Breach", "Requests"]) expect(DOC, topic).toMatch(new RegExp(`## ${topic}[\\s\\S]*?confirm with counsel`, "i"));
  });
});
