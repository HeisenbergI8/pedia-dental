import { describe, expect, it } from "vitest";
import { LOGO_TOO_LARGE, cleanLogo } from "./logo";

const file = (mimetype: string, body: string | Buffer) => {
  const buffer = typeof body === "string" ? Buffer.from(body, "utf8") : body;
  return { mimetype, buffer, size: buffer.length };
};
const svgOut = (body: string) => {
  const result = cleanLogo(file("image/svg+xml", body));
  if (!("body" in result)) throw new Error(result.problem);
  return result.body.toString("utf8");
};

describe("cleanLogo (decision #28, B3 Decision 5)", () => {
  it("keeps a plain SVG drawable, namespace included, so <img> still renders it", () => {
    const out = svgOut('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#b0245e"/></svg>');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain("<circle");
    expect(svgOut('<svg xmlns="http://www.w3.org/2000/svg"/>')).toMatch(/^<svg/); // owner-settings.test.ts's file
  });

  it("writes the SVG back as XML, so a non-breaking space doesn't become HTML's &nbsp; (which <img> can't render)", () => {
    const out = svgOut('<svg xmlns="http://www.w3.org/2000/svg"><text>Ngiti\u00a0Kids &amp; Co</text><circle r="4"/></svg>');
    expect(out).not.toContain("&nbsp;");
    expect(out).toContain("Ngiti\u00a0Kids &amp; Co");
    expect(out).toContain("<circle r=\"4\"/>");
  });

  it("strips script, event handlers, foreignObject and javascript: links, and keeps the drawing", () => {
    const out = svgOut(
      '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script>' +
        '<foreignObject><iframe src="https://example.com"></iframe></foreignObject>' +
        '<a href="javascript:alert(3)"><rect width="4" height="4" onclick="alert(4)"/></a></svg>',
    );
    for (const bad of ["onload", "<script", "alert(", "foreignObject", "iframe", "javascript:", "onclick"]) expect(out).not.toContain(bad);
    expect(out).toContain("<rect");
  });

  it("refuses an SVG with nothing drawable left, and HTML sent as an SVG", () => {
    expect(cleanLogo(file("image/svg+xml", "<script>alert(1)</script>"))).toMatchObject({ status: 400, problem: expect.stringMatching(/PNG/) });
    expect(cleanLogo(file("image/svg+xml", "<html><body><p>hello</p></body></html>"))).toMatchObject({ status: 400 });
  });

  it("checks a PNG's and a JPEG's first bytes against the declared type", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(cleanLogo(file("image/png", png))).toMatchObject({ ext: "png" });
    expect(cleanLogo(file("image/jpeg", Buffer.from([0xff, 0xd8, 0xff, 0xe0])))).toMatchObject({ ext: "jpg" });
    expect(cleanLogo(file("image/png", "GIF89a"))).toEqual({ status: 400, problem: "Choose a PNG, JPG or SVG file" });
    expect(cleanLogo(file("image/png", '<svg xmlns="http://www.w3.org/2000/svg"/>'))).toMatchObject({ status: 400 });
  });

  it("refuses a GIF (400) and a file over 1 MB (413), in the shared rule's words", () => {
    expect(cleanLogo(file("image/gif", "GIF89a"))).toEqual({ status: 400, problem: "Choose a PNG, JPG or SVG file" });
    expect(cleanLogo(file("image/png", Buffer.alloc(1024 * 1024 + 1)))).toEqual({ status: 413, problem: LOGO_TOO_LARGE });
    expect(LOGO_TOO_LARGE).toBe("Logos must be 1 MB or smaller");
  });
});
