import { describe, expect, it } from "vitest";
import { promptChildren } from "./family";

describe("promptChildren (a parent's notice page)", () => {
  const at = "2026-10-01T00:00:00.000Z";
  it("reads the newest choices for a child with consent, and nothing for one without", () => {
    const choices = new Map([["a", [
      { photos: true, reminders: true, by: "staff" as const, byName: "S", at },
      { photos: false, reminders: true, by: "parent" as const, byName: "P", at },
    ]]]);
    expect(promptChildren([{ id: "a", firstName: "Ana" }, { id: "b", firstName: "Ben" }], new Set(["a"]), choices)).toEqual([
      { firstName: "Ana", recorded: true, photos: false, reminders: true },
      { firstName: "Ben", recorded: false, photos: undefined, reminders: undefined },
    ]);
  });
});
