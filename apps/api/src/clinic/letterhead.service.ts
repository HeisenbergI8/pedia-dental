import { BadRequestException, ConflictException, Injectable, PayloadTooLargeException } from "@nestjs/common";
import {
  LETTERHEAD_IMAGE_RULES, LetterheadSettings, STANDARD_LETTERHEAD, TIER_LIMITS, UpdateLetterheadInput, featureMessage, imageProblem,
  letterheadProblem, type Tier,
} from "@pedia/shared";
import type { Request } from "express";
import { z } from "zod";
import { Clock } from "../common/clock";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { OutboxService } from "../outbox/outbox.service";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { readUpload, tooLargeToRead } from "../storage/multipart";
import { StorageService, type StoredFile } from "../storage/storage.service";
import { lockAccount, ownClinicId } from "./account-lock";
import { NO_LETTERHEAD_FILE, letterheadImageProblem } from "./letterhead";

type Row = {
  mode: LetterheadSettings["mode"]; tagline: string | null; listBranches: boolean; socialLinks: unknown;
  dentistLine: string | null; footerNote: string | null; imageKey: string | null; imageUpdatedAt: Date | null;
};

/** A row as LetterheadSettings: the key stays here (the image is GET /clinic/letterhead/image). No row: the standard one. */
const toSettings = (row: Row | null): LetterheadSettings =>
  !row ? STANDARD_LETTERHEAD : LetterheadSettings.parse({
    mode: row.mode, tagline: row.tagline, listBranches: row.listBranches, socialLinks: z.array(z.string()).parse(row.socialLinks),
    dentistLine: row.dentistLine, footerNote: row.footerNote, imageUpdatedAt: row.imageUpdatedAt?.toISOString() ?? null,
  });

const TOO_LARGE = imageProblem(LETTERHEAD_IMAGE_RULES, { type: LETTERHEAD_IMAGE_RULES.types[0]!, size: LETTERHEAD_IMAGE_RULES.maxBytes + 1 })!;

/**
 * D11: the clinic's custom letterhead (features/clinic/mocks.ts, `/clinic/letterhead*`). The only reader and writer of
 * ClinicLetterhead. Clinic and Pro customise it; any plan may go back to standard (decision 22). The image is stored
 * like the logo, in area "branding" and the StoredFile ledger, so it counts toward the plan's storage (decision 24).
 * Every write takes the account lock first (lockAccount), so it runs after a plan change, not beside it.
 */
@Injectable()
export class LetterheadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
  ) {}

  /** GET /clinic/letterhead: every staff member reads it (documents need it). */
  async view(): Promise<LetterheadSettings> {
    return toSettings(await this.prisma.clinicLetterhead.findFirst());
  }

  /** PUT /clinic/letterhead: the mode and the text lines. Keeps any stored image. Parsed here, after nothing: the mock's order. */
  async save(body: unknown): Promise<LetterheadSettings> {
    const parsed = UpdateLetterheadInput.safeParse(body);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
    const input = parsed.data;
    return runInTransaction(this.prisma, async (tx) => {
      const refused = letterheadProblem(await this.lockedTier(tx), input);
      if (refused) throw new ConflictException(refused);
      const current = await tx.clinicLetterhead.findFirst();
      if (input.mode === "image" && !current?.imageKey) throw new BadRequestException("Upload the letterhead image first");
      const row = await tx.clinicLetterhead.upsert({
        where: { clinicId: ownClinicId() },
        create: { ...clinicData(), ...input },
        update: input,
      });
      return toSettings(row);
    });
  }

  /** GET /clinic/letterhead/image: a 5-minute private link to the image, or undefined (404) when there is none. */
  /**
   * GET /clinic/letterhead/image: the file itself, streamed like the logo, never a 302 to S3. The PDF draws it into a
   * canvas, and a cross-origin image would taint the canvas and drop the letterhead from the PDF (CONVENTIONS → Traps).
   */
  async imageFile(): Promise<StoredFile | undefined> {
    const row = await this.prisma.clinicLetterhead.findFirst({ select: { imageKey: true } });
    return row?.imageKey ? this.storage.get(row.imageKey) : undefined;
  }

  /**
   * PUT /clinic/letterhead/image (multipart `file`), in the mock's order: the plan, the file, the plan's storage (in
   * StorageService.putFile, under the lock). Then the row points at it with mode "image", and the old image goes.
   */
  async uploadImage(req: Request): Promise<LetterheadSettings> {
    const tier = await this.tier();
    if (!TIER_LIMITS[tier].customLetterhead) throw new ConflictException(featureMessage(tier, "customLetterhead"));
    if (tooLargeToRead(req.headers, LETTERHEAD_IMAGE_RULES.maxBytes)) throw new PayloadTooLargeException(TOO_LARGE); // E13
    const upload = await readUpload(req, { maxBytes: LETTERHEAD_IMAGE_RULES.maxBytes });
    try {
      const { file } = upload;
      if (!file) throw new BadRequestException(NO_LETTERHEAD_FILE);
      const checked = letterheadImageProblem(file);
      if ("problem" in checked) throw checked.status === 413 ? new PayloadTooLargeException(checked.problem) : new BadRequestException(checked.problem);
      // Stored before the transaction: runInTransaction reruns its callback on a deadlock (CONVENTIONS → Traps).
      const key = await this.storage.putFile("branding", checked.ext, file);
      return await this.storage.keepIf(key, () => runInTransaction(this.prisma, async (tx) => {
        const now = await this.lockedTier(tx); // a downgrade may have landed since the first check
        if (!TIER_LIMITS[now].customLetterhead) throw new ConflictException(featureMessage(now, "customLetterhead"));
        const current = await tx.clinicLetterhead.findFirst({ select: { imageKey: true } });
        const image = { mode: "image" as const, imageKey: key, imageUpdatedAt: this.clock.now() };
        const row = await tx.clinicLetterhead.upsert({
          where: { clinicId: ownClinicId() },
          create: { ...clinicData(), ...STANDARD_LETTERHEAD, ...image },
          update: image,
        });
        if (current?.imageKey) await this.forget(tx, current.imageKey);
        return toSettings(row);
      }));
    } finally {
      await upload.dispose();
    }
  }

  /** DELETE /clinic/letterhead/image: any plan (decision 22). Back to standard if the image was in use. */
  async removeImage(): Promise<LetterheadSettings> {
    return runInTransaction(this.prisma, async (tx) => {
      await lockAccount(tx);
      const current = await tx.clinicLetterhead.findFirst();
      if (!current) return STANDARD_LETTERHEAD;
      const row = await tx.clinicLetterhead.update({
        where: { clinicId: current.clinicId },
        data: { mode: current.mode === "image" ? "standard" : current.mode, imageKey: null, imageUpdatedAt: null },
      });
      if (current.imageKey) await this.forget(tx, current.imageKey);
      return toSettings(row);
    });
  }

  /**
   * An image nothing points at any more: out of the ledger now, so the plan's storage frees at once (the mock's
   * forgetStored), and the file deleted once this commits (Decision 9). The outbox's delete finds no ledger row left.
   */
  private async forget(tx: Tx, key: string): Promise<void> {
    await tx.storedFile.deleteMany({ where: { key } });
    await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key } });
  }

  private async tier(): Promise<Tier> {
    return (await this.prisma.clinicAccount.findUniqueOrThrow({ where: { id: ownClinicId() }, select: { tier: true } })).tier;
  }

  private async lockedTier(tx: Tx): Promise<Tier> {
    const id = await lockAccount(tx);
    return (await tx.clinicAccount.findUniqueOrThrow({ where: { id }, select: { tier: true } })).tier;
  }
}
