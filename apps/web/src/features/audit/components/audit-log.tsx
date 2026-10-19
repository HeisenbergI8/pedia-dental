"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { LoaderCircleIcon, ScrollTextIcon, SearchXIcon, ShieldXIcon } from "lucide-react";
import type { AuditAction, AuditLogEntry } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList } from "@/components/data-list";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Segmented } from "@/components/segmented";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ROLE_LABEL } from "@/features/auth/access";
import { useStaff } from "@/features/clinic/api";
import { cn } from "@/lib/utils";
import { useAuditLog } from "../api";

/** What each action reads as in the clinic's words. `denied` carries an icon too (never colour alone). */
const ACTION_LABEL: Record<AuditAction, string> = {
  sign_in: "Signed in", sign_in_failed: "Wrong password", sign_out: "Signed out", timed_out: "Timed out",
  view: "Viewed", create: "Added", update: "Changed", export: "Exported or printed", denied: "Refused",
};
const FILTERS = [["all", "All"], ["view", "Views"], ["update", "Changes"], ["export", "Exports"], ["denied", "Refused"]] as const;
type Filter = (typeof FILTERS)[number][0];
const EVERYONE = "everyone";

/** Filters live in the URL (?tab=privacy&action=denied&person=staff_cruz), so refresh and a shared link keep them. */
function useFilters() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("action");
  const action: Filter = FILTERS.some(([v]) => v === raw) ? (raw as Filter) : "all";
  const person = params.get("person") ?? undefined;
  const set = (key: "action" | "person", value: string | undefined) => {
    const q = new URLSearchParams(params);
    if (value) q.set(key, value);
    else q.delete(key);
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  const clear = () => {
    const q = new URLSearchParams(params);
    q.delete("action");
    q.delete("person");
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return { action, person, set, clear };
}

function What({ entry: e }: { entry: AuditLogEntry }) {
  const denied = e.action === "denied";
  return (
    <span className={cn("inline-flex items-start gap-1.5", denied && "text-danger")}>
      {denied && <ShieldXIcon aria-hidden className="mt-0.5 size-4 shrink-0" />}
      <span>
        <span className="font-medium">{ACTION_LABEL[e.action]}</span> · {e.record}
      </span>
    </span>
  );
}

/**
 * B13c2a: the clinic's audit trail for the Owner (Settings → Privacy). Newest first, 50 at a time with "Load older"
 * and no total: a count over an unbounded trail is the cost the cursor avoids (decisions.md E8).
 */
export function AuditLog() {
  const { action, person, set, clear } = useFilters();
  const log = useAuditLog({ action: action === "all" ? undefined : action, actorId: person });
  const staff = useStaff().data ?? [];
  const entries = log.data?.pages.flatMap((p) => p.entries) ?? [];
  const filtered = action !== "all" || person !== undefined;

  return (
    <SectionCard
      title="Audit log"
      description="Every sign-in, view, change, export and refused request in your clinic, newest first. Opening this log is logged too."
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="scroll-fade-x max-w-full overflow-x-auto">
          <Segmented
            label="Show"
            className="w-max"
            value={action}
            onChange={(v) => set("action", v === "all" ? undefined : v)}
            options={FILTERS.map(([value, label]) => ({
              value,
              label: value === "denied" ? <span className="inline-flex items-center gap-1"><ShieldXIcon aria-hidden className="size-3.5" />{label}</span> : label,
            }))}
          />
        </div>
        <Select value={person ?? EVERYONE} onValueChange={(v) => set("person", v === EVERYONE ? undefined : v)}>
          <SelectTrigger aria-label="Person" className="w-52 max-w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={EVERYONE}>Everyone</SelectItem>
            {staff.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtered && (
          <Button variant="ghost" size="sm" onClick={clear}>
            Clear filters
          </Button>
        )}
      </div>

      {log.isLoading ? (
        <Loading label="Loading the audit log" rows={5} />
      ) : log.error ? (
        <ErrorState what="the audit log" onRetry={() => log.refetch()} retrying={log.isRefetching} />
      ) : entries.length === 0 ? (
        filtered ? (
          <EmptyState icon={SearchXIcon} title="No entries match these filters" action={<Button variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
        ) : (
          <EmptyState icon={ScrollTextIcon} title="Nothing logged yet">Sign-ins, and every record opened or changed, appear here.</EmptyState>
        )
      ) : (
        <div className="space-y-3">
          <DataList
            bare
            caption="Audit log, newest first"
            rows={entries}
            rowKey={(e) => e.id}
            columns={[
              { key: "when", header: "When", mobile: "trailing", className: "whitespace-nowrap tabular-nums text-ink-muted", cell: (e) => format(parseISO(e.at), "MMM d, h:mm a") },
              {
                key: "who",
                header: "Who",
                mobile: "title",
                cell: (e) => (
                  <span className="block">
                    <span className="block font-medium">{e.actorName}</span>
                    <span className="block text-xs font-normal text-ink-muted">{ROLE_LABEL[e.actorRole]}</span>
                  </span>
                ),
              },
              { key: "what", header: "What", mobile: "meta", cell: (e) => <What entry={e} /> },
              {
                key: "child",
                header: "Child",
                mobile: "meta",
                // No child: an empty cell, and nothing in the phone card's line (MetaLine drops null).
                cell: (e) =>
                  e.patientId ? (
                    <Link href={`/patients/${e.patientId}`} className="text-brand underline-offset-2 hover:underline">
                      {e.patientName ?? "A patient"}
                    </Link>
                  ) : null,
              },
            ]}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
            <p className="text-ink-muted" aria-live="polite">
              {log.hasNextPage ? `Showing the latest ${entries.length} entries` : `Showing all ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`}
            </p>
            {log.hasNextPage && (
              <Button variant="outline" size="sm" disabled={log.isFetchingNextPage} aria-busy={log.isFetchingNextPage} onClick={() => log.fetchNextPage()}>
                {log.isFetchingNextPage && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
                Load older
              </Button>
            )}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
