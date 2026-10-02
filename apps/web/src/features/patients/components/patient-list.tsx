"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePatients } from "../api";
import { formatAge } from "../age";

export function PatientList() {
  const [search, setSearch] = useState("");
  const { data, isLoading, error } = usePatients(search);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold">Patients</h1>
          <Button asChild>
            <Link href="/patients/new">New patient</Link>
          </Button>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="patient-search" className="text-ink-muted">Search by name</Label>
          <Input
            id="patient-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 bg-white"
          />
        </div>
      </div>

      {error && <p className="text-danger">Couldn&apos;t load patients. Refresh to try again.</p>}

      <div className="overflow-x-auto rounded-lg border border-line bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line text-ink-muted">
            <tr>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Age</th>
              <th className="px-4 py-3 font-medium">Guardian</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Alerts</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-muted">Loading patients…</td>
              </tr>
            )}
            {data?.map((p) => {
              const guardian = p.guardians.find((g) => g.isPrimary) ?? p.guardians[0];
              const alerts = [...p.allergies, ...p.medicalConditions, ...p.alerts];
              return (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-ground">
                  <td className="px-4 py-3">
                    <Link href={`/patients/${p.id}`} className="font-medium text-brand underline-offset-2 hover:underline">
                      {p.lastName}, {p.firstName}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatAge(p.birthDate)}</td>
                  <td className="px-4 py-3">{guardian?.fullName}</td>
                  <td className="px-4 py-3">{guardian?.phone}</td>
                  <td className="px-4 py-3">
                    {alerts.length > 0 && (
                      <span className="rounded bg-alert-bg px-2 py-1 text-xs font-medium text-alert">
                        {alerts.join(", ")}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
            {data?.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-muted">No patients match “{search}”.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
