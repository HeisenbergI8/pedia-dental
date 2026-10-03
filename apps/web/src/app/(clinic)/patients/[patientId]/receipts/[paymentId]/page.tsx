import { Receipt } from "@/features/billing/components/receipt";
import { PatientHeader } from "@/features/patients/components/patient-header";

export default async function ReceiptPage({ params }: { params: Promise<{ patientId: string; paymentId: string }> }) {
  const { patientId, paymentId } = await params;
  return (
    <div className="space-y-5">
      {/* Alerts stay on screen (CONVENTIONS); the printed receipt for the parent leaves them out. */}
      <div className="print:hidden">
        <PatientHeader patientId={patientId} />
      </div>
      <Receipt patientId={patientId} paymentId={paymentId} />
    </div>
  );
}
