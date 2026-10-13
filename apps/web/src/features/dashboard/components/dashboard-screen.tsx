"use client";
import { format } from "date-fns";
import { Can } from "@/features/auth/access";
import { useReportBranch } from "../api";
import { BranchFilter } from "./branch-filter";
import { FinanceDashboard } from "./finance-dashboard";
import { TodayGlance } from "./today-glance";

/**
 * Today for every staff role; the money below it for whoever holds dashboard.view (admin). On Mid and Big, one
 * branch filter above both (decision #20), so Today and Finance never show different branches.
 */
export function DashboardScreen() {
  const now = new Date();
  const today = format(now, "yyyy-MM-dd");
  const { filter, value, branch, choose } = useReportBranch();
  return (
    <div className="space-y-5">
      {filter && <BranchFilter id="dashboard-branch" filter={filter} value={value} onChange={choose} />}
      <TodayGlance today={today} now={now} branch={branch} />
      <Can permission="dashboard.view">
        <FinanceDashboard today={today} branch={branch} />
      </Can>
    </div>
  );
}
