"use client";
import Link from "next/link";
import { useState } from "react";
import { AlertTriangleIcon, ChevronRightIcon, PlusIcon, SearchIcon, UsersIcon } from "lucide-react";
import type { Patient } from "@pedia/shared";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Can } from "@/features/auth/access";
import { formatPhone, initials } from "@/lib/format";
import { usePatients } from "../api";
import { formatAge } from "../age";

const primaryGuardian = (p: Patient) => p.guardians.find((g) => g.isPrimary) ?? p.guardians[0];
const alertsOf = (p: Patient) => [...p.allergies, ...p.medicalConditions, ...p.alerts];

function Avatar({ p }: { p: Patient }) {
  return (
    <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand">
      {initials(p.firstName, p.lastName)}
    </span>
  );
}

function Alerts({ p }: { p: Patient }) {
  const alerts = alertsOf(p);
  if (!alerts.length) return <span className="text-ink-muted">—</span>;
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-md border border-alert-line bg-alert-bg px-2 py-0.5 text-xs font-medium text-alert">
      <AlertTriangleIcon className="size-3 shrink-0" aria-hidden />
      <span className="truncate">{alerts.join(", ")}</span>
    </span>
  );
}

export function PatientList() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = usePatients(search);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Patients"
        description={data && !search ? `${data.length} patients` : undefined}
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

      <div className="relative max-w-md">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input
          type="search"
          aria-label="Search patients"
          placeholder="Search by child, guardian or phone"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 bg-surface pl-9"
        />
      </div>

      <p className="sr-only" role="status">
        {data && search ? `${data.length} ${data.length === 1 ? "patient matches" : "patients match"}` : ""}
      </p>

      {error && <p className="text-danger">Couldn&apos;t load patients. Refresh to try again.</p>}
      {isLoading && <p className="text-ink-muted">Loading patients…</p>}

      {data?.length === 0 &&
        (search ? (
          <EmptyState
            icon={SearchIcon}
            title={`No patients match “${search}”`}
            action={<Button variant="outline" onClick={() => setSearch("")}>Clear search</Button>}
          >
            Try part of the child&apos;s name, the guardian&apos;s name, or a phone number.
          </EmptyState>
        ) : (
          <EmptyState
            icon={UsersIcon}
            title="No patients yet"
            action={<Can permission="patients.write"><Button asChild><Link href="/patients/new"><PlusIcon /> New patient</Link></Button></Can>}
          >
            Add your first patient to start charting and booking.
          </EmptyState>
        ))}

      {!!data?.length && (
        <>
          {/* Phone: one card per patient. */}
          <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface shadow-card md:hidden">
            {data.map((p) => {
              const g = primaryGuardian(p);
              return (
                <li key={p.id}>
                  <Link href={`/patients/${p.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-ground">
                    <Avatar p={p} />
                    <div className="min-w-0 flex-1 space-y-1">
                      {/* Names may truncate; age and phone never do. */}
                      <p className="flex gap-1.5 font-medium">
                        <span className="truncate">{p.lastName}, {p.firstName}</span>
                        <span className="shrink-0 font-normal text-ink-muted tabular-nums">{formatAge(p.birthDate)}</span>
                      </p>
                      {g && (
                        <p className="flex gap-1.5 text-sm text-ink-muted">
                          <span className="truncate">{g.fullName}</span>
                          <span className="shrink-0 tabular-nums">{formatPhone(g.phone)}</span>
                        </p>
                      )}
                      {alertsOf(p).length > 0 && <Alerts p={p} />}
                    </div>
                    <ChevronRightIcon className="size-4 shrink-0 text-ink-muted" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>

          {/* Tablet and up: a table. The name is the link; the whole row is clickable through it. */}
          <div className="hidden overflow-hidden rounded-xl border border-line bg-surface shadow-card md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-ground/60 text-ink-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">Patient</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Primary guardian</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Alerts</th>
                  <th scope="col" className="w-10"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((p) => {
                  const g = primaryGuardian(p);
                  return (
                    <tr key={p.id} className="group relative hover:bg-ground/70">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <Avatar p={p} />
                          <Link
                            href={`/patients/${p.id}`}
                            className="font-medium text-ink outline-none after:absolute after:inset-0 group-hover:text-brand focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                          >
                            {p.lastName}, {p.firstName}
                          </Link>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap tabular-nums">{formatAge(p.birthDate)}</td>
                      <td className="px-4 py-2.5">
                        {g && (
                          <>
                            <p>{g.fullName}</p>
                            <p className="text-ink-muted tabular-nums">{formatPhone(g.phone)}</p>
                          </>
                        )}
                      </td>
                      <td className="max-w-64 px-4 py-2.5"><Alerts p={p} /></td>
                      <td className="pr-4 text-right">
                        <ChevronRightIcon className="inline size-4 text-ink-muted group-hover:text-brand" aria-hidden />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
