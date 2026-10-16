import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { FileStorage } from "./storage";

/**
 * Files on this instance's disk under STORAGE_DIR: development, tests, a one-server demo. Not shared between instances;
 * B10's S3/R2 driver is.
 */
export class LocalDiskStorage extends FileStorage {
  private readonly root: string;

  constructor(root: string) {
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
  async put(key: string, body: Buffer): Promise<void> {
    const path = this.pathOf(key);
    await mkdir(dirname(path), { recursive: true });
    const partial = `${path}.${randomUUID()}.partial`;
    await writeFile(partial, body);
    await rename(partial, path);
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathOf(key), { force: true });
  }
}
