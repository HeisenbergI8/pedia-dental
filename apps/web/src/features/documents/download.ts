import type { DocContent } from "./content";

/**
 * The logo as a PNG data URL for react-pdf, which can't draw SVG. Drawn through <img> (same origin, the session cookie
 * goes with it), at twice the printed size. Undefined when there is no logo or it won't load: the name prints instead.
 */
async function pdfLogo(url: string | null): Promise<string | undefined> {
  if (!url) return undefined;
  try {
    const img = Object.assign(new Image(), { src: url });
    await img.decode();
    const w = img.naturalWidth || 600; // an SVG without width/height reports 0 in some browsers
    const h = img.naturalHeight || 150;
    const scale = Math.min(1, 600 / w);
    const canvas = Object.assign(document.createElement("canvas"), { width: Math.round(w * scale), height: Math.round(h * scale) });
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } catch {
    return undefined;
  }
}

/** Builds the PDF in the browser and saves it. react-pdf (~1 MB) loads on the first download, not with the page. */
export async function downloadPdf(content: DocContent): Promise<void> {
  const [{ pdf }, { documentPdf }, logo] = await Promise.all([
    import("@react-pdf/renderer"),
    import("./components/document-pdf"),
    pdfLogo(content.letterhead.logoUrl),
  ]);
  const blob = await pdf(documentPdf(content, logo)).toBlob();
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href, download: content.fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000); // Safari needs the URL alive while the save starts
}
