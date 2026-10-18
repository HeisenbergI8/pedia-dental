import { TIER_LIMITS, accountUsage, smsSegments, storageRefusal, type ClinicAccount, type ClinicUsage, type Tier } from "@pedia/shared";
import type { Db, StoredFileRecord } from "@pedia/seed";

/*
 * B12 decisions 1–3, 16–19: storage and text allowances. Pure over the Db passed in, so the operator's handlers (which
 * never read the per-request binding) can use them too.
 */

/** Bytes stored toward the plan's storage (decision 16: photos, documents, patient photos, the logo). */
export const storedBytes = (tenant: Db) => tenant.storedFiles.reduce((n, f) => n + f.bytes, 0);

export function recordStored(tenant: Db, key: string, area: StoredFileRecord["area"], bytes: number): void {
  forgetStored(tenant, key);
  tenant.storedFiles.push({ key, area, bytes });
}

export function forgetStored(tenant: Db, key: string | undefined): void {
  if (key) tenant.storedFiles = tenant.storedFiles.filter((f) => f.key !== key);
}

/** The refusal when this upload would pass the plan's storage (decision 1), else undefined. */
export const storageRefused = (tenant: Db, tier: Tier, adding: number) => storageRefusal(tier, storedBytes(tenant), adding);

/** A timestamp's Manila month ("2026-10"): Manila is UTC+8 all year. */
export const manilaMonthOf = (iso: string) => new Date(Date.parse(iso) + 8 * 3_600_000).toISOString().slice(0, 7);

/**
 * Billed parts of the texts in `month` (decision 18). The mock never sends, so it counts what it queued or marked
 * sent; the API counts what it handed to the provider (B12 E9).
 */
export const textPartsUsed = (tenant: Db, month: string) =>
  tenant.messages.filter((m) => (m.status === "queued" || m.status === "sent") && manilaMonthOf(m.sendAt) === month).reduce((n, m) => n + smsSegments(m.body), 0);

/** GET /clinic/usage and the console's overview (decision 17). */
export function usageOf(tenant: Db, account: Pick<ClinicAccount, "tier">, month: string): ClinicUsage {
  const { tier } = account;
  const inUse = accountUsage(tenant);
  return {
    tier,
    branches: { inUse: inUse.branches, limit: TIER_LIMITS[tier].branches },
    staffLogins: { inUse: inUse.staffLogins, limit: TIER_LIMITS[tier].staffLogins },
    storage: { inUse: storedBytes(tenant), limit: TIER_LIMITS[tier].storageBytes },
    texts: { inUse: textPartsUsed(tenant, month), limit: TIER_LIMITS[tier].textParts },
    month,
  };
}
