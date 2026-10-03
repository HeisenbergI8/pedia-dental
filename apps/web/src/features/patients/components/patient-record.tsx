"use client";
import { HammerIcon } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
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

/** Filled in by later chunks: billing (12), documents (16). */
const LATER_TABS = ["Billing", "Documents"];

const TAB_TRIGGER = "h-11 flex-none rounded-none px-3 data-[state=active]:text-brand group-data-[variant=line]/tabs-list:data-[state=active]:after:bg-brand";

export function PatientRecord({ patientId }: { patientId: string }) {
  const { data: patient, error } = usePatient(patientId);
  if (error) return <p className="text-danger">Couldn&apos;t load this patient. Refresh to try again.</p>;
  if (!patient) return null; // PatientHeader shows the loading state

  return (
    <div className="space-y-5">
      <VisitBanner patientId={patientId} />
      <Tabs defaultValue="overview" className="gap-0">
        {/* Scrolls sideways on a phone rather than wrapping into a second row. */}
        <div className="-mx-4 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
          <TabsList variant="line" className="h-11 w-max gap-0 p-0">
            <TabsTrigger value="overview" className={TAB_TRIGGER}>Overview</TabsTrigger>
            <TabsTrigger value="chart" className={TAB_TRIGGER}>Chart</TabsTrigger>
            <TabsTrigger value="notes" className={TAB_TRIGGER}>Notes</TabsTrigger>
            <TabsTrigger value="plan" className={TAB_TRIGGER}>Plan</TabsTrigger>
            <TabsTrigger value="photos" className={TAB_TRIGGER}>Photos</TabsTrigger>
            {LATER_TABS.map((t) => (
              <TabsTrigger key={t} value={t} className={TAB_TRIGGER}>
                {t} <span className="text-xs font-normal text-ink-muted">Soon</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="pt-5">
          {/* Side by side only from 1280px; below that the reference column would be too narrow. */}
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <PatientAppointments patientId={patientId} />
              <VisitList patientId={patientId} />
              <BehaviorTrend patientId={patientId} />
              <GrowthCard patient={patient} />
            </div>
            <PatientOverview patient={patient} />
          </div>
        </TabsContent>
        <TabsContent value="chart" className="pt-5">
          <ChartTab patient={patient} />
        </TabsContent>
        <TabsContent value="notes" className="pt-5">
          <NotesTab patient={patient} />
        </TabsContent>
        <TabsContent value="plan" className="pt-5">
          <PlanTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="photos" className="pt-5">
          <PhotosTab patientId={patientId} />
        </TabsContent>
        {LATER_TABS.map((t) => (
          <TabsContent key={t} value={t} className="pt-5">
            <EmptyState icon={HammerIcon} title={`${t} is coming in a later release`} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
