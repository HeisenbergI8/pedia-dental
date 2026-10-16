import type { FileExtension } from "../storage/storage";

/** The mock's limit and words (mocks.ts:71, :337, :338). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Images must be under 10 MB";
export const NOT_AN_IMAGE = "Attach an image file";

/** What multer (memory storage) hands the controller. `mimetype` is what the browser declared. */
export type PhotoUpload = { buffer: Buffer; mimetype: string; size: number };

const SIGNATURES: [FileExtension, (b: Buffer) => boolean][] = [
  ["jpg", (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ["png", (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ["webp", (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP"],
];

/**
 * What may be stored as a child's photo. The mock's checks (an image type, under 10 MB), then the bytes must be a
 * JPEG, PNG or WebP: what the web's downscaler produces. Anything else, an SVG or a GIF included, is refused with the
 * mock's words, so nothing that can carry script is ever served from the API's origin.
 */
export function cleanPhoto(file: PhotoUpload | undefined): { ext: FileExtension; body: Buffer } | { problem: string; status: 400 | 413 } {
  if (!file || !file.mimetype.startsWith("image/")) return { problem: NOT_AN_IMAGE, status: 400 };
  if (file.size > MAX_PHOTO_BYTES) return { problem: PHOTO_TOO_LARGE, status: 413 };
  const hit = SIGNATURES.find(([, is]) => is(file.buffer));
  return hit ? { ext: hit[0], body: file.buffer } : { problem: NOT_AN_IMAGE, status: 400 };
}

/** A readable name if someone saves it, never the record id (mocks.ts:349). Always `.jpg`, as the mock. */
export const photoFileName = (p: { lastName: string; firstName: string }) =>
  `${p.lastName}-${p.firstName}-photo.jpg`.replace(/[^\w.-]+/g, "-").toLowerCase();
