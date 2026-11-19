import { createHash } from "node:crypto";
import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileStorage, type LinkOptions, type PutInfo, parseKey, parsePlatformKey } from "./storage";

/** What a presigned link's file is called, by the key's area: never a name, only the kind of file. */
const KINDS: Record<string, string> = {
  photos: "photo",
  patients: "photo",
  branding: "branding",
  signups: "signup-file",
  receipts: "payment-receipt",
  "payment-qr": "payment-qr",
};

/** `photo-1a2b3c4d.jpg`: the key's kind and a short hash of the key, so two files don't share a name and none names a child. */
export function linkFileName(key: string): string {
  const parts = parseKey(key) ?? parsePlatformKey(key);
  const short = createHash("sha256").update(key).digest("hex").slice(0, 8);
  return `${(parts && KINDS[parts.area]) ?? "file"}-${short}.${parts?.ext ?? "bin"}`;
}

/**
 * Amazon S3 or an S3-compatible store (E11), shared by every instance: what makes photos survive a restart and a second
 * server. The bucket stays private (no public ACL, block public access on); files are read only through presigned GETs
 * of FILE_LINK_SECONDS (E2). `encrypt`: SSE-S3 on Amazon S3; off for R2/MinIO, which encrypt at rest themselves and may
 * refuse the header.
 */
export class S3FileStorage extends FileStorage {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly options: { encrypt: boolean },
  ) {
    super();
  }

  async put(key: string, body: Buffer | Readable, { contentType, bytes }: PutInfo): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: bytes,
        ...(this.options.encrypt && { ServerSideEncryption: "AES256" as const }),
      }),
    );
  }

  async get(key: string): Promise<Buffer | undefined> {
    try {
      const { Body } = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return Body ? Buffer.from(await Body.transformToByteArray()) : undefined;
    } catch (error) {
      if ((error as { name?: string }).name === "NoSuchKey") return undefined;
      throw error;
    }
  }

  /**
   * A presigned GET. The caller's `fileName` (the child's, photoFileName) is NOT used: the disposition is in the URL's
   * query string, which a browser, proxy or log can keep, so the link names the file `<kind>-<short id>.<ext>` instead
   * (D #11). Only the local driver, which streams the file itself, keeps the friendly name. A stored SVG is always an
   * attachment: opened inline from the bucket's origin, nothing would sandbox it (D #31).
   */
  link(key: string, { contentType, download, expiresInSeconds }: LinkOptions): Promise<string> {
    const attach = download || key.endsWith(".svg");
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `${attach ? "attachment" : "inline"}; filename="${linkFileName(key)}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** S3 answers 204 for a missing key too: idempotent, as the outbox needs (delete-file.handler.ts). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
