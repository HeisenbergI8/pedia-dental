import { S3Client } from "@aws-sdk/client-s3";
import { describe, expect, it } from "vitest";
import { S3FileStorage } from "./s3.storage";

/** A fake client that records each command's input: put, get and delete never reach a network. */
function fake(answer: (name: string) => unknown = () => ({})) {
  const sent: { name: string; input: Record<string, unknown> }[] = [];
  const client = {
    send: async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      sent.push({ name: command.constructor.name, input: command.input });
      const result = answer(command.constructor.name);
      if (result instanceof Error) throw result;
      return result;
    },
  } as unknown as S3Client;
  return { client, sent };
}
const KEY = "clinics/clinic_a/photos/f1.png";
const real = (extra: object = {}) => new S3Client({ region: "ap-southeast-1", credentials: { accessKeyId: "AKIDEXAMPLE", secretAccessKey: "secret" }, ...extra });

describe("S3FileStorage (B10 E11)", () => {
  it("puts with the length, the type and SSE-S3, and without SSE for R2 or MinIO", async () => {
    const { client, sent } = fake();
    await new S3FileStorage(client, "files", { encrypt: true }).put(KEY, Buffer.from([1, 2]), { contentType: "image/png", bytes: 2 });
    await new S3FileStorage(client, "files", { encrypt: false }).put(KEY, Buffer.from([1, 2]), { contentType: "image/png", bytes: 2 });
    expect(sent[0]).toMatchObject({ name: "PutObjectCommand", input: { Bucket: "files", Key: KEY, ContentType: "image/png", ContentLength: 2, ServerSideEncryption: "AES256" } });
    expect(sent[1]!.input).not.toHaveProperty("ServerSideEncryption");
  });

  it("reads a missing key as undefined, rethrows anything else, and deletes by key", async () => {
    const missing = fake(() => Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    expect(await new S3FileStorage(missing.client, "files", { encrypt: true }).get(KEY)).toBeUndefined();
    const broken = fake(() => Object.assign(new Error("down"), { name: "ServiceUnavailable" }));
    await expect(new S3FileStorage(broken.client, "files", { encrypt: true }).get(KEY)).rejects.toThrow("down");
    const ok = fake();
    await new S3FileStorage(ok.client, "files", { encrypt: true }).delete(KEY);
    expect(ok.sent[0]).toMatchObject({ name: "DeleteObjectCommand", input: { Bucket: "files", Key: KEY } });
  });

  it("presigns a 5-minute GET with the file's type and name, inline or as an attachment", async () => {
    const storage = new S3FileStorage(real(), "files", { encrypt: true });
    const url = new URL(await storage.link(KEY, { contentType: "image/png", fileName: "bea.png", download: false, expiresInSeconds: 300 }));
    expect([url.host, url.pathname]).toEqual(["files.s3.ap-southeast-1.amazonaws.com", `/${KEY}`]);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("response-content-disposition")).toBe('inline; filename="bea.png"');
    expect(url.searchParams.get("response-content-type")).toBe("image/png");
    const saved = new URL(await storage.link(KEY, { contentType: "image/png", fileName: "bea.png", download: true, expiresInSeconds: 300 }));
    expect(saved.searchParams.get("response-content-disposition")).toBe('attachment; filename="bea.png"');
  });

  it("presigns path-style for MinIO", async () => {
    const storage = new S3FileStorage(real({ endpoint: "http://localhost:9000", forcePathStyle: true }), "files", { encrypt: false });
    const url = new URL(await storage.link(KEY, { contentType: "image/png", fileName: "bea.png", download: false, expiresInSeconds: 300 }));
    expect(`${url.origin}${url.pathname}`).toBe(`http://localhost:9000/files/${KEY}`);
  });
});
