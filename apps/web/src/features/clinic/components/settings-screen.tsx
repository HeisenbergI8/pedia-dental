"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AuditLog } from "@/features/audit/components/audit-log";
import { PrivacyRequests } from "@/features/privacy-requests/components/privacy-requests";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCan } from "@/features/auth/access";
import { BranchesPanel } from "./branches-panel";
import { BrandingForm } from "./branding-form";
import { ClinicProfileForm } from "./clinic-profile-form";
import { LetterheadCard } from "./letterhead-card";
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
  ["privacy", "Privacy"],
] as const;

type Tab = (typeof TABS)[number][0];

/**
 * The open tab lives in the URL (?tab=plan), so refresh, back and a link such as the billing banner's land on it.
 * `tabs` are the ones this person sees; the first is the default and needs no `?tab=`.
 */
function useTab(tabs: readonly Tab[]) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get("tab");
  const first = tabs[0]!;
  const tab: Tab = tabs.includes(raw as Tab) ? (raw as Tab) : first;
  const setTab = (next: string) => {
    const q = new URLSearchParams(params);
    if (next === first) q.delete("tab");
    else q.set("tab", next);
    router.replace(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };
  return [tab, setTab] as const;
}

const ALL_TABS = TABS.map(([value]) => value);
const STAFF_TABS: readonly Tab[] = ["reference", "privacy"];

/**
 * The Owner runs the account here (decision #11). Everyone else sees the clinic's reference data, as before; an admin
 * (privacy.manage, audit.view) also gets the Privacy tab: the request register and the audit log, as the API allows.
 */
export function SettingsScreen() {
  const can = useCan();
  const owner = can("clinic.manage");
  const privacy = can("privacy.manage");
  const audit = can("audit.view");
  const [tab, setTab] = useTab(owner ? ALL_TABS : STAFF_TABS);
  if (!owner && !privacy && !audit) return <ClinicSettings />;
  if (!owner) {
    return (
      <div className="space-y-5">
        <PageHeader title="Settings" description="The clinic's procedures, staff and chairs, its privacy requests and the audit log. Only the Owner can change the clinic's set-up." />
        <Tabs value={tab} onValueChange={setTab}>
          <div className="scroll-fade-x overflow-x-auto border-b border-line">
            <TabsList variant="line" className="h-13 w-max gap-1 px-0 py-2">
              {TABS.filter(([value]) => STAFF_TABS.includes(value)).map(([value, label]) => (
                <TabsTrigger key={value} value={value} className="h-9 flex-none px-3.5">
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value="reference" className="pt-4"><ClinicSettings embedded /></TabsContent>
          <TabsContent value="privacy" className="space-y-6 pt-4">
            {privacy && <PrivacyRequests />}
            {audit && <AuditLog />}
          </TabsContent>
        </Tabs>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <PageHeader title="Settings" description="Your clinic's details and look, its branches and staff logins, your Primolar plan and the audit log." />
      <Tabs value={tab} onValueChange={setTab}>
        {/* Six tabs don't fit a phone: the strip scrolls rather than wraps, with the edge fade. */}
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
          <LetterheadCard />
          <PrivacyNoticeForm />
        </TabsContent>
        <TabsContent value="branches" className="pt-4"><BranchesPanel /></TabsContent>
        <TabsContent value="staff" className="pt-4"><StaffPanel /></TabsContent>
        <TabsContent value="plan" className="pt-4"><PlanPanel /></TabsContent>
        <TabsContent value="reference" className="pt-4"><ClinicSettings embedded /></TabsContent>
        <TabsContent value="privacy" className="space-y-6 pt-4"><PrivacyRequests /><AuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}
