"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreatePatient, usePatient, useUpdatePatient } from "../api";
import { PatientForm } from "./patient-form";

export function CreatePatient() {
  const router = useRouter();
  const create = useCreatePatient();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">New patient</h1>
      <PatientForm
        submitLabel="Create patient"
        pending={create.isPending}
        onSubmit={(input) =>
          create.mutate(input, {
            onSuccess: (p) => {
              toast.success(`${p.firstName} ${p.lastName} added`);
              router.push(`/patients/${p.id}`);
            },
            onError: (e) => toast.error(e.message),
          })
        }
      />
    </div>
  );
}

export function EditPatient({ patientId }: { patientId: string }) {
  const router = useRouter();
  const { data: patient, isLoading } = usePatient(patientId);
  const update = useUpdatePatient(patientId);
  if (isLoading || !patient) return <p className="text-ink-muted">Loading patient…</p>;

  return (
    <PatientForm
      defaultValues={patient}
      submitLabel="Save changes"
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
  );
}
