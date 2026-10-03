import { PatientHeader } from "@/features/patients/components/patient-header";
import { PatientRecord } from "@/features/patients/components/patient-record";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return (
    <div className="space-y-5">
      <PatientHeader patientId={patientId} />
      <PatientRecord patientId={patientId} />
    </div>
  );
}
