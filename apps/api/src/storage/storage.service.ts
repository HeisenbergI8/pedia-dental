import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { ConflictException, Injectable } from "@nestjs/common";
import { FILE_LINK_SECONDS, storageRefusal } from "@pedia/shared";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { TenantScopeError, clinicData } from "../prisma/tenant-scope";
import { runInTransaction, type Tx } from "../prisma/transaction";
import { lockAccount } from "../clinic/account-lock";
import { CONTENT_TYPES, clinicKey, type FileExtension, FileStorage, parseKey, type StorageArea } from "./storage";

export type StoredFile = { body: Buffer; contentType: string };
/** A checked upload waiting on this instance's disk (readUpload, E1). */
export type CheckedFile = { path: string; bytes: number };

/**
 * A clinic's files. Every key is built here from the request's clinic and every read checks it, so another clinic's
 * key reads as missing, and gets no link: no difference from "absent" (B10 decision 3). The only writer of files and
 * of the StoredFile ledger (E5), so the ledger is exact whoever stores what.
 */
@Injectable()
export class StorageService {
  constructor(
    private readonly files: FileStorage,
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
  ) {}

  /** A new file of this clinic from memory (the logo, B3). Returns its key. */
  async put(area: StorageArea, ext: FileExtension, body: Buffer): Promise<string> {
    return this.store(area, ext, body, body.length);
  }

  /** A new file of this clinic from a checked upload's temp file: streamed to the driver, never read whole (E1). */
  async putFile(area: StorageArea, ext: FileExtension, file: CheckedFile): Promise<string> {
    return this.store(area, ext, createReadStream(file.path), file.bytes);
  }

  /** A private link to one of this clinic's files, valid FILE_LINK_SECONDS; undefined for any other key (E8). */
  async link(key: string, { fileName, download = false }: { fileName: string; download?: boolean }): Promise<string | undefined> {
    const parts = this.own(key);
    if (!parts) return undefined;
    return this.files.link(key, { contentType: CONTENT_TYPES[parts.ext], fileName, download, expiresInSeconds: FILE_LINK_SECONDS });
  }

  /**
   * Runs the write that points at a just-stored file; if it fails, the file is removed so nothing unreferenced stays
   * stored or counted (B10 tester D2). The removal is best effort: the error that matters is the write's.
   */
  async keepIf<T>(key: string, write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      await this.delete(key).catch(() => undefined);
      throw error;
    }
  }

  async get(key: string): Promise<StoredFile | undefined> {
    const parts = this.own(key);
    const body = parts && (await this.files.get(key));
    return parts && body ? { body, contentType: CONTENT_TYPES[parts.ext] } : undefined;
  }

  async delete(key: string): Promise<void> {
    if (!this.own(key)) return;
    await this.files.delete(key);
    await this.prisma.storedFile.deleteMany({ where: { key } }); // after the file: a crash between leaves an over-count the retry clears
  }

  /** This clinic's stored bytes (decision 8; B12 decision 1 limits them). Pass the transaction's client under the lock. */
  async usedBytes(db: Pick<Tx, "storedFile"> = this.prisma): Promise<number> {
    const { _sum } = await db.storedFile.aggregate({ _sum: { bytes: true } });
    return _sum.bytes ?? 0;
  }

  /**
   * B12 E8: the ledger row first, under the clinic's lock, so the plan's storage (decision 1) is checked and counted in
   * one step: parallel uploads can't both pass the last free bytes. Then the file; if storing it fails, the row goes.
   * A crash between the two leaves an over-count, never an uncounted file.
   */
  private async store(area: StorageArea, ext: FileExtension, body: Buffer | Readable, bytes: number): Promise<string> {
    const key = clinicKey(this.clinicId(), area, randomUUID(), ext);
    await runInTransaction(this.prisma, async (tx) => {
      const clinicId = await lockAccount(tx);
      const { tier } = await tx.clinicAccount.findUniqueOrThrow({ where: { id: clinicId }, select: { tier: true } });
      const refused = storageRefusal(tier, await this.usedBytes(tx), bytes);
      if (refused) throw new ConflictException(refused);
      await tx.storedFile.create({ data: { ...clinicData(), key, area, bytes, createdAt: this.clock.now() }, select: { id: true } });
    });
    try {
      await this.files.put(key, body, { contentType: CONTENT_TYPES[ext], bytes });
    } catch (error) {
      await this.prisma.storedFile.deleteMany({ where: { key } }).catch(() => undefined);
      throw error;
    }
    return key;
  }

  private own(key: string) {
    const parts = parseKey(key);
    return parts?.clinicId === this.clinicId() ? parts : undefined;
  }

  private clinicId(): string {
    const { clinicId } = requireContext();
    if (!clinicId) throw new TenantScopeError("Clinic files need a clinic in the request context, and there is none.");
    return clinicId;
  }
}
