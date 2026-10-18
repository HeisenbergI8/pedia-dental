import { readFile } from "node:fs/promises";
import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { LOGO_RULES, REFERENCE_IMAGE_RULES, brandColorProblem, logoProblem, referenceImagesProblem, suggestBrandColor, type BrandingInput } from "@pedia/shared";
import type { z } from "zod";
import { cleanLogo } from "../clinic/logo";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { partsTooLargeToRead, readUploads, type PartRules } from "../storage/multipart";
import { sniff } from "../storage/sniff";
import { CONTENT_TYPES, type FileExtension } from "../storage/storage";
import type { CheckedImage } from "../storage/image-form";

/** The logo, sanitised (B3's cleanLogo): small enough to hold whole, as the clinic's own logo is. */
export type CleanedLogo = { ext: FileExtension; body: Buffer };
export type SignupForm<T> = { data: T; logo?: CleanedLogo; references: CheckedImage[]; dispose(): Promise<void> };

// One reference past the limit is read, so the shared rule can say "up to 3" as the mock does.
const PARTS: PartRules = {
  logo: { max: 1, maxBytes: LOGO_RULES.maxBytes },
  reference: { max: REFERENCE_IMAGE_RULES.max + 1, maxBytes: REFERENCE_IMAGE_RULES.maxBytes },
};
const REFERENCE_EXTS: readonly FileExtension[] = ["png", "jpg"];

/**
 * A sign-up's multipart body (the mock's `readSignupForm`): `data` parsed by `schema`, an optional `logo` (LOGO_RULES,
 * then sniffed and an SVG sanitised) and up to three `reference` images (PNG or JPG by their bytes). Throws the mock's
 * refusal; on success the caller stores the files and always calls `dispose()`.
 */
export async function readSignupForm<T extends z.ZodType>(req: Readable & { headers: IncomingHttpHeaders }, schema: T): Promise<SignupForm<z.infer<T>>> {
  if (partsTooLargeToRead(req.headers, PARTS)) throw new PayloadTooLargeException("The files are too large. Logos must be 1 MB or smaller, reference images 5 MB.");
  if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
    req.resume();
    throw new BadRequestException("Send the form as multipart/form-data");
  }
  const upload = await readUploads(req, { parts: PARTS });
  try {
    let json: unknown;
    try {
      json = JSON.parse(upload.fields.get("data") ?? "");
    } catch {
      throw new BadRequestException("The form's data part isn't valid JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);

    const spooledLogo = upload.files.logo?.find((f) => f.bytes > 0);
    let logo: CleanedLogo | undefined;
    if (spooledLogo) {
      // The bytes decide the type the shared rule checks: a PNG or JPEG by its signature, anything else as what it claims.
      const ext = sniff(spooledLogo.head);
      const type = ext === "png" || ext === "jpg" ? CONTENT_TYPES[ext] : spooledLogo.claimedType;
      if (spooledLogo.tooLarge) {
        const problem = logoProblem({ type, size: spooledLogo.bytes })!; // the type first, then the size, as the mock
        throw LOGO_RULES.types.includes(type) ? new PayloadTooLargeException(problem) : new BadRequestException(problem);
      }
      const clean = cleanLogo({ buffer: await readFile(spooledLogo.path), mimetype: type, size: spooledLogo.bytes });
      if ("problem" in clean) throw clean.status === 413 ? new PayloadTooLargeException(clean.problem) : new BadRequestException(clean.problem);
      logo = clean;
    }

    const spooled = (upload.files.reference ?? []).filter((f) => f.bytes > 0);
    const kinds = spooled.map((f) => sniff(f.head));
    const problem = referenceImagesProblem(
      spooled.map((f, i) => ({ type: kinds[i] && REFERENCE_EXTS.includes(kinds[i]) ? CONTENT_TYPES[kinds[i]] : "", size: f.tooLarge ? REFERENCE_IMAGE_RULES.maxBytes + 1 : f.bytes })),
    );
    if (problem) throw new BadRequestException(problem);
    const references = spooled.map((f, i) => ({ path: f.path, bytes: f.bytes, ext: kinds[i]! }));
    return { data: parsed.data, logo, references, dispose: upload.dispose };
  } catch (error) {
    await upload.dispose();
    throw error;
  }
}

/** Use my own needs a passing colour (billing #19, as PUT /clinic/branding) and a logo (A6): the mock's words. */
export function brandingRefusal(branding: BrandingInput, hasLogo: boolean): string | undefined {
  if (branding.choice !== "own") return undefined;
  const problem = brandColorProblem(branding.brandColor);
  if (problem) return `${problem} Try ${suggestBrandColor(branding.brandColor)}.`;
  if (!hasLogo) return "Add your logo, or choose Use the default look";
  return undefined;
}
