import { Controller, ForbiddenException, Get, Req } from "@nestjs/common";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { requireContext } from "../common/request-context";
import { ClinicService } from "./clinic.service";

/** GET /clinic, /branches, /staff: clinic.view (access-rules.ts), so the guard has loaded a live identity by now. */
@Controller()
export class ClinicController {
  constructor(private readonly clinic: ClinicService) {}

  @Get("clinic")
  context(@Req() req: Request) {
    const { branchId } = requireContext();
    // A login with no open branch fails closed (B2b's Issues Found); B3's archive flow keeps it from happening.
    if (!branchId) throw new ForbiddenException("You have no open branch to work at. Contact your clinic's Owner.");
    return this.clinic.context(identityOf(req)!, branchId);
  }

  @Get("branches")
  branches() {
    return this.clinic.branches();
  }

  @Get("staff")
  staff() {
    return this.clinic.staff(requireContext().user!.roles);
  }
}
