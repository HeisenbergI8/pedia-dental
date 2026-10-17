import type { SpooledFile } from "../storage/multipart";
import { IMAGE_EXTENSIONS, sniff } from "../storage/sniff";
import type { FileExtension } from "../storage/storage";

/** The mock's limit and words (mocks.ts:71, :337, :338). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export const PHOTO_TOO_LARGE = "Images must be under 10 MB";
export const NOT_AN_IMAGE = "Attach an image file";

/**
 * What may be stored as a child's photo. The mock's checks (an image type, under 10 MB), then the bytes must be a
 * JPEG, PNG or WebP: what the web's downscaler produces. Anything else, an SVG or a GIF included, is refused with the
 * mock's words, so nothing that can carry script is ever served from the API's origin.
 */
export function cleanPhoto(file: SpooledFile | undefined): { ext: FileExtension } | { problem: string; status: 400 | 413 } {
  if (!file || !file.claimedType.startsWith("image/")) return { problem: NOT_AN_IMAGE, status: 400 };
  if (file.tooLarge) return { problem: PHOTO_TOO_LARGE, status: 413 };
  const ext = sniff(file.head);
  return ext && IMAGE_EXTENSIONS.includes(ext) ? { ext } : { problem: NOT_AN_IMAGE, status: 400 };
}

/** A readable name if someone saves it, never the record id (mocks.ts:349). Always `.jpg`, as the mock. */
export const photoFileName = (p: { lastName: string; firstName: string }) =>
  `${p.lastName}-${p.firstName}-photo.jpg`.replace(/[^\w.-]+/g, "-").toLowerCase();
