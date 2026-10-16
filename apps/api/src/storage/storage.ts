/** Where a clinic's files are grouped. B10 adds "photos" and "documents"; B12's sign-up files need a platform area. */
export const STORAGE_AREAS = ["branding"] as const;
export type StorageArea = (typeof STORAGE_AREAS)[number];

/** Extension → content type. A key's extension decides how its file is served; no other extension is stored. */
export const CONTENT_TYPES = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", svg: "image/svg+xml", pdf: "application/pdf" } as const;
export type FileExtension = keyof typeof CONTENT_TYPES;

/** A clinic id or file name: cuid2, the seed's `clinic_bulilit`, a UUID. Nothing a path could escape with. */
const SEGMENT = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^clinics\/([A-Za-z0-9_-]{1,64})\/([a-z]+)\/([A-Za-z0-9_-]{1,64})\.([a-z]+)$/;

/** `clinics/<clinicId>/<area>/<name>.<ext>`: every clinic file's key (B10: "keys scoped by clinic"). */
export function clinicKey(clinicId: string, area: StorageArea, name: string, ext: FileExtension): string {
  if (!SEGMENT.test(clinicId) || !SEGMENT.test(name)) throw new Error("A storage key segment has characters that aren't allowed.");
  return `clinics/${clinicId}/${area}/${name}.${ext}`;
}

/** The parts of a well-formed clinic key, or undefined for anything else (traversal, unknown extension, other shapes). */
export function parseKey(key: string): { clinicId: string; area: string; name: string; ext: FileExtension } | undefined {
  const match = KEY.exec(key);
  if (!match || !Object.hasOwn(CONTENT_TYPES, match[4]!)) return undefined;
  return { clinicId: match[1]!, area: match[2]!, name: match[3]!, ext: match[4] as FileExtension };
}

/**
 * Where bytes live (CONVENTIONS → Side effects: files go to object storage). Drivers know nothing of clinics:
 * StorageService builds and checks every key. LocalDiskStorage now; B10's S3/R2 driver adds presigned URLs to this class.
 */
export abstract class FileStorage {
  abstract put(key: string, body: Buffer): Promise<void>;
  /** Undefined when there is no such file. */
  abstract get(key: string): Promise<Buffer | undefined>;
  /** Succeeds when there is no such file. */
  abstract delete(key: string): Promise<void>;
}
