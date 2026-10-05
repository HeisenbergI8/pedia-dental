"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangleIcon, HistoryIcon } from "lucide-react";
import { toast } from "sonner";
import { CreatePatientInput, type DuplicateMatch } from "@pedia/shared";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCan, useSession } from "@/features/auth/access";
import { clearDraft, draftKey, readDraft, writeDraft } from "@/lib/form-draft";
import { formatDate } from "@/lib/format";
import { duplicateQuery, useCreatePatient, usePatient, useUpdatePatient } from "../api";
import { splitName } from "../intake";
import { EMPTY_PATIENT, PatientForm, type PatientFormDraft, type PatientFormValues } from "./patient-form";
import { Loading } from "@/components/brand";

export function CreatePatient() {
  const router = useRouter();
  const create = useCreatePatient();
  const qc = useQueryClient();
  const params = useSearchParams();
  // Kept per person, in this tab only (lib/form-draft.ts): an interrupted registration survives a refresh.
  const draft = draftKey("new-patient", useSession()?.user.id ?? "anon");
  // "Register 'Ana Cruz' as a new patient" from booking arrives as ?name=.
  const blank = (): PatientFormDraft => ({ ...EMPTY_PATIENT, ...splitName(params.get("name") ?? "") });
  const [restored, setRestored] = useState(() => readDraft<PatientFormDraft>(draft));
  const [defaults, setDefaults] = useState(() => restored?.values ?? blank());
  const [formKey, setFormKey] = useState(0);
  const keep = useCallback((v: PatientFormDraft) => writeDraft(draft, v), [draft]);
  function startOver() {
    clearDraft(draft);
    setRestored(undefined);
    setDefaults(blank());
    setFormKey((k) => k + 1);
  }
  const [checking, setChecking] = useState(false);
  // `book`: "Save and book appointment", carried through the duplicate warning so "Create anyway" keeps it.
  const [pending, setPending] = useState<{ input: CreatePatientInput; matches: DuplicateMatch[]; book: boolean }>();

  const save = (input: CreatePatientInput, book: boolean) =>
    create.mutate(input, {
      onSuccess: (p) => {
        clearDraft(draft);
        toast.success(`${p.firstName} ${p.lastName} added`);
        router.push(`/patients/${p.id}${book ? "?book=1" : ""}`);
      },
      onError: (e) => toast.error(e.message),
    });

  async function submit(values: PatientFormValues, book: boolean) {
    // A new patient is always validated by the strict schema (hideContacts is off), so this parse only narrows the type.
    const input = CreatePatientInput.parse(values);
    // The live check has usually answered already (same query); if the check itself fails, don't block registration.
    setChecking(true);
    const matches = await qc.fetchQuery(duplicateQuery(input)).catch(() => []);
    setChecking(false);
    if (matches.length) setPending({ input, matches, book });
    else save(input, book);
  }

  return (
    <div className="space-y-5">
      <PageHeader title="New patient" description="The essentials first. Everything under Add now or later can wait for the first visit." />
      {restored && (
        <div role="status" className="flex flex-wrap items-center gap-3 rounded-xl border border-info-line bg-info-bg px-4 py-3 text-sm text-info">
          <HistoryIcon className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">We kept what you typed earlier (saved at {format(parseISO(restored.savedAt), "h:mm a")}).</p>
          <Button variant="outline" size="sm" onClick={startOver}>
            Start over
          </Button>
        </div>
      )}
      <PatientForm
        key={formKey}
        defaultValues={defaults}
        restored={!!restored}
        onValuesChange={keep}
        onDiscard={() => clearDraft(draft)}
        intake
        submitLabel="Save patient"
        cancelHref="/patients"
        pending={create.isPending || checking}
        onSubmit={(v) => submit(v, false)}
        onSubmitAndBook={(v) => submit(v, true)}
      />
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
            <Button disabled={create.isPending} onClick={() => pending && save(pending.input, pending.book)}>
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
  if (isLoading || !patient) return <Loading label="Loading patient" />;

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
