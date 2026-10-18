import type { IncomingHttpHeaders } from "node:http";
import type { Readable } from "node:stream";
import { BadRequestException, PayloadTooLargeException } from "@nestjs/common";
import { imageProblem, type ImageRules } from "@pedia/shared";
import type { z } from "zod";
import { ZodIssuesException } from "../common/zod-validation.pipe";
import { readUploads, tooLargeToRead } from "./multipart";
import { sniff } from "./sniff";
import { CONTENT_TYPES, type FileExtension } from "./storage";
import type { CheckedFile } from "./storage.service";

/** A checked image: its temp file, and the type its bytes say it is. */
export type CheckedImage = CheckedFile & { ext: FileExtension };

const IMAGE_EXTS: readonly FileExtension[] = ["png", "jpg", "webp"];

/**
 * The QR's and a receipt's multipart body (B12, the mock's `readImageForm`): a `data` JSON part parsed by `schema` and
 * an image `file`. `required`: whether a file must come with it. The bytes decide the type (`sniff`), then
 * `imageProblem` speaks the mock's words. Throws the mock's refusal; on success the caller stores `file` and always
 * calls `dispose()`.
 */
export async function readImageForm<T extends z.ZodType>(
  req: Readable & { headers: IncomingHttpHeaders },
  schema: T,
  rules: ImageRules,
  required: boolean,
): Promise<{ data: z.infer<T>; file?: CheckedImage; dispose(): Promise<void> }> {
  if (tooLargeToRead(req.headers, rules.maxBytes)) throw new PayloadTooLargeException(imageProblem(rules, { type: rules.types[0]!, size: rules.maxBytes + 1 }));
  if (!String(req.headers["content-type"] ?? "").startsWith("multipart/form-data")) {
    req.resume();
    throw new BadRequestException("Send the form as multipart/form-data");
  }
  const upload = await readUploads(req, { parts: { file: { max: 1, maxBytes: rules.maxBytes } } });
  try {
    let json: unknown;
    try {
      json = JSON.parse(upload.fields.get("data") ?? "");
    } catch {
      throw new BadRequestException("The form's data part isn't valid JSON");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new ZodIssuesException(parsed.error.issues);
    const spooled = upload.files.file?.[0];
    const present = spooled && spooled.bytes > 0 ? spooled : undefined;
    if (!present && !required) return { data: parsed.data, dispose: upload.dispose };
    const ext = present && sniff(present.head);
    const image = ext && IMAGE_EXTS.includes(ext) ? ext : undefined;
    const problem = imageProblem(rules, present && { type: image ? CONTENT_TYPES[image] : "", size: present.bytes });
    if (problem) throw present?.tooLarge && image ? new PayloadTooLargeException(problem) : new BadRequestException(problem);
    return { data: parsed.data, file: { path: present!.path, bytes: present!.bytes, ext: image! }, dispose: upload.dispose };
  } catch (error) {
    await upload.dispose();
    throw error;
  }
}
