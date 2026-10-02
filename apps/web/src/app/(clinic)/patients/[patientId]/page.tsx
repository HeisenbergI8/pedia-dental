import { ComingSoon } from "@/components/coming-soon";
import { PatientHeader } from "@/features/patients/components/patient-header";

export default async function PatientPage({ params }: { params: Promise<{ patientId: string }> }) {
  const { patientId } = await params;
  return (
    <div className="space-y-8">
      <PatientHeader patientId={patientId} />
      <ComingSoon
        title="Patient record"
        covers={[
          "Dental chart (FDI, primary / permanent / mixed)",
          "Clinical notes from templates",
          "Treatment plan and progress",
          "Behavior and growth tracking",
          "Photos and X-rays, before / after",
          "Invoices and payments",
        ]}
      />
    </div>
  );
}
