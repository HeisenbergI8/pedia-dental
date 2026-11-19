import { describe, expect, it } from "vitest";
import { jpegOf, pngOf } from "../../test/support/images";
import { LOGO_TOO_LARGE, cleanLogo, sanitizeSvg } from "./logo";

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

  it("drops <style>, <image> and every link or url() that leaves the SVG, keeping #fragment ones (D #31)", () => {
    const out = svgOut(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
        '<style>@import url(https://evil.example/a.css); rect { fill: url(https://evil.example/p.svg#x) }</style>' +
        '<defs><linearGradient id="g"><stop offset="0" stop-color="#b0245e"/></linearGradient><linearGradient id="h" xlink:href="#g"/><linearGradient id="i" href="https://evil.example/g.svg#g"/></defs>' +
        '<image href="https://evil.example/track.png" width="1" height="1"/><image xlink:href="data:image/png;base64,AAAA"/>' +
        '<a href="#top"><circle r="1"/></a><a xlink:href="other.svg#dot"><circle r="2"/></a>' +
        '<a href="https://evil.example/"><rect width="4" height="4" fill="url(#g)"/></a>' +
        '<rect width="2" height="2" fill="url(https://evil.example/f.svg#p)" style="fill: url(\'//evil.example/x\')"/>' +
        '<filter id="f"><feImage href="https://evil.example/i.png"/></filter></svg>',
    );
    for (const bad of ["<style", "@import", "<image", "feImage", "evil.example", "data:image", "other.svg"]) expect(out).not.toContain(bad);
    expect(out).toContain('href="#top"');
    expect(out).toContain('xlink:href="#g"');
    expect(out).toContain('fill="url(#g)"');
    expect(out).toContain("<linearGradient");
  });

  it("refuses a PNG or JPEG over 8000 px a side, and takes one at the limit (D #30)", () => {
    expect(cleanLogo(file("image/png", pngOf(8000, 400)))).toMatchObject({ ext: "png" });
    expect(cleanLogo(file("image/png", pngOf(8001, 400)))).toEqual({ status: 400, problem: expect.stringMatching(/8001 × 400 pixels.*at most 8000/) });
    expect(cleanLogo(file("image/jpeg", jpegOf(300, 30_000)))).toEqual({ status: 400, problem: expect.stringMatching(/300 × 30000 pixels/) });
  });

  it("refuses a GIF (400) and a file over 1 MB (413), in the shared rule's words", () => {
    expect(cleanLogo(file("image/gif", "GIF89a"))).toEqual({ status: 400, problem: "Choose a PNG, JPG or SVG file" });
    expect(cleanLogo(file("image/png", Buffer.alloc(1024 * 1024 + 1)))).toEqual({ status: 413, problem: LOGO_TOO_LARGE });
    expect(LOGO_TOO_LARGE).toBe("Logos must be 1 MB or smaller");
  });

  it("drops inline style and escaped or image-set URLs (verification of #31)", () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:red" mask="u\\72l(https://evil/p.svg#p)" fill="image-set(&quot;https://evil/i.png&quot; 1x)" width="1" height="1"/></svg>')!;
    expect(out).not.toMatch(/style=|evil|image-set/);
    expect(out).toContain("<rect");
  });
});
