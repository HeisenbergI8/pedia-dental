import { PhotoType, type ClinicalPhoto } from "../schemas/photo";

type Groupable = Pick<ClinicalPhoto, "id" | "visitId" | "takenOn" | "type">;
export type PhotoGroup<P extends Groupable> = {
  visitId?: string; // undefined: "Not linked to a visit"
  days: { date: string; types: { type: PhotoType; photos: P[] }[] }[];
};

/** Patient → visit → date → type (ROADMAP feature 12). Visits newest first by `visitDate`, unlinked last; dates newest first. */
export function groupPhotos<P extends Groupable>(photos: P[], visitDate: (visitId: string) => string | undefined): PhotoGroup<P>[] {
  const byVisit = new Map<string, P[]>();
  for (const p of photos) byVisit.set(p.visitId ?? "", [...(byVisit.get(p.visitId ?? "") ?? []), p]);
  const order = ([a]: [string, P[]], [b]: [string, P[]]) =>
    Number(a === "") - Number(b === "") || (visitDate(b) ?? "").localeCompare(visitDate(a) ?? "");
  return [...byVisit].sort(order).map(([visitId, inVisit]) => {
    const dates = [...new Set(inVisit.map((p) => p.takenOn))].sort().reverse();
    return {
      visitId: visitId || undefined,
      days: dates.map((date) => ({
        date,
        types: PhotoType.options
          .map((type) => ({ type, photos: inVisit.filter((p) => p.takenOn === date && p.type === type) }))
          .filter((t) => t.photos.length > 0),
      })),
    };
  });
}

export const PDF = "application/pdf";
export const isPdf = (contentType: string) => contentType === PDF;

/** How long a private link to a file stays valid, in seconds (B10 decision 3). The API answers a file read with a 302 to one. */
export const FILE_LINK_SECONDS = 300;

const EXTENSION: Record<string, string> = { "image/png": "png", "image/webp": "webp", [PDF]: "pdf" };

/**
 * The name a saved clinical file gets, never the record id: "mendoza-bea-intraoral-74-2026-10-02.jpg". The mock and the
 * API both name files with it (Content-Disposition). Any other image type saves as `.jpg`, as the demo always did.
 */
export function photoFileName(patient: { lastName: string; firstName: string }, photo: Pick<ClinicalPhoto, "type" | "tooth" | "takenOn" | "contentType">): string {
  const name = [patient.lastName, patient.firstName, photo.type, photo.tooth, photo.takenOn]
    .filter(Boolean)
    .join("-")
    .replace(/[^\w.-]+/g, "-")
    .toLowerCase();
  return `${name}.${EXTENSION[photo.contentType] ?? "jpg"}`;
}

/** Upload rules as data. PDFs only where a paper document is expected (a clearance, a lab result, a referral). */
export const UPLOAD_RULES = { maxBytes: 10 * 1024 * 1024, pdfTypes: ["document", "referral"] as PhotoType[] };

/** Why this file can't be uploaded as `type`, in plain words. Undefined when it can. Server and form use the same rule. */
export function uploadProblem(type: PhotoType, file: { type: string; size: number }): string | undefined {
  const pdfOk = UPLOAD_RULES.pdfTypes.includes(type);
  if (!file.type.startsWith("image/") && !(pdfOk && isPdf(file.type))) return pdfOk ? "Attach a photo or a PDF" : "Attach an image file";
  if (file.size > UPLOAD_RULES.maxBytes) return "Files must be under 10 MB";
  return undefined;
}
