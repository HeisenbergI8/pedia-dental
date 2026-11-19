import { LETTERHEAD_IMAGE_RULES, imageProblem } from "@pedia/shared";
import type { SpooledFile } from "../storage/multipart";
import { pixelProblem, sniff } from "../storage/sniff";
import { CONTENT_TYPES, type FileExtension } from "../storage/storage";

/** What a letterhead image may be (decision 24): a PNG or a JPEG, by its bytes. No SVG, no WebP. */
const LETTERHEAD_EXTS: readonly FileExtension[] = ["png", "jpg"];

/** The mock's words for a missing file part (clinic/mocks.ts). */
export const NO_LETTERHEAD_FILE = "Attach the letterhead image";

/**
 * Whether this spooled file may be stored as the letterhead image. The bytes decide the type (`sniff`), then the shared
 * `imageProblem` speaks the mock's words, with its status rule: 413 only when the type is right and the file too large.
 */
export function letterheadImageProblem(file: SpooledFile): { ext: FileExtension } | { problem: string; status: 400 | 413 } {
  const sniffed = sniff(file.head);
  const ext = sniffed && LETTERHEAD_EXTS.includes(sniffed) ? sniffed : undefined;
  const problem = imageProblem(LETTERHEAD_IMAGE_RULES, { type: ext ? CONTENT_TYPES[ext] : "", size: file.bytes });
  if (problem) return { problem, status: ext && file.tooLarge ? 413 : 400 };
  const pixels = pixelProblem(file.pixels); // D #30
  return pixels ? { problem: pixels, status: 400 } : { ext: ext! };
}
