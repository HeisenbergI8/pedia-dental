import { LOGO_RULES, logoProblem } from "@pedia/shared";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { imageSize, pixelProblem } from "../storage/sniff";
import type { FileExtension } from "../storage/storage";

/** A logo read whole from its spooled upload (the clinic's, D #12; a sign-up's). `mimetype` is what the browser declared. */
export type LogoUpload = { buffer: Buffer; mimetype: string; size: number };

/** The mock's headers for an uploaded logo (decision #28): opened on its own, nothing in it runs. */
export const LOGO_HEADERS = {
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
  "X-Content-Type-Options": "nosniff",
} as const;

/** Seeded logos are the web's static files (`demo/…` in apps/web/public), never in storage. */
export const isDemoLogo = (ref: string) => /^demo\//.test(ref);

/** The shared rule's own words, for the two refusals the upload's limit and the byte check make before `logoProblem` can run. */
export const LOGO_TOO_LARGE = logoProblem({ type: LOGO_RULES.types[0]!, size: LOGO_RULES.maxBytes + 1 })!;
const WRONG_TYPE = logoProblem({ type: "application/octet-stream", size: 0 })!;
const UNUSABLE_SVG = "This SVG has nothing in it that can be shown as a logo. Save it as a PNG and upload that instead.";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const startsWith = (body: Buffer, magic: Buffer) => body.length >= magic.length && body.subarray(0, magic.length).equals(magic);

const SVG_NS = "http://www.w3.org/2000/svg";

/** A `url(…)` that points anywhere but this document (`url(#gradient)` stays). */
const OUTSIDE_URL = /url\s*\(\s*(?!['"]?\s*#)/i;

/** One DOMPurify on one jsdom window for the process: it holds no request's data, only the parser (made on first use). */
let tools: { purify: ReturnType<typeof createDOMPurify>; xml: XMLSerializer } | undefined;
const sanitizer = () => {
  if (!tools) {
    const { window } = new JSDOM("");
    const purify = createDOMPurify(window as unknown as Window & typeof globalThis);
    // D #31: nothing in a logo may reach outside it. A link is kept only to a `#fragment` of the same SVG (`<use>`,
    // gradients), and no attribute (a `style`, a `fill`, a `filter`) may load a `url()` from elsewhere.
    purify.addHook("uponSanitizeAttribute", (_node, data) => {
      const name = data.attrName.toLowerCase();
      const value = data.attrValue.trim();
      if ((name === "href" || name === "xlink:href") && !value.startsWith("#")) data.keepAttr = false;
      // A CSS escape (`u\72l(`) or `image-set("…")` hides a URL from the pattern: refuse any attribute carrying either.
      else if (OUTSIDE_URL.test(value) || value.includes("\\") || /image-set\s*\(/i.test(value)) data.keepAttr = false;
    });
    tools = { purify, xml: new window.XMLSerializer() };
  }
  return tools;
};

/**
 * The SVG with only drawing left (DOMPurify's SVG profile), or undefined when no `<svg>` root survives. No `<style>`
 * (an `@import` or `url()` would fetch from elsewhere) and no `<image>` (an embedded or outside picture), D #31. Written
 * back as XML, not DOMPurify's HTML string: HTML would write `&nbsp;`, which isn't XML, and `<img>` then shows nothing.
 */
export function sanitizeSvg(text: string): string | undefined {
  const { purify, xml } = sanitizer();
  const root = purify.sanitize(text, {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ["style", "image", "feImage"],
    FORBID_ATTR: ["style"], // inline CSS can reach outside in ways a pattern can't follow; presentation attributes stay
    RETURN_DOM_FRAGMENT: true,
  }).firstElementChild;
  return root?.localName === "svg" && root.namespaceURI === SVG_NS ? xml.serializeToString(root) : undefined;
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
  const raster = file.mimetype === "image/png" ? ({ ext: "png", magic: PNG } as const) : file.mimetype === "image/jpeg" ? ({ ext: "jpg", magic: JPEG } as const) : undefined;
  if (raster) {
    if (!startsWith(file.buffer, raster.magic)) return { problem: WRONG_TYPE, status: 400 };
    const pixels = pixelProblem(imageSize(file.buffer)); // D #30
    return pixels ? { problem: pixels, status: 400 } : { ext: raster.ext, body: file.buffer };
  }
  const svg = sanitizeSvg(file.buffer.toString("utf8"));
  return svg ? { ext: "svg", body: Buffer.from(svg, "utf8") } : { problem: UNUSABLE_SVG, status: 400 };
}
