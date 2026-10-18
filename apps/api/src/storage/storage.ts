import type { Readable } from "node:stream";

/** Where a clinic's files are grouped. B4: a child's own photo; B10: clinical photos (documents store no file, decision 6). B12's platform files use platformKey. */
export const STORAGE_AREAS = ["branding", "patients", "photos"] as const;
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

/** B12: Primolar's own files, outside every clinic: sign-up logos and images, receipts, the payment QR (E2). */
export const PLATFORM_AREAS = ["signups", "receipts", "payment-qr"] as const;
export type PlatformArea = (typeof PLATFORM_AREAS)[number];
const PLATFORM_KEY = /^platform\/([a-z-]+)\/([A-Za-z0-9_-]{1,64})\.([a-z]+)$/;

/** `platform/<area>/<name>.<ext>`: never a clinic key, so StorageService can't be handed one (nor the reverse). */
export function platformKey(area: PlatformArea, name: string, ext: FileExtension): string {
  if (!SEGMENT.test(name)) throw new Error("A storage key segment has characters that aren't allowed.");
  return `platform/${area}/${name}.${ext}`;
}

/** The parts of a well-formed platform key, or undefined (a clinic key, traversal, an unknown area or extension). */
export function parsePlatformKey(key: string): { area: PlatformArea; name: string; ext: FileExtension } | undefined {
  const match = PLATFORM_KEY.exec(key);
  if (!match || !(PLATFORM_AREAS as readonly string[]).includes(match[1]!) || !Object.hasOwn(CONTENT_TYPES, match[3]!)) return undefined;
  return { area: match[1] as PlatformArea, name: match[2]!, ext: match[3] as FileExtension };
}

/** What a driver needs to store a file: S3 wants the length up front, and the type is served back. */
export type PutInfo = { contentType: string; bytes: number };
/** A private link's terms (E2). `fileName` is already safe for a header (photoFileName). */
export type LinkOptions = { contentType: string; fileName: string; download: boolean; expiresInSeconds: number };

/**
 * Where bytes live (CONVENTIONS → Side effects: files go to object storage). Drivers know nothing of clinics:
 * StorageService builds and checks every key. LocalDiskStorage (development, tests, one-server demos) and S3FileStorage (B10).
 */
export abstract class FileStorage {
  /** A Buffer for small files from memory (the logo); a Readable for a checked upload's temp file (E1). */
  abstract put(key: string, body: Buffer | Readable, info: PutInfo): Promise<void>;
  /** Undefined when there is no such file. Only for the logo, which the API serves itself (E3); everything else is a link. */
  abstract get(key: string): Promise<Buffer | undefined>;
  /** A private URL that serves the file for `expiresInSeconds`. Doesn't check that the file exists. */
  abstract link(key: string, options: LinkOptions): Promise<string>;
  /** Succeeds when there is no such file. */
  abstract delete(key: string): Promise<void>;
}
