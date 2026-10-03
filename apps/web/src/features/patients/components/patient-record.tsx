"use client";
import { BillingTab } from "@/features/billing/components/billing-tab";
import { ChartTab } from "@/features/chart/components/chart-tab";
import { DocumentsTab } from "@/features/documents/components/documents-tab";
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
            <TabsTrigger value="billing" className={TAB_TRIGGER}>Billing</TabsTrigger>
            <TabsTrigger value="documents" className={TAB_TRIGGER}>Documents</TabsTrigger>
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
        <TabsContent value="billing" className="pt-5">
          <BillingTab patientId={patientId} />
        </TabsContent>
        <TabsContent value="documents" className="pt-5">
          <DocumentsTab patientId={patientId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
