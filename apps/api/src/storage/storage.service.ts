import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Readable } from "node:stream";
import { Injectable } from "@nestjs/common";
import { FILE_LINK_SECONDS } from "@pedia/shared";
import { Clock } from "../common/clock";
import { requireContext } from "../common/request-context";
import { PrismaService } from "../prisma/prisma.service";
import { TenantScopeError, clinicData } from "../prisma/tenant-scope";
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

  async get(key: string): Promise<StoredFile | undefined> {
    const parts = this.own(key);
    const body = parts && (await this.files.get(key));
    return parts && body ? { body, contentType: CONTENT_TYPES[parts.ext] } : undefined;
  }

  async delete(key: string): Promise<void> {
    if (!this.own(key)) return;
    await this.files.delete(key);
    await this.prisma.storedFile.deleteMany({ where: { key } }); // after the file: a crash between leaves an overcount the retry clears
  }

  /** This clinic's stored bytes (decision 8): counted, never limited in B10. */
  async usedBytes(): Promise<number> {
    const { _sum } = await this.prisma.storedFile.aggregate({ _sum: { bytes: true } });
    return _sum.bytes ?? 0;
  }

  private async store(area: StorageArea, ext: FileExtension, body: Buffer | Readable, bytes: number): Promise<string> {
    const key = clinicKey(this.clinicId(), area, randomUUID(), ext);
    await this.files.put(key, body, { contentType: CONTENT_TYPES[ext], bytes });
    await this.prisma.storedFile.create({ data: { ...clinicData(), key, area, bytes, createdAt: this.clock.now() }, select: { id: true } });
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
