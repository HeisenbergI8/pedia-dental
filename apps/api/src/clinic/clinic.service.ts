import { BadRequestException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import {
  Branch, Chair, ClinicContext, Procedure, StaffRole, holdsRole, isActiveStaff,
  type ClinicAccount, type ClinicUsage, type Role, type StaffMember, type UpdateBrandingInput, type UpdateClinicProfileInput,
} from "@pedia/shared";
import type { ClinicIdentity } from "../auth/identity.service";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { StorageService, type StoredFile } from "../storage/storage.service";
import { lockAccount, ownClinicId } from "./account-lock";
import { brandingRefusal, logoUrlOf, toClinicAccount, toStaffMember } from "./clinic.views";
import { countUsage, usageOf } from "./limits";
import { cleanLogo, isDemoLogo, type LogoUpload } from "./logo";

/** The clinic account's reads (features/clinic/mocks.ts). Tenant reads are scoped by the extension; ClinicAccount by the identity's clinic. */
@Injectable()
export class ClinicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
  ) {}

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
  /** Is `id` an active login of this clinic holding the dentist role (visits/mocks.ts)? In the caller's transaction. */
  async isActiveDentist(id: string, tx: Tx = this.prisma): Promise<boolean> {
    const s = await tx.staff.findUnique({ where: { id }, select: { role: true, alsoRoles: true, deactivatedAt: true } });
    if (!s) return false; // another clinic's id reads as missing (tenant extension)
    const alsoRoles = StaffRole.array().parse(s.alsoRoles);
    return holdsRole({ role: s.role, alsoRoles }, "dentist") && isActiveStaff({ deactivatedAt: s.deactivatedAt?.toISOString() });
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

  /** GET /clinic/usage (Owner only): open branches and active logins against the tier. No lock: the write it informs checks again under it. */
  async usage(): Promise<ClinicUsage> {
    const { tier } = await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: ownClinicId() }, select: { tier: true } });
    return usageOf(tier, await countUsage(this.prisma));
  }

  /** PUT /clinic: name, contact email and TIN (decision #18). Tier and status are the operator's (B12). */
  async updateProfile(input: UpdateClinicProfileInput): Promise<ClinicAccount> {
    return toClinicAccount(await this.prisma.clinicAccount.update({ where: { id: ownClinicId() }, data: input }));
  }

  /** PUT /clinic/branding: a colour below AA is refused with the nearest that passes; `headingFont: null` unsets it. */
  async updateBranding({ brandColor, headingFont }: UpdateBrandingInput): Promise<ClinicAccount> {
    const refused = brandingRefusal(brandColor);
    if (refused) throw new BadRequestException(refused);
    return toClinicAccount(await this.prisma.clinicAccount.update({ where: { id: ownClinicId() }, data: { brandColor, headingFont } }));
  }

  /** GET /clinic/logo: the uploaded file. Undefined for no logo or a seeded one (a static file the web serves). */
  async logoFile(): Promise<StoredFile | undefined> {
    const { logoRef } = await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: ownClinicId() }, select: { logoRef: true } });
    return logoRef && !isDemoLogo(logoRef) ? this.storage.get(logoRef) : undefined;
  }

  /** PUT /clinic/logo (multipart `file`): checked and sanitised (cleanLogo), stored, then swapped in. */
  async uploadLogo(file: LogoUpload | undefined): Promise<ClinicAccount> {
    if (!file) throw new BadRequestException("Attach the logo file");
    const clean = cleanLogo(file);
    if ("problem" in clean) throw clean.status === 413 ? new PayloadTooLargeException(clean.problem) : new BadRequestException(clean.problem);
    // Stored before the transaction: runInTransaction reruns its callback on a deadlock (CONVENTIONS → Traps).
    return this.swapLogo(await this.storage.put("branding", clean.ext, clean.body));
  }

  /** DELETE /clinic/logo: back to the name in the heading font (decision #31). A seeded logo is just unlinked. */
  removeLogo(): Promise<ClinicAccount> {
    return this.swapLogo(null);
  }

  /** Points the account at `key`, and queues the old uploaded file's deletion in the same transaction (Decision 9). */
  private swapLogo(key: string | null): Promise<ClinicAccount> {
    return runInTransaction(this.prisma, async (tx) => {
      const id = await lockAccount(tx);
      const { logoRef: old } = await tx.clinicAccount.findUniqueOrThrow({ where: { id }, select: { logoRef: true } });
      const row = await tx.clinicAccount.update({ where: { id }, data: { logoRef: key } });
      if (old && old !== key && !isDemoLogo(old)) await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key: old } });
      return toClinicAccount(row);
    });
  }
}
