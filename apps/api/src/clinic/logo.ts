import { LOGO_RULES, logoProblem } from "@pedia/shared";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import type { FileExtension } from "../storage/storage";

/** What Nest's FileInterceptor (multer, memory storage) hands the controller. `mimetype` is what the browser declared. */
export type LogoUpload = { buffer: Buffer; mimetype: string; size: number };

/** The mock's headers for an uploaded logo (decision #28): opened on its own, nothing in it runs. */
export const LOGO_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Seeded logos are the web's static files (`demo/…` in apps/web/public), never in storage. */
export const isDemoLogo = (ref: string) => /^demo\//.test(ref);

/** The shared rule's own words, for the two refusals multer and the byte check make before `logoProblem` can run. */
export const LOGO_TOO_LARGE = logoProblem({ type: LOGO_RULES.types[0]!, size: LOGO_RULES.maxBytes + 1 })!;
const WRONG_TYPE = logoProblem({ type: "application/octet-stream", size: 0 })!;
const UNUSABLE_SVG = "This SVG has nothing in it that can be shown as a logo. Save it as a PNG and upload that instead.";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const startsWith = (body: Buffer, magic: Buffer) => body.length >= magic.length && body.subarray(0, magic.length).equals(magic);

/** One DOMPurify on one jsdom window for the process: it holds no request's data, only the parser (made on first use). */
let purify: ReturnType<typeof createDOMPurify> | undefined;
const sanitizer = () => (purify ??= createDOMPurify(new JSDOM("").window as unknown as Window & typeof globalThis));

/** The SVG with only drawing left (DOMPurify's SVG profile), or undefined when no `<svg>` root survives. */
export function sanitizeSvg(text: string): string | undefined {
  const clean = String(sanitizer().sanitize(text, { USE_PROFILES: { svg: true, svgFilters: true } })).trim();
  return /^<svg[\s>]/i.test(clean) ? clean : undefined;
}

export type CleanLogo = { ext: FileExtension; body: Buffer } | { problem: string; status: 400 | 413 };

/**
 * What may be stored as a clinic's logo (decision #28). The shared rule on the declared type and size first (the
 * mock's check), then the bytes must be what the type says: a PNG or JPEG is kept as sent, an SVG is rebuilt with
 * nothing but drawing in it, so no script, event handler, foreignObject or javascript: link is ever stored (B3, Decision 5).
 */
export function cleanLogo(file: LogoUpload): CleanLogo {
  const problem = logoProblem({ type: file.mimetype, size: file.size });
  if (problem) return { problem, status: file.size > LOGO_RULES.maxBytes ? 413 : 400 };
  if (file.mimetype === "image/png") return startsWith(file.buffer, PNG) ? { ext: "png", body: file.buffer } : { problem: WRONG_TYPE, status: 400 };
  if (file.mimetype === "image/jpeg") return startsWith(file.buffer, JPEG) ? { ext: "jpg", body: file.buffer } : { problem: WRONG_TYPE, status: 400 };
  const svg = sanitizeSvg(file.buffer.toString("utf8"));
  return svg ? { ext: "svg", body: Buffer.from(svg, "utf8") } : { problem: UNUSABLE_SVG, status: 400 };
}
