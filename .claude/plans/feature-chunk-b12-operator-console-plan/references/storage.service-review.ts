// apps/api/src/storage/storage.service.ts: a clinic's files; the only writer of files and the StoredFile ledger (B10 E5).

private async store(area, ext, body, bytes) {
  const key = clinicKey(this.clinicId(), area, randomUUID(), ext); // clinics/<clinicId>/<area>/<name>.<ext>
  await this.files.put(key, body, { contentType: CONTENT_TYPES[ext], bytes });
  await this.prisma.storedFile.create({ data: { ...clinicData(), key, area, bytes, createdAt: this.clock.now() }, select: { id: true } });
  return key;
}
// IMPORTANT: no limit today ("counted, never limited in B10"). E8 puts the check here, under lockAccount, and writes
// the ledger row BEFORE the file (over-count on a crash, never under-count).

async usedBytes() { /* SUM(StoredFile.bytes) for the context's clinic */ }
// NOTE: clinic-scoped by the tenant extension → the operator's cross-clinic usage needs raw GROUP BY (UsageService).

private clinicId() { /* requireContext().clinicId or TenantScopeError */ }
// IMPORTANT: sign-up files, receipts and the QR have no clinic → PlatformFilesService with platform/<area>/ keys (E2).
// storage.ts:3 already says "B12's sign-up files need a platform area". LocalDiskStorage.link re-parses keys with
// parseKey (clinic shape only) → must accept platform keys too (Step 5.1).
