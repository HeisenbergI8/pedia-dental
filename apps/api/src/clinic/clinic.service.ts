import { Injectable } from "@nestjs/common";
import { Branch, Chair, ClinicContext, Procedure, type Role, type StaffMember } from "@pedia/shared";
import type { ClinicIdentity } from "../auth/identity.service";
import { PrismaService } from "../prisma/prisma.service";
import { logoUrlOf, toClinicAccount, toStaffMember } from "./clinic.views";

/** The clinic account's reads (features/clinic/mocks.ts). Tenant reads are scoped by the extension; ClinicAccount by the identity's clinic. */
@Injectable()
export class ClinicService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /clinic: the account, the branches this login may use, the device's branch (validated by the guard) and the logo. */
  async context(who: ClinicIdentity, activeBranchId: string): Promise<ClinicContext> {
    const account = toClinicAccount(await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: who.clinicId } }));
    return ClinicContext.parse({ account, branches: who.branches, activeBranchId, logoUrl: logoUrlOf(account.logoRef) });
  }

  /** GET /branches: every branch, archived ones too (decision #22); /clinic lists only the usable ones. */
  async branches(): Promise<Branch[]> {
    return (await this.prisma.branch.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] })).map((b) => Branch.parse(b));
  }

  /** GET /staff: deactivated ones too, so their names stay on what they recorded (decision #23). */
  async staff(viewer: readonly Role[]): Promise<StaffMember[]> {
    return (await this.prisma.staff.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }] })).map((s) => toStaffMember(s, viewer));
  }

  /** GET /chairs: every branch's, archived branches' too, so a chair in a child's history still resolves (useChairs). */
  async chairs(): Promise<Chair[]> {
    const rows = await this.prisma.chair.findMany({ select: { id: true, clinicId: true, branchId: true, name: true }, orderBy: [{ position: "asc" }, { id: "asc" }] });
    return rows.map((c) => Chair.parse(c));
  }

  /** GET /procedures: the catalog in the clinic's order. Fees are centavos. */
  async procedures(): Promise<Procedure[]> {
    const rows = await this.prisma.procedure.findMany({
      select: { clinicId: true, code: true, name: true, defaultDurationMin: true, fee: true, perTooth: true },
      orderBy: [{ position: "asc" }, { code: "asc" }],
    });
    return rows.map((p) => Procedure.parse(p));
  }
}
