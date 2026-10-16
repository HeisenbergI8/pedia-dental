import { Injectable, NotFoundException } from "@nestjs/common";
import { PrivacyNoticeView, type SavePrivacyNoticeInput } from "@pedia/shared";
import { AuditService } from "../audit/audit.service";
import { lockAccount } from "../clinic/account-lock";
import { Clock } from "../common/clock";
import { requestContext, requireContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";

const NO_NOTICE = "We can't find that clinic's privacy notice"; // the mock's words (legal/mocks.ts:15)

/** A clinic's privacy notice (privacy #19): append-only versions, the highest in force. Owns PrivacyNotice from B4. */
@Injectable()
export class PrivacyNoticeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly clock: Clock,
  ) {}

  /** The version in force. Every clinic has version 1 from its seed or creation (P20). */
  async currentVersion(tx: Tx = this.prisma): Promise<number> {
    const n = await tx.privacyNotice.findFirstOrThrow({ orderBy: { version: "desc" }, select: { version: true } });
    return n.version;
  }

  /** GET /clinic/privacy-notice: the signed-in clinic's notice in force. */
  ownView(): Promise<PrivacyNoticeView> {
    return this.viewOf(requireContext().clinicId!);
  }

  /**
   * GET /legal/notices/:clinicId (privacy #3), before sign-in: there is no clinic in the request context, so the read
   * runs inside that clinic's (`within`), after checking the account exists. Nothing else of the clinic is read.
   */
  async publicView(clinicId: string): Promise<PrivacyNoticeView> {
    const exists = await this.prisma.clinicAccount.findUnique({ where: { id: clinicId }, select: { id: true } });
    if (!exists) throw new NotFoundException(NO_NOTICE);
    return requestContext.within({ clinicId }, () => this.viewOf(clinicId));
  }

  /** PUT /clinic/privacy-notice: the Owner's edit is a new version (#19, #20), under the clinic's lock. */
  async save(input: SavePrivacyNoticeInput): Promise<PrivacyNoticeView> {
    const { name: savedByName } = requireContext().user!;
    await runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx);
      const version = (await this.currentVersion(tx)) + 1;
      await tx.privacyNotice.create({ data: { ...clinicData(), ...input, version, savedByName, at: this.clock.now() }, select: { id: true } });
      await this.audit.record("update", "Privacy notice", undefined, tx);
    });
    return this.ownView();
  }

  private async viewOf(clinicId: string): Promise<PrivacyNoticeView> {
    const [account, notice] = await Promise.all([
      this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { name: true } }),
      this.prisma.privacyNotice.findFirst({ orderBy: { version: "desc" } }),
    ]);
    if (!notice) throw new NotFoundException(NO_NOTICE);
    const { version, body, contactName, contactEmail, savedByName, at } = notice;
    return PrivacyNoticeView.parse({ version, body, contactName, contactEmail, savedByName, at: at.toISOString(), clinicName: account.name });
  }
}
