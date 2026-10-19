"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, parseISO } from "date-fns";
import { CheckIcon, ClockAlertIcon, ClockIcon, InboxIcon, LoaderCircleIcon, XIcon } from "lucide-react";
import { requestStanding, type PrivacyRequest } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { DataList, type DataColumn } from "@/components/data-list";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { SectionCard } from "@/components/section-card";
import { Segmented } from "@/components/segmented";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RecordsCopyButton } from "@/features/patients/components/records-copy-button";
import { formatDate } from "@/lib/format";
import { KIND_LABEL, useClosedPrivacyRequests, useOpenPrivacyRequests } from "../api";
import { CHANNEL_LABEL, CloseRequestDialog, LogRequestDialog } from "./request-dialogs";

/** Open or Closed lives in the URL (?tab=privacy&requests=closed), as the audit log's filters. */
function useShown() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const shown = params.get("requests") === "closed" ? "closed" : "open";
  const set = (v: "open" | "closed") => {
    const q = new URLSearchParams(params);
    if (v === "closed") q.set("requests", "closed");
    else q.delete("requests");
    router.replace(`${pathname}?${q}`, { scroll: false });
  };
  return [shown, set] as const;
}

/** Overdue and due soon say so in words with an icon, never colour alone (E10). */
function Standing({ request: r, today }: { request: PrivacyRequest; today: string }) {
  const standing = requestStanding(r, today);
  if (standing === "overdue") {
    return <span className="inline-flex items-center gap-1 font-semibold text-danger"><ClockAlertIcon aria-hidden className="size-4" />Overdue</span>;
  }
  if (standing === "due_soon") {
    return <span className="inline-flex items-center gap-1 font-semibold text-warning"><ClockIcon aria-hidden className="size-4" />Due soon</span>;
  }
  return null;
}

const COLUMNS: DataColumn<PrivacyRequest>[] = [
  {
    key: "child",
    header: "Child",
    mobile: "title",
    // The Owner and admins can open a restricted child: this row is how they reach one (it is in no list).
    cell: (r) =>
      r.patientId ? (
        <Link href={`/patients/${r.patientId}`} className="font-medium text-brand underline-offset-2 hover:underline">{r.patientName ?? "A patient"}</Link>
      ) : (
        <span className="text-ink-muted">No one child</span>
      ),
  },
  { key: "kind", header: "Request", mobile: "meta", cell: (r) => <span className="font-medium">{KIND_LABEL[r.kind]}</span> },
  {
    key: "who",
    header: "Asked by",
    mobile: "meta",
    cell: (r) => (
      <span className="block">
        <span className="block">{r.requesterName}{r.relationship ? ` (${r.relationship})` : ""}</span>
        <span className="block text-xs text-ink-muted">{CHANNEL_LABEL[r.channel]} · received {formatDate(r.receivedOn)}</span>
      </span>
    ),
  },
];

function OpenRequests() {
  const open = useOpenPrivacyRequests();
  const today = format(new Date(), "yyyy-MM-dd");
  if (open.isLoading) return <Loading label="Loading privacy requests" rows={3} />;
  if (open.error) return <ErrorState what="the privacy requests" onRetry={() => open.refetch()} retrying={open.isRefetching} />;
  const rows = open.data?.requests ?? [];
  if (!rows.length) {
    return (
      <EmptyState icon={InboxIcon} title="No open requests">
        When a parent asks to see, correct or erase their child&apos;s record, log it here so it&apos;s answered on time.
      </EmptyState>
    );
  }
  return (
    <DataList
      bare
      caption="Open privacy requests, soonest due first"
      rows={rows}
      rowKey={(r) => r.id}
      columns={[
        ...COLUMNS,
        {
          key: "due",
          header: "Due",
          mobile: "trailing",
          className: "whitespace-nowrap",
          cell: (r) => (
            <span className="block">
              <span className="block tabular-nums">{formatDate(r.dueOn)}</span>
              <span className="block text-sm"><Standing request={r} today={today} /></span>
            </span>
          ),
        },
      ]}
      actions={(r) => (
        <span className="inline-flex flex-wrap justify-end gap-2">
          {/* E9: an access request offers the child's copy of records (B13c2a). */}
          {r.kind === "access" && r.patientId && <RecordsCopyButton patientId={r.patientId} label="Copy of records" className="h-(--control-h-sm) px-3" />}
          <CloseRequestDialog request={r} />
        </span>
      )}
    />
  );
}

function ClosedRequests() {
  const closed = useClosedPrivacyRequests();
  if (closed.isLoading) return <Loading label="Loading closed requests" rows={3} />;
  if (closed.error) return <ErrorState what="the closed requests" onRetry={() => closed.refetch()} retrying={closed.isRefetching} />;
  const rows = closed.data?.pages.flatMap((p) => p.requests) ?? [];
  if (!rows.length) return <EmptyState icon={InboxIcon} title="No closed requests yet" />;
  return (
    <div className="space-y-3">
      <DataList
        bare
        caption="Closed privacy requests, newest first"
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          ...COLUMNS,
          {
            key: "outcome",
            header: "Outcome",
            mobile: "detail",
            cell: (r) => (
              <span className="block max-w-sm space-y-1">
                <Badge variant="outline" className="text-ink-muted">
                  {r.status === "done" ? <CheckIcon aria-hidden /> : <XIcon aria-hidden />}
                  {r.status === "done" ? "Done" : "Declined"}
                </Badge>
                <span className="block text-sm">{r.outcome}</span>
                <span className="block text-xs text-ink-muted">
                  {r.closedByName} · {r.closedAt && format(parseISO(r.closedAt), "MMM d, yyyy")}
                </span>
              </span>
            ),
          },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3 text-sm">
        <p className="text-ink-muted" aria-live="polite">
          {closed.hasNextPage ? `Showing the latest ${rows.length} closed requests` : `Showing all ${rows.length} closed ${rows.length === 1 ? "request" : "requests"}`}
        </p>
        {closed.hasNextPage && (
          <Button variant="outline" size="sm" disabled={closed.isFetchingNextPage} aria-busy={closed.isFetchingNextPage} onClick={() => closed.fetchNextPage()}>
            {closed.isFetchingNextPage && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
            Load older
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * B13c2b: the privacy request register (Settings → Privacy, above the audit log; E10). Open requests in one list,
 * soonest due first; closed ones a page at a time (E4). Admins hold privacy.manage but the tab is the Owner's (Q5).
 */
export function PrivacyRequests() {
  const [shown, setShown] = useShown();
  const openCount = useOpenPrivacyRequests().data?.requests.length;
  return (
    <SectionCard
      title="Privacy requests"
      description="Requests from parents about their children's records. Answer each by its due date."
      action={<LogRequestDialog />}
    >
      <Segmented
        label="Show"
        className="w-max"
        value={shown}
        onChange={setShown}
        options={[
          { value: "open", label: openCount === undefined ? "Open" : `Open (${openCount})` },
          { value: "closed", label: "Closed" },
        ]}
      />
      {shown === "open" ? <OpenRequests /> : <ClosedRequests />}
    </SectionCard>
  );
}
