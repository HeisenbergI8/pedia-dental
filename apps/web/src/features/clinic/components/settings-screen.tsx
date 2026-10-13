"use client";
import { PageHeader } from "@/components/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/features/auth/access";
import { BranchesPanel } from "./branches-panel";
import { BrandingForm } from "./branding-form";
import { ClinicProfileForm } from "./clinic-profile-form";
import { ClinicSettings } from "./clinic-settings";
import { PlanPanel } from "./plan-panel";
import { PrivacyNoticeForm } from "./privacy-notice-form";
import { StaffPanel } from "./staff-panel";

const TABS = [
  ["clinic", "Clinic"],
  ["branches", "Branches"],
  ["staff", "Staff"],
  ["plan", "Plan"],
  ["reference", "Procedures and chairs"],
] as const;

/** The Owner runs the account here (decision #11). Everyone else sees the clinic's reference data, as before. */
export function SettingsScreen() {
  const can = useCan();
  if (!can("clinic.manage")) return <ClinicSettings />;
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your clinic's details and look, its branches and staff logins, and your Primolar plan." />
      <Tabs defaultValue="clinic">
        {/* Five tabs don't fit a phone: the strip scrolls rather than wraps, with the edge fade. */}
        <div className="scroll-fade-x overflow-x-auto border-b border-line">
          <TabsList variant="line" className="h-13 w-max gap-1 px-0 py-2">
            {TABS.map(([value, label]) => (
              <TabsTrigger key={value} value={value} className="h-9 flex-none px-3.5">
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="clinic" className="space-y-6 pt-4">
          <ClinicProfileForm />
          <BrandingForm />
          <PrivacyNoticeForm />
        </TabsContent>
        <TabsContent value="branches" className="pt-4"><BranchesPanel /></TabsContent>
        <TabsContent value="staff" className="pt-4"><StaffPanel /></TabsContent>
        <TabsContent value="plan" className="pt-4"><PlanPanel /></TabsContent>
        <TabsContent value="reference" className="pt-4"><ClinicSettings embedded /></TabsContent>
      </Tabs>
    </div>
  );
}
