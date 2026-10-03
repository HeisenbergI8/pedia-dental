import type { DocContent } from "./content";

/** Builds the PDF in the browser and saves it. react-pdf (~1 MB) loads on the first download, not with the page. */
export async function downloadPdf(content: DocContent): Promise<void> {
  const [{ pdf }, { documentPdf }] = await Promise.all([import("@react-pdf/renderer"), import("./components/document-pdf")]);
  const blob = await pdf(documentPdf(content)).toBlob();
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href, download: content.fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000); // Safari needs the URL alive while the save starts
}
