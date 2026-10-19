import { PatientFilter, type PatientSort } from "@pedia/shared";
import { Prisma } from "../generated/prisma/client.ts";

/**
 * B14: matchesFilter as SQL over Patient's stored standing, with listBounds(today) (the rules stay in @pedia/shared:
 * recent visit ⇔ lastVisitOn ≥ recentFrom; recall due ⇔ nextDueOn ≤ recallBy; balance due ⇔ balance > 0).
 */
export function filterSql(filter: PatientFilter, b: { recentFrom: string; recallBy: string }): Prisma.Sql {
  const recall = Prisma.sql`(nextDueOn IS NOT NULL AND nextDueOn <= ${b.recallBy})`;
  switch (filter) {
    case "all": return Prisma.sql`TRUE`;
    case "balance_due": return Prisma.sql`balance > 0`;
    case "recall_due": return recall;
    case "recent_visit": return Prisma.sql`(lastVisitOn IS NOT NULL AND lastVisitOn >= ${b.recentFrom})`;
    case "needs_attention": return Prisma.sql`(balance > 0 OR ${recall} OR noContact)`;
  }
}

/** comparePatients as ORDER BY: every sort ends on name, then id; never-seen patients sort last. */
export function orderSql(sort: PatientSort): Prisma.Sql {
  if (sort === "last_visit") return Prisma.sql`lastVisitOn IS NULL, lastVisitOn DESC, lastName, firstName, id`;
  if (sort === "balance") return Prisma.sql`balance DESC, lastName, firstName, id`;
  return Prisma.sql`lastName, firstName, id`;
}

/** Every chip's count in one pass over the matched rows, each aliased by its filter (SUM is DECIMAL: a string). */
export const countsSql = (b: { recentFrom: string; recallBy: string }): Prisma.Sql =>
  Prisma.join(PatientFilter.options.map((f) => Prisma.sql`COALESCE(SUM(${filterSql(f, b)}), 0) AS ${Prisma.raw(`\`${f}\``)}`), ", ");
