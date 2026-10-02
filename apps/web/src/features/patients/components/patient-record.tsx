"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VisitBanner } from "@/features/visits/components/visit-banner";
import { VisitList } from "@/features/visits/components/visit-list";
import { usePatient } from "../api";
import { PatientOverview } from "./patient-overview";

/** Filled in by later chunks: chart (5–6), notes (7), plan (9), photos (15), billing (12), documents (16). */
const LATER_TABS = ["Chart", "Notes", "Plan", "Photos", "Billing", "Documents"];

export function PatientRecord({ patientId }: { patientId: string }) {
  const { data: patient, error } = usePatient(patientId);
  if (error) return <p className="text-danger">Couldn&apos;t load this patient. Refresh to try again.</p>;
  if (!patient) return null; // PatientHeader shows the loading state

  return (
    <div className="space-y-4">
      <VisitBanner patientId={patientId} />
      <Tabs defaultValue="overview">
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          {LATER_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-6 pt-4">
          <VisitList patientId={patientId} />
          <PatientOverview patient={patient} />
        </TabsContent>
        {LATER_TABS.map((t) => (
          <TabsContent key={t} value={t} className="pt-4">
            <p className="text-ink-muted">Nothing here yet.</p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
