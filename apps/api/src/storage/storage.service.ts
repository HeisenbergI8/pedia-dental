import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { requireContext } from "../common/request-context";
import { TenantScopeError } from "../prisma/tenant-scope";
import { CONTENT_TYPES, clinicKey, type FileExtension, FileStorage, parseKey, type StorageArea } from "./storage";

export type StoredFile = { body: Buffer; contentType: string };

/**
 * A clinic's files. Every key is built here from the request's clinic and every read checks it, so another clinic's
 * key reads as missing: no difference from "absent" (B10's "can't read another's file even with its key"). B3 calls
 * `put` with an already-sanitised logo and keeps the key on the clinic's row.
 */
@Injectable()
export class StorageService {
  constructor(private readonly files: FileStorage) {}

  /** A new file of this clinic. Returns its key. */
  async put(area: StorageArea, ext: FileExtension, body: Buffer): Promise<string> {
    const key = clinicKey(this.clinicId(), area, randomUUID(), ext);
    await this.files.put(key, body);
    return key;
  }

  async get(key: string): Promise<StoredFile | undefined> {
    const parts = this.own(key);
    const body = parts && (await this.files.get(key));
    return parts && body ? { body, contentType: CONTENT_TYPES[parts.ext] } : undefined;
  }

  async delete(key: string): Promise<void> {
    if (this.own(key)) await this.files.delete(key);
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
