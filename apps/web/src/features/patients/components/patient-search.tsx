"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { CalendarDaysIcon, SearchIcon, TriangleAlertIcon } from "lucide-react";
import type { PatientView } from "@pedia/shared";
import { Loading } from "@/components/brand";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useCan } from "@/features/auth/access";
import { MetaLine } from "@/components/meta-line";
import { formatDate, formatPhone, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { usePatients } from "../api";
import { formatAge } from "../age";

const alertsOf = (p: PatientView) => [...p.allergies, ...p.medicalConditions, ...p.alerts];

/**
 * Find a patient from anywhere: ⌘K / Ctrl-K, or the search button in the shell. Each result shows two
 * identifiers (name + age and date of birth) and the alerts, so the wrong child isn't opened.
 */
export function PatientSearch({ variant }: { variant: "field" | "icon" | "rail" }) {
  const canContact = useCan()("patients.contact"); // phone search: admin and front desk only
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      {variant === "field" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex h-(--control-h) w-full items-center gap-2 rounded-md border border-input bg-surface px-3 text-sm text-ink-muted transition-colors duration-(--duration-fast) hover:border-brand focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <SearchIcon className="size-4" aria-hidden />
          <span className="flex-1 text-left">Find a patient</span>
          <kbd className="rounded border border-line px-1.5 text-xs">⌘K</kbd>
        </button>
      ) : variant === "rail" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium text-ink-muted hover:bg-ground hover:text-ink focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <SearchIcon className="size-5" aria-hidden />
          Search
        </button>
      ) : (
        <Button variant="ghost" size="icon" aria-label="Find a patient" onClick={() => setOpen(true)}>
          <SearchIcon className="size-5" />
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="gap-3 sm:top-24 sm:max-w-xl sm:translate-y-0">
          <DialogTitle>Find a patient</DialogTitle>
          <DialogDescription>{canContact ? "Search by child, guardian or phone number." : "Search by child or guardian name."}</DialogDescription>
          {open && <SearchBody onDone={() => setOpen(false)} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function SearchBody({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim());
  const { data = [], isLoading, error, refetch, isRefetching } = usePatients(query);
  const canContact = useCan()("patients.contact"); // guardian phones: admin and front desk only
  const results = query ? data.slice(0, 8) : [];
  const go = (href: string) => {
    onDone();
    router.push(href);
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          type="search"
          autoFocus
          aria-label="Search patients"
          placeholder={canContact ? "e.g. Cruz, Ana, or 0917…" : "e.g. Cruz or Ana"}
          className="pl-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && results[0]) go(`/patients/${results[0].id}`);
          }}
        />
      </div>

      {!query ? (
        <Link
          href="/appointments"
          onClick={onDone}
          className="flex min-h-(--control-h) items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-ground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <CalendarDaysIcon className="size-4 text-brand" aria-hidden />
          Today&apos;s appointments
        </Link>
      ) : isLoading ? (
        <Loading label="Searching patients…" rows={2} />
      ) : error ? (
        <ErrorState compact what="patients" onRetry={() => refetch()} retrying={isRefetching} />
      ) : results.length === 0 ? (
        <p className="px-1 py-4 text-sm text-ink-muted">No patient matches &ldquo;{query}&rdquo;. Check the spelling{canContact ? ", or search by a guardian's phone" : ""}.</p>
      ) : (
        <ul aria-label="Matching patients" className="-mx-2 space-y-0.5">
          {results.map((p) => {
            const guardian = p.guardians.find((g) => g.isPrimary) ?? p.guardians[0];
            const alerts = alertsOf(p);
            return (
              <li key={p.id}>
                <Link
                  href={`/patients/${p.id}`}
                  onClick={onDone}
                  className="flex items-start gap-3 rounded-lg px-2 py-2.5 hover:bg-ground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand">
                    {initials(p.firstName, p.lastName)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">
                      {p.lastName}, {p.firstName}
                    </span>
                    <MetaLine
                      items={[
                        formatAge(p.birthDate),
                        `born ${formatDate(p.birthDate)}`,
                        guardian && (canContact && guardian.phone ? `${guardian.fullName} ${formatPhone(guardian.phone)}` : guardian.fullName),
                      ]}
                    />
                    {alerts.length > 0 && (
                      <span className={cn("mt-1 inline-flex items-center gap-1 rounded-full border border-alert-line bg-alert-bg px-2 py-0.5 text-xs font-medium text-alert")}>
                        <TriangleAlertIcon className="size-3" aria-hidden />
                        {alerts.join(", ")}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
