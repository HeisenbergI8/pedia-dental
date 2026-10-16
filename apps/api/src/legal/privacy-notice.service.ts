import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import type { Tx } from "../prisma/transaction";

/** A clinic's privacy notice (privacy #19): append-only versions, the highest in force. Owns PrivacyNotice from B4. */
@Injectable()
export class PrivacyNoticeService {
  constructor(private readonly prisma: PrismaService) {}

  /** The version in force. Every clinic has version 1 from its seed or creation (P20). */
  async currentVersion(tx: Tx = this.prisma): Promise<number> {
    const n = await tx.privacyNotice.findFirstOrThrow({ orderBy: { version: "desc" }, select: { version: true } });
    return n.version;
  }
}
