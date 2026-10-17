import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { ReportsService } from "./reports.service";

/** features/dashboard/mocks.ts. Rules in access-rules.ts: today.view and dashboard.view (finance). */
@Controller("reports")
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("finance")
  finance(@Req() req: Request, @Query("today") today?: string, @Query("branch") branch?: string) {
    return this.reports.finance(identityOf(req)!, today, branch);
  }

  @Get("today")
  today(@Req() req: Request, @Query("today") today?: string, @Query("branch") branch?: string) {
    return this.reports.today(identityOf(req)!, today, branch);
  }
}
