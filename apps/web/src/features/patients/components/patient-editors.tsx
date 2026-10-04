"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertTriangleIcon } from "lucide-react";
import { toast } from "sonner";
import { CreatePatientInput, type DuplicateMatch } from "@pedia/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCan } from "@/features/auth/access";
import { formatDate } from "@/lib/format";
import { useCheckDuplicates, useCreatePatient, usePatient, useUpdatePatient } from "../api";
import { PatientForm, type PatientFormValues } from "./patient-form";
import { Loading } from "@/components/brand";

export function CreatePatient() {
  const router = useRouter();
  const create = useCreatePatient();
  const check = useCheckDuplicates();
  const [pending, setPending] = useState<{ input: CreatePatientInput; matches: DuplicateMatch[] }>();

  const save = (input: CreatePatientInput) =>
    create.mutate(input, {
      onSuccess: (p) => {
        toast.success(`${p.firstName} ${p.lastName} added`);
        router.push(`/patients/${p.id}`);
      },
      onError: (e) => toast.error(e.message),
    });

  async function submit(values: PatientFormValues) {
    // A new patient is always validated by the strict schema (hideContacts is off), so this parse only narrows the type.
    const input = CreatePatientInput.parse(values);
    // If the check itself fails, don't block registration: create, as before this check existed.
    const matches = await check.mutateAsync(input).catch(() => []);
    if (matches.length) setPending({ input, matches });
    else save(input);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="New patient" description="Fields are required unless marked optional." />
      <PatientForm submitLabel="Create patient" cancelHref="/patients" pending={create.isPending || check.isPending} onSubmit={submit} />
      {/* A warning, not a block: a re-registered child is a duplicate, twins are not, and front desk decides. */}
      <Dialog open={!!pending} onOpenChange={(open) => !open && setPending(undefined)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangleIcon className="size-5 text-warning" aria-hidden /> This child may already be registered
            </DialogTitle>
            <DialogDescription>Same name and date of birth as:</DialogDescription>
          </DialogHeader>
          <ul className="space-y-2">
            {pending?.matches.map((m) => (
              <li key={m.id}>
                <Link href={`/patients/${m.id}`} className="font-medium text-brand underline underline-offset-2">
                  {m.firstName} {m.lastName}
                </Link>
                <span className="block text-sm text-ink-muted tabular-nums">
                  {m.patientNo} · born {formatDate(m.birthDate)}
                </span>
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(undefined)}>
              Go back and check
            </Button>
            <Button disabled={create.isPending} onClick={() => pending && save(pending.input)}>
              Create anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function EditPatient({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { data: patient, isLoading } = usePatient(patientId);
  const update = useUpdatePatient(patientId);
  const canContact = useCan()("patients.contact");
  if (isLoading || !patient) return <Loading label="Loading patient…" />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Edit profile</h2>
      <PatientForm
        defaultValues={patient}
        hideContacts={!canContact}
        submitLabel="Save changes"
        cancelHref={`/patients/${patientId}`}
        pending={update.isPending}
        onSubmit={(input) =>
          update.mutate(input, {
            onSuccess: () => {
              toast.success("Patient updated");
              router.push(`/patients/${patientId}`);
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </div>
  );
}
