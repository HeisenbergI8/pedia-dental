import { Suspense } from "react";
import { PageLoading } from "@/components/brand";
import { PatientList } from "@/features/patients/components/patient-list";

export default function PatientsPage() {
  // The list reads its search, filter, sort and page from the URL.
  return (
    <Suspense fallback={<PageLoading label="Loading patients" />}>
      <PatientList />
    </Suspense>
  );
}
