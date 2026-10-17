import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readUpload, tooLargeToRead } from "./multipart";
import { sniff } from "./sniff";

/** A multipart body as the browser sends it, fed in chunks of `chunk` bytes. */
async function request(parts: [name: string, value: string | Blob][], chunk = 64 * 1024) {
  const form = new FormData();
  for (const [name, value] of parts) form.append(name, value);
  const req = new Request("http://x", { method: "POST", body: form });
  const body = Buffer.from(await req.arrayBuffer());
  const pieces = Array.from({ length: Math.ceil(body.length / chunk) }, (_, i) => body.subarray(i * chunk, (i + 1) * chunk));
  return Object.assign(Readable.from(pieces), { headers: { "content-type": req.headers.get("content-type")! } });
}
const jpeg = (size: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(Math.max(0, size - 4), 1)]);
const blob = (b: Buffer, type = "image/jpeg") => new Blob([new Uint8Array(b)], { type });

describe("readUpload (B10 E1)", () => {
  it("reads the fields and spools the file, in either order", async () => {
    const bytes = jpeg(5_000);
    for (const parts of [[["meta", "{\"a\":1}"], ["file", blob(bytes)]], [["file", blob(bytes)], ["meta", "{\"a\":1}"]]] as [string, string | Blob][][]) {
      const upload = await readUpload(await request(parts), { maxBytes: 10_000 });
      expect(upload.fields.get("meta")).toBe('{"a":1}');
      expect(upload.file).toMatchObject({ bytes: 5_000, claimedType: "image/jpeg", tooLarge: false });
      expect((await readFile(upload.file!.path)).equals(bytes)).toBe(true);
      await upload.dispose();
      expect(existsSync(upload.file!.path)).toBe(false);
    }
  });

  it("stops at the limit and says so; exactly the limit is fine", async () => {
    const over = await readUpload(await request([["file", blob(jpeg(10_001))]]), { maxBytes: 10_000 });
    expect(over.file).toMatchObject({ tooLarge: true, bytes: 10_001 });
    await over.dispose();
    const exact = await readUpload(await request([["file", blob(jpeg(10_000))]]), { maxBytes: 10_000 });
    expect(exact.file?.tooLarge).toBe(false);
    await exact.dispose();
  });

  it("keeps the first 16 bytes even when they arrive a byte at a time", async () => {
    const bytes = jpeg(40);
    const upload = await readUpload(await request([["file", blob(bytes)]], 1), { maxBytes: 1_000 });
    expect(upload.file!.head.equals(bytes.subarray(0, 16))).toBe(true);
    await upload.dispose();
  });

  it("drops a second file, other file fields and an over-long field; a JSON body has neither", async () => {
    const upload = await readUpload(await request([["other", blob(jpeg(10))], ["file", blob(jpeg(20))], ["file", blob(jpeg(30))], ["meta", "x".repeat(70_000)]]), { maxBytes: 1_000 });
    expect(upload.file?.bytes).toBe(20);
    expect(upload.fields.has("meta")).toBe(false);
    await upload.dispose();
    const json = Object.assign(Readable.from([Buffer.from("{}")]), { headers: { "content-type": "application/json" } });
    const none = await readUpload(json, { maxBytes: 1_000 });
    expect([none.file, none.fields.size]).toEqual([undefined, 0]);
  });

  it("refuses a body cut off mid-part, leaving no temp file", async () => {
    const whole = await request([["file", blob(jpeg(5_000))]]);
    const chunks: Buffer[] = [];
    for await (const c of whole) chunks.push(c as Buffer);
    const cut = Buffer.concat(chunks).subarray(0, 3_000);
    const req = Object.assign(Readable.from([cut]), { headers: whole.headers });
    await expect(readUpload(req, { maxBytes: 10_000 })).rejects.toThrow("The upload didn't arrive whole. Try again.");
  });

  it("refuses a body over twice the limit before reading it (E13)", () => {
    expect(tooLargeToRead({ "content-length": "20000" }, 10_000)).toBe(false);
    expect(tooLargeToRead({ "content-length": "20001" }, 10_000)).toBe(true);
  });
});

describe("sniff", () => {
  it("knows JPEG, PNG, WebP and PDF by their bytes, and nothing else", () => {
    expect(sniff(jpeg(16))).toBe("jpg");
    expect(sniff(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("png");
    expect(sniff(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"))).toBe("webp");
    expect(sniff(Buffer.from("%PDF-1.4"))).toBe("pdf");
    for (const other of ["<svg xmlns='x'/>", "GIF89a", "hello"]) expect(sniff(Buffer.from(other))).toBeUndefined();
  });
});
