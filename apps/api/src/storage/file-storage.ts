import { randomBytes } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import type { Env } from "../config/env";
import { LocalDiskStorage } from "./local-disk.storage";
import { S3FileStorage } from "./s3.storage";
import type { FileStorage } from "./storage";

type StorageEnv = Pick<Env, "STORAGE_DIR" | "STORAGE_LINK_SECRET" | "S3_BUCKET" | "S3_REGION" | "S3_ENDPOINT" | "S3_FORCE_PATH_STYLE" | "S3_ACCESS_KEY_ID" | "S3_SECRET_ACCESS_KEY">;

/** The driver for this environment (E11): S3 when S3_BUCKET is set, this instance's disk otherwise. */
export function fileStorageOf(env: StorageEnv, nowMs: () => number = Date.now): FileStorage {
  if (!env.S3_BUCKET) return new LocalDiskStorage(env.STORAGE_DIR, env.STORAGE_LINK_SECRET ?? randomBytes(32).toString("hex"), nowMs);
  if (!env.S3_ACCESS_KEY_ID !== !env.S3_SECRET_ACCESS_KEY) {
    throw new Error("Set both S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY, or neither to use the SDK's default credentials.");
  }
  const client = new S3Client({
    region: env.S3_REGION,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    // Checksums only where the API requires one: SDK 3.7xx+ adds them to every streamed put by default, which some
    // S3-compatible stores (R2, MinIO) have refused. Amazon S3 still checks ContentLength and the transport's own MD5.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
    ...(env.S3_ENDPOINT && { endpoint: env.S3_ENDPOINT }),
    ...(env.S3_ACCESS_KEY_ID && { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY! } }),
  });
  return new S3FileStorage(client, env.S3_BUCKET, { encrypt: !env.S3_ENDPOINT });
}
