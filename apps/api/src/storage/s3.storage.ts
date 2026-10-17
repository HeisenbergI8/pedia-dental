import type { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { FileStorage, type LinkOptions, type PutInfo } from "./storage";

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

  link(key: string, { contentType, fileName, download, expiresInSeconds }: LinkOptions): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ResponseContentType: contentType,
      ResponseContentDisposition: `${download ? "attachment" : "inline"}; filename="${fileName}"`,
    });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  /** S3 answers 204 for a missing key too: idempotent, as the outbox needs (delete-file.handler.ts). */
  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
