"use client";
import Link from "next/link";
import { useWatch } from "react-hook-form";
import { AlertTriangleIcon, CheckCircle2Icon, CircleIcon, SearchIcon } from "lucide-react";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useDuplicateMatches } from "../api";
import { requiredProgress } from "../intake";
import type { PatientFormDraft } from "./patient-form";

const SECTIONS = [
  ["child", "Child", "#intake-child"],
  ["guardian", "Guardian", "#intake-guardian"],
  ["medical", "Medical alerts", "#intake-medical"],
] as const;

/** Is this child already registered? Asked as soon as both names and a whole birth date are in. */
function DuplicateStatus({ values, compact }: { values: { firstName?: string; lastName?: string; birthDate?: string }; compact?: boolean }) {
  const { firstName = "", lastName = "", birthDate = "" } = values;
  const ready = !!(firstName.trim() && lastName.trim() && /^\d{4}-\d{2}-\d{2}$/.test(birthDate));
  const check = useDuplicateMatches(ready ? { firstName, lastName, birthDate } : undefined);
  const box = "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm";

  if (!ready) return compact ? null : <p className="px-1 text-sm text-ink-muted">Fill in the name and birth date to check for duplicates.</p>;
  if (check.isFetching || !check.data)
    return (
      <p role="status" className={cn(box, "border-line bg-surface text-ink-muted")}>
        <SearchIcon className="mt-0.5 size-4 shrink-0" aria-hidden /> Checking for duplicates
      </p>
    );
  if (check.data.length === 0)
    return (
      <p role="status" className={cn(box, "border-success-line bg-success-bg text-success")}>
        <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {compact ? "No existing match" : "No other child with this name and birth date"}
      </p>
    );
  return (
    <div role="status" className={cn(box, "border-alert-line bg-alert-bg text-alert")}>
      <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        <p className="font-semibold">May already be registered</p>
        {!compact && (
          <ul className="mt-1 space-y-1">
            {check.data.map((m) => (
              <li key={m.id}>
                <Link href={`/patients/${m.id}`} className="underline underline-offset-2">
                  {m.patientNo} · born {formatDate(m.birthDate)}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Where a new registration stands: the three required sections (done or to do, in words) and the live duplicate
 * check. "rail" sits beside the form on wide screens; "pills" is a row above it on tablets. Phones show neither.
 */
export function IntakeProgress({ variant, contacts }: { variant: "rail" | "pills"; contacts: boolean }) {
  const values = useWatch<PatientFormDraft>();
  const done = requiredProgress(values, contacts);

  if (variant === "pills")
    return (
      <nav aria-label="Form progress" className="hidden flex-wrap items-center gap-2 md:flex lg:hidden">
        {SECTIONS.map(([key, label, href]) => (
          <a key={key} href={href} className="inline-flex min-h-(--control-h-sm) items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-sm font-medium">
            {done[key] ? <CheckCircle2Icon className="size-4 text-success" aria-hidden /> : <CircleIcon className="size-4 text-ink-muted" aria-hidden />}
            {label}
            <span className="sr-only">{done[key] ? ", done" : ", to do"}</span>
          </a>
        ))}
        <DuplicateStatus values={values} compact />
      </nav>
    );

  return (
    <aside aria-label="Form progress" className="sticky top-24 hidden space-y-3 self-start lg:block">
      <nav className="rounded-xl border border-line bg-surface p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold">Required</p>
        <ul>
          {SECTIONS.map(([key, label, href]) => (
            <li key={key}>
              <a href={href} className="flex min-h-9 items-center gap-2 rounded-md text-sm hover:text-brand">
                {done[key] ? <CheckCircle2Icon className="size-4 text-success" aria-hidden /> : <CircleIcon className="size-4 text-ink-muted" aria-hidden />}
                {label}
                <span className="ml-auto text-xs text-ink-muted">{done[key] ? "Done" : "To do"}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <DuplicateStatus values={values} />
    </aside>
  );
}
