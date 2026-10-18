import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from "@nestjs/common";
import {
  CreateAccountInput, DUPLICATE_EMAIL_MESSAGE, GetStartedInput, LEGAL_DOCUMENTS, RECEIPT_RULES, ReceiptUploadInput, SignupInput, SignupStatusView,
  amountDue, duplicateNameMessage, filesDueForDeletion, sameClinicName, SIGNUP_LIMIT_MESSAGE,
  type AgreementRecord, type ConfirmReceiptInput, type RecordUpfrontPaymentInput, type Signup,
} from "@pedia/shared";
import type { Request } from "express";
import { randomInt, randomUUID } from "node:crypto";
import { IdentityService } from "../auth/identity.service";
import { RATE_LIMITS, RateLimitService, bucketOf } from "../auth/rate-limit";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { OutboxService } from "../outbox/outbox.service";
import { PlatformSettingsService } from "../platform-settings/platform-settings.service";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { ALREADY_CHECKED, ReceiptRecordsService } from "../receipt-records/receipt-records.service";
import { deletePlatformFile } from "../storage/delete-file.handler";
import { readImageForm } from "../storage/image-form";
import { PlatformFilesService } from "../storage/platform-files.service";
import { StorageService } from "../storage/storage.service";
import { ClinicFactory, newClinicIds } from "./clinic-factory";
import { brandingRefusal, readSignupForm, type SignupForm } from "./signup-form";
import { toSignup, toSignupRow } from "./signup.rows";

export const SIGNUP_NOT_FOUND = "Sign-up not found";
const REFERENCE_NOT_FOUND = "We can't find a sign-up with that reference. Check it and try again.";
const DECIDED = "This sign-up has already been decided";
/** Billing #24: the upfront payment covers the quoted plan and look, so neither changes after it is recorded. */
export const PAID_PLAN_LOCKED =
  "The setup fee is already recorded for this plan and look. Keep them, or reject the sign-up and ask the clinic to sign up again.";
const RECEIPT_LIMIT_MESSAGE = "Too many receipts from this connection. Try again in an hour.";
const PURGE_BATCH = 100;

const CODE = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L: read aloud over the phone
const code = (n: number) => Array.from({ length: n }, () => CODE[randomInt(CODE.length)]).join("");

/** What approve and a direct creation hand back: the overview is the operator module's to build. */
export type MadeClinic = { clinicId: string; temporaryPassword: string; pin: string };

/**
 * Sign-ups and the clinics made from them (billing #10–#17, B12): the only reader and writer of Signup. Files are
 * Primolar's (platform/signups), stored before each transaction and removed when it refuses. Locks: the platform row
 * (prices, duplicate names), then the sign-up, then whatever the step writes (E6). No path takes a sign-up first.
 */
@Injectable()
export class SignupsService {
  private readonly log = new Logger(SignupsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly settings: PlatformSettingsService,
    private readonly receipts: ReceiptRecordsService,
    private readonly files: PlatformFilesService,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly limits: RateLimitService,
    private readonly identity: IdentityService,
    private readonly factory: ClinicFactory,
  ) {}

  /** The sign-up, locked for the rest of the transaction. 404 for an unknown id. */
  private async lockSignup(tx: Tx, id: string): Promise<Signup> {
    await tx.$queryRaw`SELECT id FROM Signup WHERE id = ${id} FOR UPDATE`;
    const row = id.length <= 191 ? await tx.signup.findUnique({ where: { id } }) : null;
    if (!row) throw new NotFoundException(SIGNUP_NOT_FOUND);
    return toSignup(row);
  }

  private static waiting(s: Signup): void {
    if (s.status !== "waiting") throw new ConflictException(DECIDED);
  }

  /**
   * Billing #10, A11: the name or contact email is already a clinic's, or a waiting sign-up's. `exceptId`: the sign-up
   * being fixed or approved. Read under the platform lock, so two requests can't both find a name free.
   */
  private async duplicateOf(tx: Tx, account: { name: string; contactEmail: string }, exceptId?: string): Promise<string | undefined> {
    const clinics = await tx.clinicAccount.findMany({ select: { name: true, contactEmail: true } });
    const waiting = await tx.signup.findMany({ where: { status: "waiting", ...(exceptId && { id: { not: exceptId } }) }, select: { name: true, contactEmail: true } });
    const taken = [...clinics, ...waiting];
    if (taken.some((a) => sameClinicName(a.name, account.name))) return duplicateNameMessage(account.name);
    const email = account.contactEmail.trim().toLowerCase();
    if (taken.some((a) => a.contactEmail.toLowerCase() === email)) return DUPLICATE_EMAIL_MESSAGE;
    return undefined;
  }

  /** `PRM-7KQ2-M9XD`, unique among sign-ups (checked under the platform lock; the unique index is the backstop). */
  private async newReference(tx: Tx): Promise<string> {
    for (;;) {
      const reference = `PRM-${code(4)}-${code(4)}`;
      if (!(await tx.signup.findUnique({ where: { reference }, select: { id: true } }))) return reference;
    }
  }

  /** A form's files, stored under platform keys before the transaction: the logo for Use my own, images for Design it for me. */
  private async storeFiles<T extends { branding: { choice: string } }>(form: SignupForm<T>): Promise<{ logoKey?: string; referenceKeys: string[] }> {
    const logoKey = form.logo && form.data.branding.choice !== "default" ? await this.files.put("signups", form.logo.ext, form.logo.body) : undefined;
    const referenceKeys = form.data.branding.choice === "designed" ? await Promise.all(form.references.map((f) => this.files.putFile("signups", f.ext, f))) : [];
    return { logoKey, referenceKeys };
  }

  /** The new waiting sign-up (A2: quoted from today's list). The caller holds the platform lock and checked duplicates. */
  private async insert(tx: Tx, input: SignupInput, source: Signup["source"], agreement: AgreementRecord, files: { logoKey?: string; referenceKeys: string[] }): Promise<Signup> {
    const signup: Signup = {
      account: input.account, branch: input.branch, owner: input.owner, branding: input.branding,
      id: randomUUID(), reference: await this.newReference(tx), source, submittedAt: this.clock.now().toISOString(),
      ...(input.branding.choice === "own" && files.logoKey ? { logoRef: files.logoKey } : {}),
      referenceRefs: files.referenceKeys,
      quote: amountDue(await this.settings.prices(tx), input.account.tier, input.branding.choice),
      status: "waiting", agreement,
    };
    await tx.signup.create({ data: toSignupRow(signup), select: { id: true } });
    return signup;
  }

  private agreement(acceptedBy: string, signedOn?: string): AgreementRecord {
    const { terms, dpa } = LEGAL_DOCUMENTS;
    return { termsVersion: terms.version, dpaVersion: dpa.version, acceptedBy, at: this.clock.now().toISOString(), ...(signedOn ? { method: "on_file", signedOn } : { method: "online" }) };
  }

  /** POST /signups (billing #10, #11; B12 decision 14): counted before the form is read, every attempt. */
  async submit(req: Request): Promise<SignupStatusView> {
    const { allowed } = await this.limits.hitRolling(bucketOf("signup", req.ip ?? "unknown"), RATE_LIMITS.signup);
    if (!allowed) throw new HttpException(SIGNUP_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    const form = await readSignupForm(req, GetStartedInput); // privacy #7: refused (400) without the acceptance
    try {
      const { acceptTerms: _, ...input } = form.data;
      const refused = brandingRefusal(input.branding, !!form.logo);
      if (refused) throw new BadRequestException(refused);
      const stored = await this.storeFiles(form);
      const signup = await this.files.keepIf([stored.logoKey, ...stored.referenceKeys], () =>
        runInTransaction(this.prisma, async (tx) => {
          await this.settings.lockPlatform(tx);
          const clash = await this.duplicateOf(tx, input.account);
          if (clash) throw new ConflictException(clash);
          return this.insert(tx, input, "form", this.agreement(input.owner.fullName), stored); // P4: accepted online
        }),
      );
      return this.statusView(signup);
    } finally {
      await form.dispose();
    }
  }

  /** A1: what the client may see about their own sign-up. */
  private async statusView(s: Signup): Promise<SignupStatusView> {
    return SignupStatusView.parse({
      reference: s.reference, clinicName: s.account.name, tier: s.account.tier, branding: s.branding.choice, quote: s.quote,
      status: s.status, paid: !!s.payment, rejectionReason: s.rejection?.reason ?? null,
      receipt: await this.receipts.latestFor({ kind: "signup", signupId: s.id }),
      paymentQr: await this.settings.qr(),
    });
  }

  /** A form sign-up by its reference (trimmed, any case). Console-made ones have no client page. */
  private async byReference(reference: string): Promise<Signup> {
    const ref = reference.trim().toUpperCase();
    const row = ref.length === 13 ? await this.prisma.signup.findUnique({ where: { reference: ref } }) : null;
    if (!row || row.source !== "form") throw new NotFoundException(REFERENCE_NOT_FOUND);
    return toSignup(row);
  }

  /** GET /signups/:reference (A1). */
  async status(reference: string): Promise<SignupStatusView> {
    return this.statusView(await this.byReference(reference));
  }

  /** GET /operator/signups: every state, newest first (A3: the console filters). */
  async list(): Promise<Signup[]> {
    return (await this.prisma.signup.findMany({ orderBy: [{ submittedAt: "desc" }, { id: "desc" }] })).map(toSignup);
  }

  /** GET /operator/signups/:id/files/:key: a link to the logo or a reference image this sign-up holds. */
  async fileLink(id: string, key: string): Promise<string> {
    const row = id.length <= 191 ? await this.prisma.signup.findUnique({ where: { id } }) : null;
    if (!row) throw new NotFoundException(SIGNUP_NOT_FOUND);
    const s = toSignup(row);
    const link = key === s.logoRef || s.referenceRefs.includes(key) ? await this.files.link(key, { fileName: "signup-file" }) : undefined;
    if (!link) throw new NotFoundException("That file isn't part of this sign-up");
    return link;
  }

  /**
   * PUT /operator/signups/:id (billing #13, A2): corrections; a plan or look change re-quotes at today's prices, refused
   * once the payment is recorded. Replaced files are deleted after commit (the outbox).
   */
  async fix(id: string, req: Request): Promise<Signup> {
    const form = await readSignupForm(req, SignupInput);
    try {
      const stored = await this.storeFiles(form);
      return await this.files.keepIf([stored.logoKey, ...stored.referenceKeys], () =>
        runInTransaction(this.prisma, async (tx) => {
          await this.settings.lockPlatform(tx);
          const s = await this.lockSignup(tx, id);
          SignupsService.waiting(s);
          const input = form.data;
          const refused = brandingRefusal(input.branding, !!form.logo || !!s.logoRef);
          if (refused) throw new BadRequestException(refused);
          const clash = await this.duplicateOf(tx, input.account, s.id);
          if (clash) throw new ConflictException(clash);
          const requote = input.account.tier !== s.account.tier || input.branding.choice !== s.branding.choice;
          if (requote && s.payment) throw new ConflictException(PAID_PLAN_LOCKED);
          const replaced = [stored.logoKey && s.logoRef, ...(stored.referenceKeys.length ? s.referenceRefs : [])].filter((k): k is string => !!k);
          const next: Signup = {
            ...s, account: input.account, branch: input.branch, owner: input.owner, branding: input.branding,
            ...(requote && { quote: amountDue(await this.settings.prices(tx), input.account.tier, input.branding.choice) }),
            ...(stored.logoKey && { logoRef: stored.logoKey }),
            ...(stored.referenceKeys.length && { referenceRefs: stored.referenceKeys }),
          };
          await tx.signup.update({ where: { id }, data: toSignupRow(next), select: { id: true } });
          for (const key of replaced) await this.outbox.enqueue(tx, deletePlatformFile(key));
          return next;
        }),
      );
    } finally {
      await form.dispose();
    }
  }

  /** POST /operator/signups/:id/payment (billing #24, A4): the whole quoted total, in one payment, marked by hand. Once. */
  async recordPayment(id: string, input: RecordUpfrontPaymentInput): Promise<Signup> {
    return runInTransaction(this.prisma, async (tx) => {
      const s = await this.lockSignup(tx, id);
      SignupsService.waiting(s);
      if (s.payment) throw new ConflictException("The setup fee is already recorded");
      const next: Signup = { ...s, payment: { ...input, amount: s.quote.total, recordedAt: this.clock.now().toISOString() } };
      await tx.signup.update({ where: { id }, data: toSignupRow(next), select: { id: true } });
      return next;
    });
  }

  /** POST /operator/signups/:id/reject (billing #13, #14): the reason as written; its waiting receipt is answered too. */
  async reject(id: string, reason: string): Promise<Signup> {
    return runInTransaction(this.prisma, async (tx) => {
      const s = await this.lockSignup(tx, id);
      SignupsService.waiting(s);
      const next: Signup = { ...s, status: "rejected", rejection: { reason, at: this.clock.now().toISOString() } };
      await tx.signup.update({ where: { id }, data: toSignupRow(next), select: { id: true } });
      await this.receipts.rejectPendingOf(tx, { kind: "signup", signupId: id }, "The sign-up was rejected");
      return next;
    });
  }

  /** POST /operator/signups/:id/approve (billing #12, #15): only once paid, and only if the name and email are still free. */
  async approve(id: string): Promise<MadeClinic> {
    return this.make(async (tx) => {
      const s = await this.lockSignup(tx, id);
      SignupsService.waiting(s);
      if (!s.payment) throw new ConflictException("Record the setup fee before approving");
      const clash = await this.duplicateOf(tx, s.account, s.id);
      if (clash) throw new ConflictException(clash);
      return s;
    });
  }

  /**
   * POST /operator/accounts (billing #16, A5): a clinic signed up by phone or in person. The public form's checks, then
   * an approved console sign-up with its payment and the signed copy on file (privacy #8), and the clinic.
   */
  async createDirect(req: Request): Promise<MadeClinic> {
    const form = await readSignupForm(req, CreateAccountInput);
    try {
      const { payment, signedOn, signedOnFile: _, ...input } = form.data;
      const refused = brandingRefusal(input.branding, !!form.logo);
      if (refused) throw new BadRequestException(refused);
      const stored = await this.storeFiles(form);
      return await this.files.keepIf([stored.logoKey, ...stored.referenceKeys], () =>
        this.make(async (tx) => {
          const clash = await this.duplicateOf(tx, input.account); // also stops a double-click making two copies
          if (clash) throw new ConflictException(clash);
          const s = await this.insert(tx, input, "console", this.agreement(input.owner.fullName, signedOn), stored);
          const paid: Signup = { ...s, payment: { ...payment, amount: s.quote.total, recordedAt: this.clock.now().toISOString() } };
          await tx.signup.update({ where: { id: s.id }, data: toSignupRow(paid), select: { id: true } });
          return paid;
        }),
      );
    } finally {
      await form.dispose();
    }
  }

  /**
   * The clinic in one transaction (Step 6.3): ids and the Owner's secrets first (argon2 is slow), then the platform
   * lock → the sign-up (`pick`) → every new row, in the new clinic's context. The logo copy follows the commit (E7).
   */
  private async make(pick: (tx: Tx) => Promise<Signup>): Promise<MadeClinic> {
    const ids = newClinicIds();
    const secrets = await this.identity.newStaffSecrets();
    const signup = await requestContext.within({ clinicId: ids.clinicId }, () =>
      runInTransaction(this.prisma, async (tx) => {
        await this.settings.lockPlatform(tx);
        const s = await pick(tx);
        await this.factory.write(tx, s, ids, secrets);
        return s;
      }),
    );
    if (signup.branding.choice === "own" && signup.logoRef) {
      await this.copyLogo(ids.clinicId, signup.logoRef).catch((e: unknown) => this.log.warn(`Logo copy for ${ids.clinicId} failed (${e instanceof Error ? e.name : "Error"})`));
    }
    return { clinicId: ids.clinicId, temporaryPassword: secrets.temporaryPassword, pin: secrets.pin };
  }

  /** A copy of the sign-up's logo, kept as the clinic's own file (it counts toward its storage, E8), then linked. */
  private async copyLogo(clinicId: string, logoKey: string): Promise<void> {
    const logo = await this.files.copy(logoKey);
    if (!logo) return;
    await requestContext.within({ clinicId }, async () => {
      const key = await this.storage.put("branding", logo.ext, logo.body);
      await this.storage.keepIf(key, () =>
        runInTransaction(this.prisma, async (tx) => {
          await tx.$queryRaw`SELECT id FROM ClinicAccount WHERE id = ${clinicId} FOR UPDATE`;
          await tx.clinicAccount.update({ where: { id: clinicId }, data: { logoRef: key }, select: { id: true } });
        }),
      );
    });
  }

  /** POST /signups/:reference/receipts (decision 7): the receipt for the whole quote. 10 an hour per address. */
  async addReceipt(reference: string, req: Request): Promise<SignupStatusView> {
    const { allowed } = await this.limits.hitRolling(bucketOf("receipt", req.ip ?? "unknown"), RATE_LIMITS.receipt);
    if (!allowed) throw new HttpException(RECEIPT_LIMIT_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);
    const found = await this.byReference(reference);
    const form = await readImageForm(req, ReceiptUploadInput, RECEIPT_RULES, true);
    try {
      const file = form.file!;
      const key = await this.files.putFile("receipts", file.ext, file);
      await this.files.keepIf([key], () =>
        runInTransaction(this.prisma, async (tx) => {
          const s = await this.lockSignup(tx, found.id);
          SignupsService.waiting(s);
          if (s.payment) throw new ConflictException("Primolar has already confirmed your payment");
          await this.receipts.add(tx, { payer: { kind: "signup", signupId: s.id }, reference: form.data.reference, amountDue: s.quote.total, periodStart: null, fileKey: key, bytes: file.bytes });
        }),
      );
      return this.status(reference);
    } finally {
      await form.dispose();
    }
  }

  /** Decisions 7, 22: the receipt records the setup fee, after which Approve works. Locks: sign-up → receipt. */
  async confirmReceipt(signupId: string, receiptId: string, input: ConfirmReceiptInput): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      const s = await this.lockSignup(tx, signupId);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      SignupsService.waiting(s);
      if (s.payment) throw new ConflictException("The setup fee is already recorded");
      const next: Signup = { ...s, payment: { ...input, reference: receipt.reference, amount: s.quote.total, recordedAt: this.clock.now().toISOString() } };
      await tx.signup.update({ where: { id: signupId }, data: toSignupRow(next), select: { id: true } });
      await this.receipts.decide(tx, receiptId, { status: "confirmed" });
    });
  }

  async rejectReceipt(signupId: string, receiptId: string, reason: string): Promise<void> {
    await runInTransaction(this.prisma, async (tx) => {
      await this.lockSignup(tx, signupId);
      const receipt = await this.receipts.lock(tx, receiptId);
      if (receipt.status !== "pending") throw new ConflictException(ALREADY_CHECKED);
      await this.receipts.decide(tx, receiptId, { status: "rejected", reason });
    });
  }

  /**
   * B12 decision 15 (the daily job): a sign-up rejected at least 30 days ago loses its logo, reference images and receipt
   * images; its record and words stay. One transaction per sign-up; the files go through the outbox after commit.
   */
  async purgeRejectedFiles(): Promise<number> {
    const today = this.clock.today();
    let purged = 0;
    for (;;) {
      const batch = await this.prisma.signup.findMany({
        where: { status: "rejected", filesDeletedAt: null },
        orderBy: [{ rejectedAt: "asc" }, { id: "asc" }],
        take: PURGE_BATCH,
      });
      const due = batch.map(toSignup).filter((s) => filesDueForDeletion(s, today));
      for (const s of due) {
        await runInTransaction(this.prisma, async (tx) => {
          const locked = await this.lockSignup(tx, s.id);
          if (!filesDueForDeletion(locked, today)) return;
          const keys = [...(locked.logoRef ? [locked.logoRef] : []), ...locked.referenceRefs, ...(await this.receipts.forgetFiles(tx, s.id))];
          await tx.signup.update({ where: { id: s.id }, data: { logoKey: null, referenceKeys: [], filesDeletedAt: this.clock.now() }, select: { id: true } });
          for (const key of keys) await this.outbox.enqueue(tx, deletePlatformFile(key));
        });
        purged++;
      }
      // Rejections are read oldest first: once a batch holds one not yet due, every later one is younger.
      if (batch.length < PURGE_BATCH || due.length < batch.length) return purged;
    }
  }
}
