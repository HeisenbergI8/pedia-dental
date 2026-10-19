import type { ClinicAccount, StaffCredential } from "@pedia/shared";
import { DEMO_CLINIC_ID, seedPlatform, type Db, type Platform } from "@pedia/seed";
import { clearBlobs } from "./blob-store";

/** The seed and its types live in packages/seed, shared with the API's `prisma db seed`. Re-exported for the mocks. */
export { emptyDb, seedPlatform, type Db, type Platform } from "@pedia/seed";

// v28: privacy (chunk 24): Platform gains `agreements`; each Db gains `privacyNotices` and `acknowledgements`; patients gain consents.
// v29: B10 seeds photos and issued documents (photo_seed_*, doc_seed_*).
// v30: B11: each Db gains `portalAccounts` (every seeded guardian active); parents sign in only while active.
// v31: B12: Platform gains priceChanges, paymentQr and receipts (Ipin's pending receipt); each Db gains storedFiles.
// v32: B13c2b: each Db gains privacyRequests; patients may carry restrictedAt.
const KEY = "pedia-dental:mock-db:v32";

function load(): Platform {
  if (typeof window === "undefined") return seedPlatform();
  const raw = window.localStorage.getItem(KEY);
  if (raw) return JSON.parse(raw) as Platform;
  const fresh = seedPlatform();
  window.localStorage.setItem(KEY, JSON.stringify(fresh));
  return fresh;
}

export const platform: Platform = load();

let clinicId = DEMO_CLINIC_ID;
/**
 * The signed-in account's data. An ESM live binding: `selectTenant` repoints it and every module that imported `db`
 * sees the new value, so a handler can only ever reach its own account's rows. Only `sessionOf` (mocks/access.ts)
 * and the auth handlers call `selectTenant`, and the access gate runs first on every request.
 * NestJS: a `WHERE clinic_id = ?` on every query instead; the HTTP contract is the same.
 */
export let db: Db = platform.tenants[clinicId]!;

export function selectTenant(id: string): Db | undefined {
  const tenant = platform.tenants[id];
  if (tenant) {
    db = tenant;
    clinicId = id;
  }
  return tenant;
}

/** Stamped on every new record. Replaces the hard-coded CLINIC_ID. */
export const currentClinicId = () => clinicId;
export const accountById = (id: string): ClinicAccount | undefined => platform.accounts.find((a) => a.id === id);
/** A staff login's own password, when it has one. Seeded logins have none and sign in with the demo password. */
export const credentialOf = (tenant: Db, staffId: string | undefined): StaffCredential | undefined =>
  staffId ? tenant.staffCredentials.find((c) => c.staffId === staffId) : undefined;
export const currentAccount = (): ClinicAccount => accountById(clinicId)!;

export function persist() {
  if (typeof window === "undefined") return; // handler tests run in Node
  window.localStorage.setItem(KEY, JSON.stringify(platform));
}

export function resetDb() {
  window.localStorage.removeItem(KEY);
  void clearBlobs().finally(() => window.location.reload());
}
