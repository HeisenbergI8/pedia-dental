import type { ReactNode } from "react";
import { MetaLine } from "@/components/meta-line";
import { cn } from "@/lib/utils";

/**
 * Where a column goes in the phone card. `title` (line 1, strong), `trailing` (line 1, right: an
 * amount or status), `meta` (line 2, a MetaLine), `detail` (behind "More details"), `hidden`.
 */
export type MobileSlot = "title" | "trailing" | "meta" | "detail" | "hidden";

export type DataColumn<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  mobile?: MobileSlot;
  /** Money, counts, times: right-aligned with tabular figures. */
  numeric?: boolean;
  className?: string;
};

/**
 * Tabular data with a deliberate phone layout: a semantic table from md up, and below md one card per
 * row showing the 2–3 primary fields, the rest behind "More details". Both are rendered and swapped by
 * CSS, so only one is ever in the accessibility tree.
 */
export function DataList<T>({
  rows,
  columns,
  rowKey,
  caption,
  actions,
  bare,
  className,
}: {
  rows: T[];
  columns: DataColumn<T>[];
  rowKey: (row: T) => string;
  /** Names the table for screen readers. */
  caption: string;
  /** Per-row actions: the last table column, and the foot of each card. */
  actions?: (row: T) => ReactNode;
  /** Inside a card already: no outer border or background of its own. */
  bare?: boolean;
  className?: string;
}) {
  const frame = bare ? "" : "overflow-hidden rounded-xl border border-line bg-surface";
  const slot = (c: DataColumn<T>): MobileSlot => c.mobile ?? "detail";
  const title = columns.filter((c) => slot(c) === "title");
  const trailing = columns.filter((c) => slot(c) === "trailing");
  const meta = columns.filter((c) => slot(c) === "meta");
  const detail = columns.filter((c) => slot(c) === "detail");

  return (
    <div className={className}>
      <div className={cn("hidden md:block", frame)}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead className={cn("border-b border-line text-ink-muted", !bare && "bg-ground/60")}>
            <tr>
              {columns.map((c) => (
                <th key={c.key} scope="col" className={cn("py-2.5 font-medium", bare ? "pr-3 last:pr-0" : "px-4", c.numeric && "text-right", c.className)}>
                  {c.header}
                </th>
              ))}
              {actions && <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={rowKey(r)} className="transition-colors duration-(--duration-fast) hover:bg-ground/60">
                {columns.map((c) => (
                  <td key={c.key} className={cn("py-3 align-middle", bare ? "pr-3 last:pr-0" : "px-4", c.numeric && "text-right whitespace-nowrap tabular-nums", c.className)}>
                    {c.cell(r)}
                  </td>
                ))}
                {actions && <td className="px-4 py-2 text-right whitespace-nowrap">{actions(r)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={caption} className={cn("divide-y divide-line md:hidden", frame)}>
        {rows.map((r) => (
          <li key={rowKey(r)} className={cn("space-y-1.5", bare ? "py-3" : "p-4")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 font-medium">
                {title.map((c) => <div key={c.key}>{c.cell(r)}</div>)}
              </div>
              {trailing.length > 0 && (
                <div className="shrink-0 text-right whitespace-nowrap tabular-nums">
                  {trailing.map((c) => <div key={c.key}>{c.cell(r)}</div>)}
                </div>
              )}
            </div>
            {meta.length > 0 && <MetaLine items={meta.map((c) => c.cell(r))} />}
            {detail.length > 0 && (
              <details className="group text-sm">
                <summary className="inline-flex min-h-(--control-h-sm) items-center font-medium text-brand">More details</summary>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                  {detail.map((c) => (
                    <div key={c.key} className="contents">
                      <dt className="text-ink-muted">{c.header}</dt>
                      <dd className={cn(c.numeric && "tabular-nums")}>{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
            {actions && <div className="flex flex-wrap gap-2 pt-1">{actions(r)}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
