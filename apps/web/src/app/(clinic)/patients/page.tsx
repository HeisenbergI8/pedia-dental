import { Suspense } from "react";
import { ClinicPageLoading } from "@/features/clinic/components/clinic-logo";
import { PatientList } from "@/features/patients/components/patient-list";

export default function PatientsPage() {
  // The list reads its search, filter, sort and page from the URL.
  return (
    <Suspense fallback={<ClinicPageLoading label="Loading patients" />}>
      <PatientList />
    </Suspense>
  );
}
