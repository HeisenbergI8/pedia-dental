"use client";
import { format } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Can } from "@/features/auth/access";
import { FinanceDashboard } from "./finance-dashboard";
import { TodayGlance } from "./today-glance";

/** Today for every staff role; the money below it for whoever holds dashboard.view (admin). */
export function DashboardScreen() {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  return (
    <div className="space-y-5">
      <PageHeader title="Today" description={format(now, "EEEE, d MMMM")} />
      <TodayGlance today={today} />
      <Can permission="dashboard.view">
        <FinanceDashboard today={today} />
      </Can>
    </div>
  );
}
