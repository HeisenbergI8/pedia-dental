/**
 * Tiny real files for the seeded photos (B10 E14): a 1×1 PNG and a one-page PDF. Real bytes, so the API's content
 * sniffing and the browser both accept them. Uint8Array and atob only: this package runs in the browser (MSW) too.
 */
const PNG_1X1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const PDF_1_PAGE =
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
  "3 0 obj<</Type/Page/MediaBox[0 0 200 200]/Parent 2 0 R>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n";

export const SEED_FILES = {
  "image/png": Uint8Array.from(atob(PNG_1X1), (c) => c.charCodeAt(0)),
  "application/pdf": new TextEncoder().encode(PDF_1_PAGE),
} as const;
export type SeedFileType = keyof typeof SEED_FILES;

/** A seeded photo's bytes, or undefined for anything not seeded (an upload). */
export const seedFileOf = (photo: { id: string; contentType: string }): Uint8Array | undefined =>
  photo.id.startsWith("photo_seed_") ? SEED_FILES[photo.contentType as SeedFileType] : undefined;
