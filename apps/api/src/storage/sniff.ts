import { open } from "node:fs/promises";
import type { FileExtension } from "./storage";

const SIGNATURES: [FileExtension, (b: Buffer) => boolean][] = [
  ["jpg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
  ["pdf", (b) => b.subarray(0, 5).toString("latin1") === "%PDF-"],
];

/** The images the API stores from uploads (E4): what the web's downscaler produces. No SVG, no GIF. */
export const IMAGE_EXTENSIONS: readonly FileExtension[] = ["jpg", "png", "webp"];

/** What a file's first bytes (16 are enough) say it is, among the types uploads may be; undefined for anything else. */
export const sniff = (head: Buffer): FileExtension | undefined => SIGNATURES.find(([, is]) => is(head))?.[0];

/** An image's size in pixels, as its header states it. */
export type Pixels = { width: number; height: number };

/**
 * The most an uploaded image may be on either side (D #30). The web's downscaler makes far smaller ones; anything past
 * this is a decompression bomb for every browser that draws it (the chart, the PDF's canvas), not a photo.
 */
export const MAX_IMAGE_SIDE = 8000;

/** The refusal for an image over MAX_IMAGE_SIDE; undefined when it fits or its size couldn't be read. */
export function pixelProblem(pixels: Pixels | undefined): string | undefined {
  if (pixels === UNREADABLE) return "We couldn't read this image's size. Save it again as an ordinary JPG or PNG, then upload it again.";
  if (!pixels || (pixels.width <= MAX_IMAGE_SIDE && pixels.height <= MAX_IMAGE_SIDE)) return undefined;
  return `This image is ${pixels.width} × ${pixels.height} pixels. Make it at most ${MAX_IMAGE_SIDE} pixels on each side, then upload it again.`;
}

/** A read the size walk asks for: `length` bytes from `at`. The answer may be shorter at the end of the file. */
type Need = { at: number; length: number };

/** A JPEG's start-of-frame markers (SOF0–SOF15 less DHT, JPG and DAC): each carries the height, then the width. */
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
/** Markers with no length after them (TEM, RST0–7, SOI). */
const STANDALONE = new Set([0x01, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8]);
/** More segments than any real JPEG has before its frame header: past it, the size is taken as unreadable. */
const MAX_SEGMENTS = 1000;
/**
 * Verification of #30: the walk gave up (too many segments or fill bytes) on bytes a browser would still decode, so the
 * image is refused rather than let through. Plain garbage (no frame at all) stays undefined: no browser draws it.
 */
export const UNREADABLE: Pixels = Object.freeze({ width: -1, height: -1 });

/**
 * The size from the header bytes (PNG IHDR, JPEG SOFn, WebP VP8/VP8L/VP8X), asking for the bytes it needs one read at
 * a time, so a file is never read whole. Undefined when the bytes don't say (not an image, or a malformed header).
 */
function* sizeSteps(): Generator<Need, Pixels | undefined, Buffer> {
  const head = yield { at: 0, length: 30 };
  const ext = sniff(head);
  if (ext === "png") {
    if (head.length < 24 || head.subarray(12, 16).toString("latin1") !== "IHDR") return undefined;
    return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
  }
  if (ext === "webp") {
    if (head.length < 30) return undefined;
    const chunk = head.subarray(12, 16).toString("latin1");
    if (chunk === "VP8X") return { width: head.readUIntLE(24, 3) + 1, height: head.readUIntLE(27, 3) + 1 };
    if (chunk === "VP8L" && head[20] === 0x2f) {
      const bits = head.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8 " && head[23] === 0x9d && head[24] === 0x01 && head[25] === 0x2a) {
      return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff };
    }
    return undefined;
  }
  if (ext !== "jpg") return undefined;
  let at = 2;
  for (let segment = 0; segment < MAX_SEGMENTS; segment++) {
    const b = yield { at, length: 9 };
    if (b.length < 2 || b[0] !== 0xff) return undefined;
    const marker = b[1]!;
    if (marker === 0xff) {
      at += 1; // a fill byte before the marker: counted as a segment, so padding can't walk past the limit
      continue;
    }
    if (STANDALONE.has(marker)) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda || b.length < 4) return undefined; // the image or its data began before a frame header
    if (SOF.has(marker)) return b.length < 9 ? undefined : { width: b.readUInt16BE(7), height: b.readUInt16BE(5) };
    const length = b.readUInt16BE(2);
    if (length < 2) return undefined;
    at += 2 + length;
  }
  return UNREADABLE; // ran out of steps on a JPEG that kept going: refuse rather than trust it
}

/** An image's size from bytes in memory (the logo, which the API holds whole). */
export function imageSize(bytes: Buffer): Pixels | undefined {
  const walk = sizeSteps();
  let step = walk.next();
  while (!step.done) step = walk.next(bytes.subarray(step.value.at, step.value.at + step.value.length));
  return step.value;
}

/** An image's size from a spooled upload on disk, reading only its headers. */
export async function imageSizeOfFile(path: string): Promise<Pixels | undefined> {
  const file = await open(path, "r");
  try {
    const walk = sizeSteps();
    let step = walk.next();
    while (!step.done) {
      const buffer = Buffer.alloc(step.value.length);
      const { bytesRead } = await file.read(buffer, 0, step.value.length, step.value.at);
      step = walk.next(buffer.subarray(0, bytesRead));
    }
    return step.value;
  } finally {
    await file.close();
  }
}
