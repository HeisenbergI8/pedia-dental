/** Saves a file the app built in the browser (a PDF, a copy of records). The only place that clicks a download link. */
export function saveFile(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement("a"), { href, download: fileName });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 60_000); // Safari needs the URL alive while the save starts
}
