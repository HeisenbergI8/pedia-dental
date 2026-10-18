import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { Injectable } from "@nestjs/common";
import { FILE_LINK_SECONDS } from "@pedia/shared";
import { CONTENT_TYPES, type FileExtension, FileStorage, type PlatformArea, parsePlatformKey, platformKey } from "./storage";
import type { CheckedFile } from "./storage.service";

/**
 * Primolar's own files (B12 E2): sign-up logos and images, receipts, the payment QR. Keys are `platform/<area>/…`, so a
 * clinic's StorageService can never be handed one, nor this one a clinic's. No StoredFile ledger row (a clinic's storage
 * count) and no request clinic: callers decide who may read.
 */
@Injectable()
export class PlatformFilesService {
  constructor(private readonly files: FileStorage) {}

  /** A checked upload's temp file, streamed to the driver. Returns its key. */
  async putFile(area: PlatformArea, ext: FileExtension, file: CheckedFile): Promise<string> {
    const key = platformKey(area, randomUUID(), ext);
    await this.files.put(key, createReadStream(file.path), { contentType: CONTENT_TYPES[ext], bytes: file.bytes });
    return key;
  }

  /** A small file from memory (a sign-up's sanitised logo). */
  async put(area: PlatformArea, ext: FileExtension, body: Buffer): Promise<string> {
    const key = platformKey(area, randomUUID(), ext);
    await this.files.put(key, body, { contentType: CONTENT_TYPES[ext], bytes: body.length });
    return key;
  }

  /** The bytes of a platform file (the approval's logo copy into the new clinic). Undefined for anything else. */
  async copy(key: string): Promise<{ body: Buffer; ext: FileExtension } | undefined> {
    const parts = parsePlatformKey(key);
    const body = parts && (await this.files.get(key));
    return parts && body ? { body, ext: parts.ext } : undefined;
  }

  /** A private link valid FILE_LINK_SECONDS; undefined for a key that isn't a platform key. */
  async link(key: string, { fileName }: { fileName: string }): Promise<string | undefined> {
    const parts = parsePlatformKey(key);
    if (!parts) return undefined;
    return this.files.link(key, { contentType: CONTENT_TYPES[parts.ext], fileName: `${fileName}.${parts.ext}`, download: false, expiresInSeconds: FILE_LINK_SECONDS });
  }

  /** Succeeds when there is no such file; ignores anything that isn't a platform key. */
  async delete(key: string): Promise<void> {
    if (parsePlatformKey(key)) await this.files.delete(key);
  }

  /** Removes a just-stored file when the write that would point at it fails (as StorageService.keepIf). */
  async keepIf<T>(keys: (string | undefined)[], write: () => Promise<T>): Promise<T> {
    try {
      return await write();
    } catch (error) {
      await Promise.all(keys.filter((k): k is string => !!k).map((k) => this.delete(k).catch(() => undefined)));
      throw error;
    }
  }
}
