import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BadRequestException } from "@nestjs/common";
import busboy from "busboy";

const DIR = join(tmpdir(), "primolar-uploads");
/** `meta` is a few hundred bytes; anything past this is cut and then refused as not JSON. */
const FIELD_BYTES = 64 * 1024;
const HEAD_BYTES = 16;

/** One spooled file part, on this instance's disk (E1). `bytes` stops one past maxBytes; `tooLarge` says the part went past it. */
export type SpooledFile = { path: string; bytes: number; claimedType: string; head: Buffer; tooLarge: boolean };
export type Upload = { fields: ReadonlyMap<string, string>; file?: SpooledFile; dispose(): Promise<void> };
/** B12: several named file parts (a sign-up's logo and reference images): each name keeps up to `max` files. */
export type Uploads = { fields: ReadonlyMap<string, string>; files: Record<string, SpooledFile[]>; dispose(): Promise<void> };
export type PartRules = Record<string, { max: number; maxBytes: number }>;

/** E13: a body over twice the limit is refused before it is read. */
export const tooLargeToRead = (headers: IncomingHttpHeaders, maxBytes: number) => Number(headers["content-length"] ?? 0) > 2 * maxBytes;
/** The same for several parts: twice what every part could hold together. */
export const partsTooLargeToRead = (headers: IncomingHttpHeaders, parts: PartRules) =>
  tooLargeToRead(headers, Object.values(parts).reduce((n, p) => n + p.max * p.maxBytes, 0));

type Req = Readable & { headers: IncomingHttpHeaders };

/**
 * Reads a multipart body without holding it in memory (decision 2, E1): text fields into a map, the `file` part into a
 * temp file, counting its bytes and keeping its first 16 for sniffing. Any order of parts. A second file and unknown file
 * fields are drained and dropped. Not multipart at all: no fields, no file (the caller's "Attach a file"). The caller
 * runs its checks, stores `file.path` if they pass, and always calls `dispose()`.
 */
export async function readUpload(req: Req, { maxBytes }: { maxBytes: number }): Promise<Upload> {
  const { fields, files, dispose } = await readUploads(req, { parts: { file: { max: 1, maxBytes } } });
  return { fields, file: files.file?.[0], dispose };
}

/**
 * readUpload for several named parts (B12 Step 5.2): each part to its own temp file, `tooLarge` per file. A part past
 * its name's `max`, or with a name not in `parts`, is drained and dropped. The caller always calls `dispose()`.
 */
export async function readUploads(req: Req, { parts }: { parts: PartRules }): Promise<Uploads> {
  const fields = new Map<string, string>();
  const files: Record<string, SpooledFile[]> = Object.fromEntries(Object.keys(parts).map((name) => [name, []]));
  if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
    req.resume();
    return { fields, files, dispose: async () => undefined };
  }
  await mkdir(DIR, { recursive: true });
  const writes: Promise<void>[] = [];
  const dispose = async () => {
    await Promise.all(Object.values(files).flat().map((f) => rm(f.path, { force: true })));
  };
  const refused = async () => {
    req.resume(); // drain what's left, so the connection can answer
    await Promise.allSettled(writes);
    await dispose();
    return new BadRequestException("The upload didn't arrive whole. Try again.");
  };
  const wanted = Object.values(parts).reduce((n, p) => n + p.max, 0);
  const largest = Math.max(...Object.values(parts).map((p) => p.maxBytes));
  // busboy flags a part that *reaches* fileSize, so it reads one byte past the limit and `tooLarge` is decided by the count.
  // A few extra file parts are allowed so a stray one (another name) can't crowd out the wanted ones.
  let parser: busboy.Busboy;
  try {
    parser = busboy({ headers: req.headers, limits: { files: wanted + 2, fields: 8, parts: wanted + 10, fieldSize: FIELD_BYTES, fileSize: largest + 1 } });
  } catch {
    throw await refused(); // a multipart type with no usable boundary (B10 tester D1)
  }
  parser.on("field", (name, value, info) => {
    if (!info.valueTruncated) fields.set(name, value);
  });
  parser.on("file", (name, stream, info) => {
    const rule = Object.hasOwn(parts, name) ? parts[name] : undefined;
    const list = files[name];
    if (!rule || !list || list.length >= rule.max) return void stream.resume();
    const spooled: SpooledFile = { path: join(DIR, randomUUID()), bytes: 0, claimedType: info.mimeType, head: Buffer.alloc(0), tooLarge: false };
    list.push(spooled);
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (spooled.head.length < HEAD_BYTES) spooled.head = Buffer.concat([spooled.head, chunk.subarray(0, HEAD_BYTES - spooled.head.length)]);
        // Past this part's own limit: count it, write no more (the disk never holds more than maxBytes + 1).
        if (spooled.bytes > rule.maxBytes) {
          spooled.bytes += chunk.length;
          return done();
        }
        const keep = chunk.subarray(0, Math.max(0, rule.maxBytes + 1 - spooled.bytes));
        spooled.bytes += chunk.length;
        spooled.tooLarge = spooled.bytes > rule.maxBytes;
        done(null, keep);
      },
    });
    writes.push(pipeline(stream, count, createWriteStream(spooled.path)));
  });
  try {
    await pipeline(req, parser);
    await Promise.all(writes);
  } catch {
    throw await refused();
  }
  return { fields, files, dispose };
}
