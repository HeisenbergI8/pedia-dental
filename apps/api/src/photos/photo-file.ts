import { PDF, UPLOAD_RULES, uploadProblem, type PhotoType } from "@pedia/shared";
import type { SpooledFile } from "../storage/multipart";
import { IMAGE_EXTENSIONS, sniff } from "../storage/sniff";
import type { FileExtension } from "../storage/storage";

/**
 * Whether this spooled file may be stored as a `type` photo (E4). First the shared uploadProblem, with the mock's words
 * and its status rule (413 whenever the file is too large, whichever problem is named: photos/mocks.ts:41). Then the
 * bytes: an image claim must be JPEG, PNG or WebP, a PDF claim must be a PDF, refused with the words uploadProblem uses
 * for a wrong type.
 */
export function photoFileProblem(type: PhotoType, file: SpooledFile): { ext: FileExtension } | { problem: string; status: 400 | 413 } {
  const size = file.tooLarge ? UPLOAD_RULES.maxBytes + 1 : file.bytes;
  const problem = uploadProblem(type, { type: file.claimedType, size });
  if (problem) return { problem, status: file.tooLarge ? 413 : 400 };
  const ext = sniff(file.head);
  const fits = file.claimedType === PDF ? ext === "pdf" : !!ext && IMAGE_EXTENSIONS.includes(ext);
  if (fits) return { ext: ext! };
  // The wrong-type words for this photo type, from the one copy of them (a type no rule accepts).
  return { problem: uploadProblem(type, { type: "application/octet-stream", size: 0 })!, status: 400 };
}
