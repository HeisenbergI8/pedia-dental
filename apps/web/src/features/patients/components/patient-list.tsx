"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  FilterIcon,
  PhoneOffIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  UsersIcon,
} from "lucide-react";
import { PatientListQuery, formatPeso, type PatientFilter, type PatientSort, type PatientSummary } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Can, useCan } from "@/features/auth/access";
import { formatDate, formatPhone, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatientPage } from "../api";
import { formatAge } from "../age";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";

const alertsOf = (p: PatientSummary) => [...p.allergies, ...p.medicalConditions, ...p.alerts];

const FILTERS: { value: PatientFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "needs_attention", label: "Needs attention" },
  { value: "recall_due", label: "Recall due" },
  { value: "balance_due", label: "Balance due" },
  { value: "recent_visit", label: "Recent visit" },
];
const FILTER_LABEL = Object.fromEntries(FILTERS.map((f) => [f.value, f.label])) as Record<PatientFilter, string>;
const SORTS: Record<PatientSort, string> = { name: "Name", last_visit: "Last visit", balance: "Balance" };

/** Search, filter, sort and page live in the URL, like the calendar's date and view (DESIGN_SYSTEM §9). */
function useListPlace() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const query = PatientListQuery.parse(Object.fromEntries(params));
  const set = (next: Partial<PatientListQuery>) => {
    const merged = { ...query, page: 1, ...next }; // anything but paging starts again at page 1
    const q = new URLSearchParams();
    if (merged.q) q.set("q", merged.q);
    if (merged.filter !== "all") q.set("filter", merged.filter);
    if (merged.sort !== "name") q.set("sort", merged.sort);
    if (merged.page > 1) q.set("page", String(merged.page));
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return { query, set };
}

function Avatar({ p }: { p: PatientSummary }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand">
      {initials(p.firstName, p.lastName)}
    </span>
  );
}

function Alerts({ p }: { p: PatientSummary }) {
  const alerts = alertsOf(p);
  if (!alerts.length) return <span className="text-ink-muted">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-alert-line bg-alert-bg px-2 py-0.5 text-xs font-medium text-alert">
      <AlertTriangleIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{alerts.join(", ")}</span>
    </span>
  );
}

const CHIP = "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

/** Siblings share a guardian (by phone) and usually a surname: the classic wrong-patient mix-up. */
function SiblingChip({ names }: { names: string[] }) {
  if (!names.length) return null;
  return (
    <span className={cn(CHIP, "border-info-line bg-info-bg text-info")}>
      <UsersIcon className="size-3 shrink-0" aria-hidden />
      Sibling of {names.join(", ")}
    </span>
  );
}

/** Computed labels (domain/patient-list.ts), each with an icon and a word. Never the brown clinical-alert style. */
function FlagChips({ p }: { p: PatientSummary }) {
  return (
    <>
      {p.flags.recallDue && (
        <span className={cn(CHIP, "border-info-line bg-info-bg text-info")}>
          <CalendarClockIcon className="size-3 shrink-0" aria-hidden /> Recall due{p.recallDueOn && ` · ${formatDate(p.recallDueOn)}`}
        </span>
      )}
      {p.flags.balanceDue && (
        <span className={cn(CHIP, "border-warning-line bg-warning-bg text-warning")}>
          <ReceiptIcon className="size-3 shrink-0" aria-hidden /> Balance due
        </span>
      )}
      {p.flags.noContact && (
        <span className={cn(CHIP, "border-warning-line bg-warning-bg text-warning")} title="The last text to this family failed">
          <PhoneOffIcon className="size-3 shrink-0" aria-hidden /> No contact
        </span>
      )}
    </>
  );
}

const hasChips = (p: PatientSummary) =>
  alertsOf(p).length > 0 || p.siblings.length > 0 || p.flags.recallDue || p.flags.balanceDue || p.flags.noContact;

export function PatientList() {
  const { query, set } = useListPlace();
  const canContact = useCan()("patients.contact"); // phone numbers are searchable only for those who see them
  // Typed text is local, so the caret never jumps while the URL catches up.
  const [search, setSearch] = useState(query.q);
  const { data, isLoading, error, refetch, isRefetching, isPlaceholderData } = usePatientPage(query);
  const rows = data?.rows ?? [];
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? from + rows.length - 1 : 0;
  const onSearch = (q: string) => {
    setSearch(q);
    set({ q });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        description={data ? `${data.counts.all} patients` : undefined}
        actions={
          <Can permission="patients.write">
            <Button asChild>
              <Link href="/patients/new">
                <PlusIcon /> New patient
              </Link>
            </Button>
          </Can>
        }
      />

      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative w-full max-w-md">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input
              type="search"
              aria-label="Search patients"
              placeholder={canContact ? "Search by child, guardian or phone" : "Search by child or guardian"}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="bg-surface pl-9"
            />
          </div>
          <Select value={query.sort} onValueChange={(v) => set({ sort: v as PatientSort })}>
            <SelectTrigger aria-label="Sort by" className="w-full bg-surface sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(SORTS).map(([v, label]) => (
                <SelectItem key={v} value={v}>
                  Sort by {label.toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* One strip on phones that scrolls inside itself, so the page never scrolls sideways. */}
        <div role="group" aria-label="Show" className="scroll-fade-x -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={query.filter === f.value ? "default" : "outline"}
              aria-pressed={query.filter === f.value}
              className="shrink-0 rounded-full"
              onClick={() => set({ filter: f.value })}
            >
              {f.label}
              {data && <span className="tabular-nums opacity-80">{data.counts[f.value]}</span>}
            </Button>
          ))}
        </div>
      </div>

      <p className="sr-only" role="status">
        {data && (query.q || query.filter !== "all") ? `${data.total} ${data.total === 1 ? "patient matches" : "patients match"}` : ""}
      </p>

      {error && <ErrorState what="the patients" onRetry={() => refetch()} retrying={isRefetching} />}
      {isLoading && <Loading label="Loading patients…" />}

      {data && rows.length === 0 &&
        (query.q ? (
          <EmptyState
            icon={SearchIcon}
            title={`No patients match “${query.q}”`}
            action={
              <Button variant="outline" onClick={() => onSearch("")}>
                Clear search
              </Button>
            }
          >
            Try part of the child&apos;s name, the guardian&apos;s name, or a phone number.
          </EmptyState>
        ) : query.filter !== "all" ? (
          <EmptyState
            icon={FilterIcon}
            title={`No patients with “${FILTER_LABEL[query.filter]}”`}
            action={
              <Button variant="outline" onClick={() => set({ filter: "all" })}>
                Show all
              </Button>
            }
          >
            Nobody needs this right now.
          </EmptyState>
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="No patients yet"
            action={
              <Can permission="patients.write">
                <Button asChild>
                  <Link href="/patients/new">
                    <PlusIcon /> New patient
                  </Link>
                </Button>
              </Can>
            }
          >
            Add your first patient to start charting and booking.
          </EmptyState>
        ))}

      {rows.length > 0 && (
        <>
          {/* Phone and tablet: one card per patient. */}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:hidden">
            {rows.map((p) => (
              <li key={p.id}>
                <Link href={`/patients/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-ground">
                  <Avatar p={p} />
                  <div className="min-w-0 flex-1 space-y-1">
                    {/* A surname is never cut off (patient identification); age and phone don't wrap. */}
                    <p className="flex flex-wrap gap-x-1.5 font-medium">
                      <span className="break-words">
                        {p.lastName}, {p.firstName}
                      </span>
                      <span className="shrink-0 font-normal text-ink-muted tabular-nums">{formatAge(p.birthDate)}</span>
                    </p>
                    <p className="flex gap-1.5 text-sm text-ink-muted">
                      <span className="truncate">{p.guardianName}</span>
                      {p.guardianPhone && <span className="shrink-0 tabular-nums">{formatPhone(p.guardianPhone)}</span>}
                    </p>
                    <p className="flex flex-wrap gap-x-3 text-sm text-ink-muted">
                      <span className="whitespace-nowrap">{p.lastVisitOn ? `Last visit ${formatDate(p.lastVisitOn)}` : "No visits yet"}</span>
                      {!!p.balance && <span className="whitespace-nowrap tabular-nums">Owes {formatPeso(p.balance)}</span>}
                    </p>
                    {hasChips(p) && (
                      <div className="flex flex-wrap gap-1.5">
                        {alertsOf(p).length > 0 && <Alerts p={p} />}
                        <SiblingChip names={p.siblings} />
                        <FlagChips p={p} />
                      </div>
                    )}
                  </div>
                  <ChevronRightIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: a table. The name is the link; the whole row is clickable through it. */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card lg:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-ground/60 text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Primary guardian</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Last visit</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Balance</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Alerts</th>
                  <th scope="col" className="w-10"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((p) => (
                  <tr key={p.id} className="group relative hover:bg-ground/70">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar p={p} />
                        <div className="min-w-0 space-y-1">
                          <Link
                            href={`/patients/${p.id}`}
                            className="font-medium text-ink outline-none after:absolute after:inset-0 group-hover:text-brand focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                          >
                            {p.lastName}, {p.firstName}
                          </Link>
                          {(p.siblings.length > 0 || p.flags.recallDue || p.flags.balanceDue || p.flags.noContact) && (
                            <div className="flex flex-wrap gap-1.5">
                              <SiblingChip names={p.siblings} />
                              <FlagChips p={p} />
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatAge(p.birthDate)}</td>
                    <td className="px-4 py-2.5">
                      <p>{p.guardianName}</p>
                      {p.guardianPhone && <p className="whitespace-nowrap text-ink-muted tabular-nums">{formatPhone(p.guardianPhone)}</p>}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">
                      {p.lastVisitOn ? formatDate(p.lastVisitOn) : <span className="text-ink-muted">None yet</span>}
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap tabular-nums">
                      {p.balance ? formatPeso(p.balance) : <span className="text-ink-muted">—</span>}
                    </td>
                    <td className="max-w-64 px-4 py-2.5"><Alerts p={p} /></td>
                    <td className="pr-4 text-right">
                      <ChevronRightIcon className="inline size-4 text-ink-muted group-hover:text-brand" aria-hidden />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data && (
            <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-ink-muted tabular-nums">
                {data.total > data.pageSize ? `Showing ${from}–${to} of ${data.total}` : `Showing all ${data.total}`}
              </p>
              {data.total > data.pageSize && (
                <div className="flex gap-2">
                  <Button variant="outline" disabled={data.page === 1 || isPlaceholderData} onClick={() => set({ page: data.page - 1 })}>
                    Previous
                  </Button>
                  <Button variant="outline" disabled={to >= data.total || isPlaceholderData} onClick={() => set({ page: data.page + 1 })}>
                    Next
                  </Button>
                </div>
              )}
            </nav>
          )}
        </>
      )}
    </div>
  );
}
