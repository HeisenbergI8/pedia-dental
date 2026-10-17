import { Controller, Get, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { ReportsService } from "./reports.service";

/** The daily collection list (billing/mocks.ts:97–106), a branch-level report: reportBranches, as Today. Rule: billing.collect. */
@Controller()
export class CollectionsController {
  constructor(private readonly reports: ReportsService) {}

  @Get("payments")
  day(@Req() req: Request, @Query("date") date?: string, @Query("branch") branch?: string) {
    return this.reports.collections(identityOf(req)!, date, branch);
  }
}
