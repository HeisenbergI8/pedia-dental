import { EditPatient } from "@/features/patients/components/patient-editors";
import { PatientHeader } from "@/features/patients/components/patient-header";

export default async function EditPatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return (
    <div className="space-y-8">
      <PatientHeader patientId={patientId} />
      <EditPatient patientId={patientId} />
    </div>
  );
}
