"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { useCreatePatient, usePatient, useUpdatePatient } from "../api";
import { PatientForm } from "./patient-form";
import { Loading } from "@/components/brand";

export function CreatePatient() {
  const router = useRouter();
  const create = useCreatePatient();
  return (
    <div className="space-y-5">
      <PageHeader title="New patient" description="Fields are required unless marked optional." />
      <PatientForm
        submitLabel="Create patient"
        cancelHref="/patients"
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
  if (isLoading || !patient) return <Loading label="Loading patient…" />;

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Edit profile</h2>
      <PatientForm
        defaultValues={patient}
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
