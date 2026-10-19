import { createHash } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Injectable } from "@nestjs/common";
import { type AccountStatus, type Subscription, subscriptionStatus } from "@pedia/shared";
import { Clock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { Prisma } from "../generated/prisma/client.ts";
import { OperatorAuditService } from "../operator-audit/operator-audit.service";
import { OutboxService } from "../outbox/outbox.service";
import { MODEL_SCOPE } from "../prisma/model-scope";
import { PrismaService } from "../prisma/prisma.service";
import { runInTransaction } from "../prisma/transaction";
import { DELETE_FILE } from "../storage/delete-file.handler";
import { StorageService } from "../storage/storage.service";
import { SubscriptionRecordsService } from "../subscription-records/subscription-records.service";
import { RETENTION_SCHEDULE } from "./retention-schedule";

type Model = Prisma.ModelName;
type Operator = { id: string; name: string };
/** A refusal or a usage error: its message is the operator's to read. Anything else prints its name only (a Prisma error quotes data). */
export class ClinicDataRefusal extends Error {}

const fieldsOf = (model: Model): Record<string, string> => (Prisma as unknown as Record<string, Record<string, string>>)[`${model}ScalarFieldEnum`]!;
const MODELS = Object.keys(MODEL_SCOPE).sort() as Model[];

/** D9: the clinic's own tables, minus the system's (StoredFile, IdempotencyKey). Total by construction. */
export const EXPORT_MODELS: readonly Model[] = MODELS.filter((m) => MODEL_SCOPE[m] === "clinic" && RETENTION_SCHEDULE[m].holds !== "system");
/** D12: Primolar's own records about the clinic (its books, its agreements, how it signed up). Kept by a purge. */
export const KEEP_ON_PURGE: readonly Model[] = ["Agreement", "PaymentReceipt", "Signup", "Subscription", "SubscriptionPayment"];
/** D12: every table holding this clinic's rows, but Primolar's. Total by construction (a clinicId column decides). */
export const PURGE_MODELS: readonly Model[] = MODELS.filter((m) => "clinicId" in fieldsOf(m) && !KEEP_ON_PURGE.includes(m));

/**
 * D11: why a purge can't run now, or undefined. Order: the typed name, the subscription, the account. Nothing is said
 * about the clinic's data in a refusal; it never deletes anything.
 */
export function purgeRefusal(account: { name: string; status: AccountStatus }, sub: Pick<Subscription, "anchor" | "paidMonths" | "cancelledAt"> | undefined, typedName: string, today: string): string | undefined {
  if (typedName.trim() !== account.name.trim()) return "The name typed after --confirm isn't this clinic's name on its account. Nothing was deleted.";
  if (!sub || subscriptionStatus(sub, today).state !== "ended") return "This clinic's subscription hasn't ended (cancelled, and its paid month over). Nothing was deleted.";
  if (account.status !== "suspended") return "Pause this clinic's account in the console first. Nothing was deleted.";
  return undefined;
}

/**
 * B13c2b-2: the operator's clinic data scripts (prisma/clinic-data.ts, runbooks/clinic-data-return.md). API-only:
 * no route. Each run is written to the operator trail with the operator named on the command line.
 */
@Injectable()
export class ClinicDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly subscriptions: SubscriptionRecordsService,
    private readonly trail: OperatorAuditService,
  ) {}

  /**
   * D9: `<dir>/tables/<Model>.jsonl` (one row per line), `<dir>/files/<key>`, `<dir>/account.json`, `<dir>/manifest.json`
   * (counts, files missing from storage) and `<dir>/SHA256SUMS` (`sha256sum -c` format). Refuses a non-empty directory.
   */
  async export(clinicId: string, dir: string, operator: Operator) {
    const account = await this.account(clinicId);
    await mkdir(dir, { recursive: true });
    if ((await readdir(dir)).length) throw new ClinicDataRefusal(`${dir} isn't empty. Give the export an empty directory.`);
    const sums: string[] = [];
    const write = async (path: string, body: string | Buffer) => {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await writeFile(join(dir, path), body);
      sums.push(`${createHash("sha256").update(body).digest("hex")}  ${path}`);
    };
    const manifest = await requestContext.run({ requestId: `clinic-export:${clinicId}`, clinicId, operator: false }, async () => {
      const rows: Record<string, number> = {};
      for (const model of EXPORT_MODELS) {
        const lines = (await this.allRows(model)).map((row) => JSON.stringify(row));
        rows[model] = lines.length;
        await write(`tables/${model}.jsonl`, lines.length ? `${lines.join("\n")}\n` : "");
      }
      const missing: string[] = [];
      let files = 0;
      for (const key of await this.fileKeys(account.logoRef)) {
        const file = await this.storage.get(key); // undefined for another clinic's or a demo key, or a file already gone
        if (!file) { missing.push(key); continue; }
        await write(`files/${key}`, file.body);
        files++;
      }
      return { clinicId, exportedAt: this.clock.now().toISOString(), operator: operator.name, status: account.status, rows, files, missing };
    });
    await write("account.json", JSON.stringify({ id: clinicId, name: account.name, contactEmail: account.contactEmail, tin: account.tin }, null, 2));
    await write("manifest.json", JSON.stringify(manifest, null, 2));
    await writeFile(join(dir, "SHA256SUMS"), `${sums.join("\n")}\n`);
    const total = Object.values(manifest.rows).reduce((a, b) => a + b, 0);
    await this.trail.recordFor(operator, "export", "Clinic data (export)", `${total} rows, ${manifest.files} files`, clinicId);
    return { dir, rows: total, files: manifest.files, missing: manifest.missing.length };
  }

  /**
   * D11, D12: refused unless the subscription has ended, the account is paused and the name is typed. Files are
   * queued for deletion first (storage.delete outbox rows), then every PURGE_MODELS table is emptied of the clinic's
   * rows, 1,000 at a time, with raw SQL: the second APPEND_ONLY exception (AuditEvent, ChartEntry, Payment… go too).
   * Re-runnable: a crash resumes on the next run; after `purgedAt` it does nothing.
   */
  async purge(clinicId: string, typedName: string, operator: Operator) {
    const account = await this.account(clinicId);
    if (account.purgedAt) return { clinicId, alreadyPurgedAt: account.purgedAt.toISOString() };
    const sub = await this.subscriptions.read(this.prisma, clinicId);
    const refused = purgeRefusal(account, sub, typedName, this.clock.today());
    if (refused) throw new ClinicDataRefusal(refused);
    return requestContext.run({ requestId: `clinic-purge:${clinicId}`, clinicId, operator: false }, async () => {
      const keys = await this.fileKeys(account.logoRef);
      for (let i = 0; i < keys.length; i += 500) {
        await runInTransaction(this.prisma, async (tx) => {
          for (const key of keys.slice(i, i + 500)) await this.outbox.enqueue(tx, { kind: DELETE_FILE, payload: { key } });
        });
      }
      const deleted: Record<string, number> = {};
      for (const model of PURGE_MODELS) deleted[model] = await this.deleteAll(model, clinicId);
      await this.prisma.clinicAccount.update({ where: { id: clinicId }, data: { purgedAt: this.clock.now(), logoRef: null }, select: { id: true } });
      const total = Object.values(deleted).reduce((a, b) => a + b, 0);
      await this.trail.recordFor(operator, "update", "Clinic data (purged)", `${total} rows, ${keys.length} files queued`, clinicId);
      return { clinicId, rows: total, filesQueued: keys.length, deleted };
    });
  }

  private async account(clinicId: string) {
    const account = await this.prisma.clinicAccount.findUnique({
      where: { id: clinicId }, select: { name: true, status: true, contactEmail: true, tin: true, logoRef: true, purgedAt: true },
    });
    if (!account) throw new ClinicDataRefusal(`No clinic account ${clinicId}.`);
    return account;
  }

  /** Every row of one clinic table, through the tenant extension (it adds clinicId), 1,000 at a time by id where there is one. */
  private async allRows(model: Model): Promise<unknown[]> {
    const delegate = (this.prisma as unknown as Record<string, { findMany(args: object): Promise<{ id?: string }[]> }>)[model[0]!.toLowerCase() + model.slice(1)]!;
    if (!("id" in fieldsOf(model))) return delegate.findMany({}); // PatientGuardian, PatientPrivacyConsent, PortalAccount, ReceiptCounter: small, read whole
    const out: unknown[] = [];
    for (let after: string | undefined; ; ) {
      const page = await delegate.findMany({ orderBy: { id: "asc" }, take: 1000, ...(after && { cursor: { id: after }, skip: 1 }) });
      out.push(...page);
      if (page.length < 1000) return out;
      after = page.at(-1)!.id;
    }
  }

  /** The clinic's file keys: the ledger, photos, the patient photos and the logo (pre-B10 keys have no ledger row). In the clinic's context. */
  private async fileKeys(logoRef: string | null): Promise<string[]> {
    const [ledger, photos, patients] = await Promise.all([
      this.prisma.storedFile.findMany({ select: { key: true } }),
      this.prisma.clinicalPhoto.findMany({ select: { fileKey: true } }),
      this.prisma.patient.findMany({ where: { photoRef: { not: null } }, select: { photoRef: true } }),
    ]);
    return [...new Set([...ledger.map((r) => r.key), ...photos.map((r) => r.fileKey), ...patients.map((r) => r.photoRef!), ...(logoRef ? [logoRef] : [])])].sort();
  }

  /** Raw on purpose (D12): the tenant extension refuses deletes on append-only tables. `model` is only ever a PURGE_MODELS name. */
  private async deleteAll(model: Model, clinicId: string): Promise<number> {
    const keepFileDeletes = model === "OutboxMessage" ? Prisma.sql` AND kind <> ${DELETE_FILE}` : Prisma.empty;
    let total = 0;
    for (;;) {
      const n = await this.prisma.$executeRaw`DELETE FROM ${Prisma.raw(`\`${model}\``)} WHERE clinicId = ${clinicId}${keepFileDeletes} LIMIT 1000`;
      total += n;
      if (n < 1000) return total;
    }
  }
}
