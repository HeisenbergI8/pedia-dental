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
