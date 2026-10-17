import { Controller, Get, HttpCode, Param, Post, Req } from "@nestjs/common";
import type { PortalAccess } from "@pedia/shared";
import type { Request } from "express";
import { identityOf } from "../auth/access.guard";
import { viewerOf } from "../patients/patient.views";
import { PortalService } from "./portal.service";

/** features/portal/mocks.ts, staff routes. Rules: access-rules.ts (portal.manage: front desk, the Owner, admins). */
@Controller("patients/:id")
export class PortalAccessController {
  constructor(private readonly portal: PortalService) {}

  @Get("portal-access")
  access(@Param("id") id: string): Promise<PortalAccess[]> {
    return this.portal.access(id);
  }

  @Post("guardians/:guardianId/portal-invite")
  @HttpCode(200)
  invite(@Req() req: Request, @Param("id") id: string, @Param("guardianId") guardianId: string): Promise<PortalAccess> {
    return this.portal.invite(viewerOf(identityOf(req)!), id, guardianId);
  }

  @Post("guardians/:guardianId/portal-off")
  @HttpCode(200)
  turnOff(@Param("id") id: string, @Param("guardianId") guardianId: string): Promise<PortalAccess> {
    return this.portal.turnOff(id, guardianId);
  }
}
