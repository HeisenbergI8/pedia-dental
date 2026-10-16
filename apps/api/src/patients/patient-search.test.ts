import { searchWords } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { likePattern, scopeCondition, searchCondition } from "./patient-search";

describe("the search condition (decision 1)", () => {
  it("escapes LIKE's wildcards", () => expect(likePattern("50%_!")).toBe("%50!%!_!!%"));

  it("needs every word in the names, and never reads phones for a caller without patients.contact", () => {
    const c = searchCondition(searchWords("Bea 0917-123"), false);
    expect(c.values).toEqual(["%bea%", "%0917-123%"]);
    expect(c.sql).not.toContain("searchPhones");
  });

  it("lets a phone word match the digits for a caller with patients.contact", () => {
    const c = searchCondition(searchWords("Bea 0917-123"), true);
    expect(c.values).toEqual(["%bea%", "%0917-123%", "%0917123%"]);
    expect(c.sql.match(/searchPhones/g)).toHaveLength(1); // "bea" isn't a phone word
  });

  it("matches everything for an empty search, and nothing for a parent with no children", () => {
    expect(searchCondition([], true).sql).toBe("TRUE");
    expect(scopeCondition(new Set()).sql).toBe("FALSE");
    expect(scopeCondition(new Set(["a", "b"])).values).toEqual(["a", "b"]);
  });
});
