import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../config/env";
import { fileStorageOf } from "./file-storage";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3FileStorage } from "./s3.storage";

let root: string;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pd-driver-"));
});
afterAll(() => rm(root, { recursive: true, force: true }));
const env = (extra: Record<string, string> = {}) => loadEnv({ DATABASE_URL: "mysql://unused", STORAGE_DIR: root, ...extra });
const KEY = "clinics/clinic_a/photos/f1.png";
const linked = async (from: LocalDiskStorage, to: LocalDiskStorage) => {
  const link = await from.link(KEY, { contentType: "image/png", fileName: "f.png", download: false, expiresInSeconds: 300 });
  const opened = await to.open(link.slice("/api/files/".length));
  opened?.stream.destroy();
  return opened !== undefined;
};

describe("fileStorageOf (B10 E11)", () => {
  it("picks the local disk without a bucket, and S3 with one", () => {
    expect(fileStorageOf(env())).toBeInstanceOf(LocalDiskStorage);
    expect(fileStorageOf(env({ S3_BUCKET: "primolar-files" }))).toBeInstanceOf(S3FileStorage);
  });

  it("wants both S3 keys or neither", () => {
    expect(() => fileStorageOf(env({ S3_BUCKET: "primolar-files", S3_ACCESS_KEY_ID: "AKID" }))).toThrow(/both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither/);
  });

  it("signs links that another instance opens only with a shared STORAGE_LINK_SECRET", async () => {
    const a = fileStorageOf(env()) as LocalDiskStorage;
    await a.put(KEY, Buffer.from([1]), { contentType: "image/png", bytes: 1 });
    expect(await linked(a, fileStorageOf(env()) as LocalDiskStorage)).toBe(false);
    const secret = { STORAGE_LINK_SECRET: "k".repeat(32) };
    expect(await linked(fileStorageOf(env(secret)) as LocalDiskStorage, fileStorageOf(env(secret)) as LocalDiskStorage)).toBe(true);
  });
});
