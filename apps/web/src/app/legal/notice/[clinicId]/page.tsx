import type { Metadata } from "next";
import { ClinicNotice } from "@/features/legal/components/clinic-notice";

export const metadata: Metadata = { title: "Privacy notice" };

export default async function Page({ params }: { params: Promise<{ clinicId: string }> }) {
  const { clinicId } = await params;
  return <ClinicNotice clinicId={clinicId} />;
}
