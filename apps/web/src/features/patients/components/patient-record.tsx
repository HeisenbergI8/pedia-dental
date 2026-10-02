"use client";
import { ChartTab } from "@/features/chart/components/chart-tab";
import { GrowthCard } from "@/features/growth/components/growth-card";
import { PlanTab } from "@/features/plan/components/plan-tab";
import { BehaviorTrend } from "@/features/notes/components/behavior-trend";
import { NotesTab } from "@/features/notes/components/notes-tab";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientAppointments } from "@/features/appointments/components/patient-appointments";
import { PhotosTab } from "@/features/photos/components/photos-tab";
import { VisitBanner } from "@/features/visits/components/visit-banner";
import { VisitList } from "@/features/visits/components/visit-list";
import { usePatient } from "../api";
import { PatientOverview } from "./patient-overview";

/** Filled in by later chunks: billing (12), documents (16). Photos is done (15). */
const LATER_TABS = ["Photos", "Billing", "Documents"];

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
          <TabsTrigger value="chart">Chart</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="plan">Plan</TabsTrigger>
          {LATER_TABS.map((t) => (
            <TabsTrigger key={t} value={t}>{t}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-6 pt-4">
          <BehaviorTrend patientId={patientId} />
          <VisitList patientId={patientId} />
          <PatientAppointments patientId={patientId} />
          <GrowthCard patient={patient} />
          <PatientOverview patient={patient} />
        </TabsContent>
        <TabsContent value="chart" className="pt-4">
          <ChartTab patient={patient} />
        </TabsContent>
        <TabsContent value="notes" className="pt-4">
          <NotesTab patient={patient} />
        </TabsContent>
        <TabsContent value="plan" className="pt-4">
          <PlanTab patientId={patientId} />
        </TabsContent>
        {LATER_TABS.map((t) => (
          <TabsContent key={t} value={t} className="pt-4">
            {t === "Photos" ? <PhotosTab patientId={patientId} /> : <p className="text-ink-muted">Nothing here yet.</p>}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
