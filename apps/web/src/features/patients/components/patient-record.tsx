"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { ApiError } from "@/lib/api-client";
import { BillingTab } from "@/features/billing/components/billing-tab";
import { ChartTab } from "@/features/chart/components/chart-tab";
import { DocumentsTab } from "@/features/documents/components/documents-tab";
import { GrowthCard } from "@/features/growth/components/growth-card";
import { PlanTab } from "@/features/plan/components/plan-tab";
import { BehaviorTrend } from "@/features/notes/components/behavior-trend";
import { NotesTab } from "@/features/notes/components/notes-tab";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PatientAppointments } from "@/features/appointments/components/patient-appointments";
import { PhotosTab } from "@/features/photos/components/photos-tab";
import { VisitBanner } from "@/features/visits/components/visit-banner";
import { VisitList } from "@/features/visits/components/visit-list";
import { usePatient } from "../api";
import { PatientOverview } from "./patient-overview";

const TAB_TRIGGER = "h-9 flex-none px-3.5";

const TABS = ["overview", "chart", "notes", "plan", "photos", "billing", "documents"] as const;
type Tab = (typeof TABS)[number];

const LABEL: Record<Tab, string> = {
  overview: "Overview",
  chart: "Chart",
  notes: "Notes",
  plan: "Plan",
  photos: "Photos",
  billing: "Billing",
  documents: "Documents",
};
/** Phone grouping: every section one tap away in a labelled picker, never hidden off the side of a strip. */
const GROUPS: { label: string; tabs: Tab[] }[] = [
  { label: "Record", tabs: ["overview"] },
  { label: "Clinical", tabs: ["chart", "notes", "plan", "photos"] },
  { label: "Admin", tabs: ["billing", "documents"] },
];

/** The open tab lives in the URL (?tab=chart), so refresh, back and a shared link land on it. */
function useTab() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const tab: Tab = TABS.includes(raw as Tab) ? (raw as Tab) : "overview";
  const setTab = (next: string) => {
    const q = new URLSearchParams(params);
    if (next === "overview") q.delete("tab");
    else q.set("tab", next);
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return [tab, setTab] as const;
}

export function PatientRecord({ patientId }: { patientId: string }) {
  const { data: patient, error, refetch, isRefetching } = usePatient(patientId);
  const [tab, setTab] = useTab();
  const strip = useRef<HTMLDivElement>(null);
  // A tab opened from a link may sit off screen in a narrow tablet's scrolling strip: bring it into view.
  // Only the strip scrolls: scrollIntoView would also move the page.
  useEffect(() => {
    const el = strip.current;
    const active = el?.querySelector<HTMLElement>("[data-state=active]");
    if (!el || !active) return;
    const { left, right } = active.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (left < box.left || right > box.right) el.scrollLeft += left - box.left - 16;
  }, [tab, patient]);
  // A link to a child who isn't in this clinic: say so. Retrying, or checking the connection, would never help.
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title="Patient not found"
        action={
          <Button asChild variant="outline">
            <Link href="/patients">Go to Patients</Link>
          </Button>
        }
      >
        The link may be mistyped, or the patient isn&apos;t in this clinic.
      </EmptyState>
    );
  }
  if (error) return <ErrorState what="this patient's record" onRetry={() => refetch()} retrying={isRefetching} />;
  if (!patient) return null; // PatientHeader shows the loading state

  return (
    <div className="space-y-5">
      <VisitBanner patientId={patientId} />
      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        {/* Phones: one Section picker, so no section hides off screen. */}
        <div className="flex items-center gap-3 sm:hidden">
          <Label htmlFor="record-section" className="shrink-0">
            Section
          </Label>
          <Select value={tab} onValueChange={setTab}>
            <SelectTrigger id="record-section" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUPS.map((g) => (
                <SelectGroup key={g.label}>
                  <SelectLabel>{g.label}</SelectLabel>
                  {g.tabs.map((t) => (
                    <SelectItem key={t} value={t}>
                      {LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* sm and up: tabs. All seven fit from 640 px; a narrow tablet may still scroll them, with the edge fade. */}
        <div ref={strip} className="scroll-fade-x hidden overflow-x-auto border-b border-line sm:block">
          <TabsList variant="line" className="h-13 w-max gap-1 px-0 py-2">
            {TABS.map((t) => (
              <TabsTrigger key={t} value={t} className={TAB_TRIGGER}>
                {LABEL[t]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="overview" className="pt-5">
          {/* Side by side only from 1280px; below that the reference column would be too narrow. */}
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="space-y-5 xl:col-span-2">
              <PatientAppointments patientId={patientId} restricted={!!patient?.restrictedAt} />
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
