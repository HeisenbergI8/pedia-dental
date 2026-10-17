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

/** The one `file` part, on this instance's disk (E1). `bytes` stops one past maxBytes; `tooLarge` says the part went past it. */
export type SpooledFile = { path: string; bytes: number; claimedType: string; head: Buffer; tooLarge: boolean };
export type Upload = { fields: ReadonlyMap<string, string>; file?: SpooledFile; dispose(): Promise<void> };

/** E13: a body over twice the limit is refused before it is read. */
export const tooLargeToRead = (headers: IncomingHttpHeaders, maxBytes: number) => Number(headers["content-length"] ?? 0) > 2 * maxBytes;

/**
 * Reads a multipart body without holding it in memory (decision 2, E1): text fields into a map, the `file` part into a
 * temp file, counting its bytes and keeping its first 16 for sniffing. Any order of parts. A second file and unknown file
 * fields are drained and dropped. Not multipart at all: no fields, no file (the caller's "Attach a file"). The caller
 * runs its checks, stores `file.path` if they pass, and always calls `dispose()`.
 */
export async function readUpload(req: Readable & { headers: IncomingHttpHeaders }, { maxBytes }: { maxBytes: number }): Promise<Upload> {
  const fields = new Map<string, string>();
  if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
    req.resume();
    return { fields, dispose: async () => undefined };
  }
  await mkdir(DIR, { recursive: true });
  let file: SpooledFile | undefined;
  const writes: Promise<void>[] = [];
  const dispose = async () => {
    if (file) await rm(file.path, { force: true });
  };
  const refused = async () => {
    req.resume(); // drain what's left, so the connection can answer
    await Promise.allSettled(writes);
    await dispose();
    return new BadRequestException("The upload didn't arrive whole. Try again.");
  };
  // busboy flags a part that *reaches* fileSize, so it reads one byte past the limit and `tooLarge` is decided by the count.
  // A few file parts are allowed so a stray one (another name) can't crowd out `file`; only `file` is kept.
  let parser: busboy.Busboy;
  try {
    parser = busboy({ headers: req.headers, limits: { files: 3, fields: 8, parts: 10, fieldSize: FIELD_BYTES, fileSize: maxBytes + 1 } });
  } catch {
    throw await refused(); // a multipart type with no usable boundary (B10 tester D1)
  }
  parser.on("field", (name, value, info) => {
    if (!info.valueTruncated) fields.set(name, value);
  });
  parser.on("file", (name, stream, info) => {
    if (name !== "file" || file) return void stream.resume();
    const spooled: SpooledFile = { path: join(DIR, randomUUID()), bytes: 0, claimedType: info.mimeType, head: Buffer.alloc(0), tooLarge: false };
    file = spooled;
    const count = new Transform({
      transform(chunk: Buffer, _encoding, done) {
        if (spooled.head.length < HEAD_BYTES) spooled.head = Buffer.concat([spooled.head, chunk.subarray(0, HEAD_BYTES - spooled.head.length)]);
        spooled.bytes += chunk.length;
        spooled.tooLarge = spooled.bytes > maxBytes; // busboy passes at most maxBytes + 1, then drains the rest
        done(null, chunk);
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
  return { fields, file, dispose };
}
