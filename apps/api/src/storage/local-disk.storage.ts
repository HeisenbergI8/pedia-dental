import { randomUUID } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import type { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { signLink, verifyLink } from "./local-links";
import { CONTENT_TYPES, FileStorage, type LinkOptions, type PutInfo, parseKey } from "./storage";

/** What GET /files/:token streams back (LocalFilesController). */
export type OpenedFile = { stream: Readable; bytes: number; contentType: string; name: string; download: boolean };

/**
 * Files on this instance's disk under STORAGE_DIR: development, tests, a one-server demo. Not shared between instances;
 * S3FileStorage is. Links are `/api/files/<token>`, signed with `secret` (E2), served by LocalFilesController.
 */
export class LocalDiskStorage extends FileStorage {
  private readonly root: string;

  constructor(
    root: string,
    private readonly secret: string,
    private readonly nowMs: () => number = Date.now,
  ) {
    super();
    this.root = resolve(root);
  }

  /** A second guard after StorageService's key check: nothing resolves outside the root. */
  private pathOf(key: string): string {
    const path = resolve(this.root, key);
    if (!path.startsWith(this.root + sep)) throw new Error("A storage key resolves outside the storage root.");
    return path;
  }

  /** Written beside its target and renamed into place, so a reader never sees half a file. */
  async put(key: string, body: Buffer | Readable, _info: PutInfo): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const partial = `${path}.${randomUUID()}.partial`;
    try {
      if (Buffer.isBuffer(body)) await writeFile(partial, body);
      else await pipeline(body, createWriteStream(partial));
      await rename(partial, path);
    } catch (error) {
      await rm(partial, { force: true });
      throw error;
    }
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async link(key: string, { fileName, download, expiresInSeconds }: LinkOptions): Promise<string> {
    this.pathOf(key); // the same guard as every other method
    return `/api/files/${signLink(this.secret, { key, exp: this.nowMs() + expiresInSeconds * 1000, name: fileName, download })}`;
  }

  /** A live link's file, or undefined (bad or expired token, unknown key shape, no such file). */
  async open(token: string): Promise<OpenedFile | undefined> {
    const claims = verifyLink(this.secret, token, this.nowMs());
    const parts = claims && parseKey(claims.key);
    if (!claims || !parts) return undefined;
    const path = this.pathOf(claims.key);
    const size = await stat(path).then(
      (s) => s.size,
      () => undefined,
    );
    if (size === undefined) return undefined;
    return { stream: createReadStream(path), bytes: size, contentType: CONTENT_TYPES[parts.ext], name: claims.name, download: claims.download };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
