import { PatientFilter } from "@pedia/shared";
import { describe, expect, it } from "vitest";
import { countsSql, filterSql, orderSql } from "./patient-standing";

const bounds = { recentFrom: "2026-09-17", recallBy: "2026-10-23" };

/** B14: the SQL text and values; that the SQL list answers as the shared rules do is test/int/standing.int.test.ts. */
describe("the list's SQL (B14)", () => {
  it("filters on the stored columns against today's bounds", () => {
    const sql = (f: PatientFilter) => [filterSql(f, bounds).sql, filterSql(f, bounds).values];
    expect(sql("all")).toEqual(["TRUE", []]);
    expect(sql("balance_due")).toEqual(["balance > 0", []]);
    expect(sql("recall_due")).toEqual(["(nextDueOn IS NOT NULL AND nextDueOn <= ?)", ["2026-10-23"]]);
    expect(sql("recent_visit")).toEqual(["(lastVisitOn IS NOT NULL AND lastVisitOn >= ?)", ["2026-09-17"]]);
    expect(sql("needs_attention")).toEqual(["(balance > 0 OR (nextDueOn IS NOT NULL AND nextDueOn <= ?) OR noContact)", ["2026-10-23"]]);
  });

  it("sorts as comparePatients: never-seen last, then name and id", () => {
    expect(orderSql("name").sql).toBe("lastName, firstName, id");
    expect(orderSql("last_visit").sql).toBe("lastVisitOn IS NULL, lastVisitOn DESC, lastName, firstName, id");
    expect(orderSql("balance").sql).toBe("balance DESC, lastName, firstName, id");
  });

  it("counts every chip in one select, aliased by filter", () => {
    const { sql } = countsSql(bounds);
    for (const f of PatientFilter.options) expect(sql).toContain(`AS \`${f}\``);
    expect(sql.match(/SUM\(/g)).toHaveLength(PatientFilter.options.length);
  });
});
