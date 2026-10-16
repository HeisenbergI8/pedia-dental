import type { SearchWord } from "@pedia/shared";
import { Prisma } from "../generated/prisma/client.ts";

/** `%text%` with LIKE's own wildcards escaped (escape character `!`), so "50%" or "a_b" match literally. */
export const likePattern = (text: string) => `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;

/**
 * Decision 1: `matchesSearch` (@pedia/shared) as SQL over Patient's stored search columns. Every word must match the
 * names, or, for a caller who may see phones, a phone word may match the digits. `COLLATE utf8mb4_bin`: the stored text
 * and the words are both lowercased by JavaScript (patientSearchText, searchWords), so a byte comparison is exactly
 * the mock's `includes`.
 */
export function searchCondition(words: readonly SearchWord[], phones: boolean): Prisma.Sql {
  if (!words.length) return Prisma.sql`TRUE`;
  return Prisma.join(
    words.map((w) => {
      const names = Prisma.sql`searchNames COLLATE utf8mb4_bin LIKE ${likePattern(w.text)} ESCAPE '!'`;
      return phones && w.digits !== undefined ? Prisma.sql`(${names} OR searchPhones LIKE ${likePattern(w.digits)} ESCAPE '!')` : names;
    }),
    " AND ",
  );
}

/** A parent's children only (`own` scope); `undefined` (staff, `all`) narrows nothing. No children: nothing at all. */
export function scopeCondition(children: ReadonlySet<string> | undefined): Prisma.Sql {
  if (!children) return Prisma.sql`TRUE`;
  return children.size ? Prisma.sql`id IN (${Prisma.join([...children])})` : Prisma.sql`FALSE`;
}
