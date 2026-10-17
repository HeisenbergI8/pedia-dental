import { DEMO_PASSWORD, OPERATORS, SEED_FILES, allAccounts, demoAccounts, demoLogins, staffEmail, type Platform, type SeedFileType } from "@pedia/seed";
import { smsSegments } from "@pedia/shared";
import { requestContext } from "../common/request-context";
import type { Env } from "../config/env";
import type { PrismaService } from "../prisma/prisma.service";
import type { Hasher } from "../auth/hashing";
import { appointmentData } from "../appointments/appointment.rows";
import { requestData } from "../appointments/request.rows";
import { chartEntryRow } from "../chart/chart.rows";
import { growthRow } from "../growth/growth.rows";
import { noteRow } from "../notes/note.rows";
import { patientRows } from "../patients/patient.rows";
import { planItemRow } from "../plan/plan.rows";
import { invoiceRows, paymentRows, receiptCounters } from "../billing-records/billing.rows";
import { dueItemData } from "../recalls/due-item.rows";
import { MESSAGE_SEND, messageData } from "../message-queue/message.rows";
import { manilaDate } from "../common/clock";
import { visitRow } from "../visits/visit.rows";
import { photoData } from "../photos/photo.rows";
import { documentData } from "../documents/document.rows";
import { CONTENT_TYPES, clinicKey, type FileExtension, type FileStorage } from "../storage/storage";

export class SeedRefused extends Error {
  override name = "SeedRefused";
}

/** Demo data only on a demo deployment, and never on top of real data. */
export function assertSeedAllowed(env: Pick<Env, "DEMO_LOGINS">, existingAccounts: number): void {
  if (!env.DEMO_LOGINS) throw new SeedRefused("Refusing to seed: set DEMO_LOGINS=true (demo deployments only).");
  if (existingAccounts > 0) {
    throw new SeedRefused(`Refusing to seed: ${existingAccounts} clinic account(s) already exist. Reset first (prisma migrate reset).`);
  }
}

const dateOnly = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

/**
 * Writes `seedPlatform()`'s identity data and each clinic's setup: accounts, branches, staff, every login's credentials
 * (argon2id), notices, acknowledgements, agreements, the operator, the login page's DemoLogin rows, and (B3) chairs,
 * procedures, note templates and message templates. Clinic rows are written inside that clinic's request context, so
 * the tenant extension stamps and checks them (awaited inside, CONVENTIONS → Traps). `position` keeps the mock's array
 * order. B4 adds patients, B5 their visits and chart entries, B6 notes, growth records and plan items; the rest arrive
 * with their chunks.
 */
/**
 * `files`: where seeded photo bytes go (prisma/seed.ts passes fileStorageOf(env)). Omitted (most integration tests), the
 * photo rows are still written and their files aren't: opening one then 404s at the link, which those tests never do.
 */
export async function seedDatabase(prisma: PrismaService, hasher: Hasher, env: Pick<Env, "DEMO_LOGINS">, platform: Platform, files?: FileStorage): Promise<void> {
  assertSeedAllowed(env, await prisma.clinicAccount.count());
  // Every demo login shares the public demo password: hash it once (argon2 is slow on purpose).
  const demoHash = await hasher.hash(DEMO_PASSWORD);
  const featured = new Set(demoLogins(platform).map((l) => l.email));

  await prisma.clinicAccount.createMany({
    data: platform.accounts.map(({ id, name, logoRef, contactEmail, tin, tier, status, brandColor, headingFont }) => ({
      id, name, logoRef, contactEmail, tin, tier, status, brandColor, headingFont,
    })),
  });
  await prisma.agreement.createMany({
    data: platform.agreements.map(({ signedOn, at, ...a }) => ({ ...a, at: new Date(at), signedOn: signedOn ? dateOnly(signedOn) : null })),
  });
  await prisma.operatorUser.createMany({ data: OPERATORS.map((o) => ({ ...o, passwordHash: demoHash })) });

  for (const { id: clinicId } of platform.accounts) {
    const db = platform.tenants[clinicId]!;
    const credentials = await Promise.all(
      allAccounts(db).map(async (a) => {
        const own = a.staffId ? db.staffCredentials.find((c) => c.staffId === a.staffId) : undefined;
        const pin = a.staffId ? db.staffPins.find((p) => p.staffId === a.staffId) : undefined;
        return {
          clinicId, accountId: a.id, email: a.email, staffId: a.staffId ?? null, guardianId: a.guardianId ?? null, name: a.name,
          passwordHash: own ? await hasher.hash(own.password) : demoHash,
          mustChange: own?.mustChange ?? false,
          pinHash: pin ? await hasher.hash(pin.pin) : null,
          pinFailedAt: pin?.failedAt ?? [],
        };
      }),
    );
    await prisma.credential.createMany({ data: credentials });
    await prisma.demoLogin.createMany({
      data: demoAccounts(db).map((a, position) => ({
        clinicId, accountId: a.id, role: a.role, name: a.name, email: a.email, summary: a.summary, pin: a.pin ?? null, position,
        featured: featured.has(a.email),
      })),
    });

    await requestContext.run({ requestId: `seed-${clinicId}`, clinicId, operator: false }, async () => {
      await prisma.branch.createMany({ data: db.branches.map(({ id, name, address, phone, openingHours, archived }, position) => ({ id, clinicId, name, address, phone, openingHours, archived, position })) });
      await prisma.staff.createMany({
        data: db.staff.map((s, position) => ({
          id: s.id, clinicId, fullName: s.fullName, role: s.role, alsoRoles: s.alsoRoles ?? [], isOwner: s.isOwner ?? false,
          branchIds: s.branchIds, licenseNo: s.licenseNo ?? null, email: staffEmail(s), deactivatedAt: s.deactivatedAt ? new Date(s.deactivatedAt) : null, position,
        })),
      });
      await prisma.privacyNotice.createMany({ data: db.privacyNotices.map(({ at, ...n }) => ({ ...n, at: new Date(at) })) });
      await prisma.acknowledgement.createMany({ data: db.acknowledgements.map(({ at, ...a }) => ({ ...a, at: new Date(at) })) });
      // B3: what the clinic configures. The seed's own clinicId on these records is ignored (PROCEDURES say clinic_demo).
      await prisma.chair.createMany({ data: db.chairs.map(({ id, branchId, name }, position) => ({ id, clinicId, branchId, name, position })) });
      await prisma.procedure.createMany({
        data: db.procedures.map(({ code, name, defaultDurationMin, fee, perTooth }, position) => ({ clinicId, code, name, defaultDurationMin, fee, perTooth, position })),
      });
      await prisma.noteTemplate.createMany({ data: db.noteTemplates.map(({ id, name, procedure, fields }, position) => ({ clinicId, id, name, procedure, fields, position })) });
      await prisma.messageTemplate.createMany({
        data: db.messageTemplates.map(({ kind, name, body, updatedAt }, position) => ({ clinicId, kind, name, body, updatedAt: new Date(updatedAt), position })),
      });
      // B4: every child, their guardians, consents and privacy choices, with the seed's ids (hybrid needs them: MSW's
      // visits, invoices and appointments name these patient ids).
      const rows = db.patients.map(patientRows);
      await prisma.patient.createMany({ data: rows.map((r) => ({ ...r.patient, clinicId })) });
      await prisma.patientGuardian.createMany({ data: rows.flatMap((r) => r.guardians.map((g) => ({ ...g, clinicId }))) });
      await prisma.patientConsent.createMany({ data: rows.flatMap((r) => r.consents.map((c) => ({ ...c, clinicId }))) });
      await prisma.patientPrivacyConsent.createMany({ data: rows.flatMap((r) => (r.privacyConsent ? [{ ...r.privacyConsent, clinicId }] : [])) });
      await prisma.privacyChoice.createMany({ data: rows.flatMap((r) => r.choices.map((c) => ({ ...c, clinicId }))) });
      // B5: every visit and chart entry, with the seed's ids: MSW's notes, growth records and plan items in `hybrid` name
      // these visit and entry ids. All completed: the seed leaves no visit in progress.
      await prisma.visit.createMany({ data: db.visits.map((v) => ({ ...visitRow(v), clinicId })) });
      await prisma.chartEntry.createMany({ data: db.chartEntries.map((e) => ({ ...chartEntryRow(e), clinicId })) });
      // B6: with the seed's ids. MSW's documents (sourceId) name them in `hybrid` until B10. Every seeded note is signed; the example plan is 3 of 6 done.
      await prisma.clinicalNote.createMany({ data: db.notes.map((n) => ({ ...noteRow(n), clinicId })) });
      await prisma.growthRecord.createMany({ data: db.growth.map((g) => ({ ...growthRow(g), clinicId })) });
      await prisma.planItem.createMany({ data: db.planItems.map((i) => ({ ...planItemRow(i), clinicId })) });
      // B7: with the seed's ids, so MSW's records and the API's agree in `hybrid` (the portal's appointments, MSW's
      // recall messages naming due_<noteId>). A due item's visit is its source note's (E6).
      await prisma.appointment.createMany({ data: db.appointments.map((a) => ({ ...appointmentData(a), clinicId })) });
      await prisma.appointmentRequest.createMany({ data: db.appointmentRequests.map((q) => ({ ...requestData(q), clinicId })) });
      const visitOf = new Map(db.notes.map((n) => [n.id, n.visitId]));
      await prisma.dueItem.createMany({ data: db.dueItems.map((i) => ({ ...dueItemData(i, visitOf.get(i.sourceNoteId)!), clinicId })) });
      // B8: bills and payments with the seed's ids and receipt numbers (MSW's records and the API's agree in `hybrid`),
      // and each series' counter at its last number, so the next receipt follows the seed's (E3).
      const bills = db.invoices.map(invoiceRows);
      await prisma.invoice.createMany({ data: bills.map((b) => ({ ...b.invoice, clinicId })) });
      await prisma.invoiceLine.createMany({ data: bills.flatMap((b) => b.lines.map((l) => ({ ...l, clinicId }))) });
      await prisma.payment.createMany({ data: paymentRows(db.payments).map((p) => ({ ...p, clinicId })) });
      await prisma.receiptCounter.createMany({ data: receiptCounters(db.payments).map((c) => ({ ...c, clinicId })) });
      // B9: the message log with the seed's ids. A `sent` row counts in the month it went (E10); a `queued` one gets its
      // outbox row, so a demo deployment's worker sends it through the log driver when it falls due (E2).
      await prisma.message.createMany({
        data: db.messages.map((m) =>
          messageData(m, {
            greetingYear: m.kind === "birthday" ? Number(manilaDate(new Date(m.createdAt)).slice(0, 4)) : null,
            ...(m.status === "sent" ? { sentAt: new Date(m.sendAt), segments: smsSegments(m.body) } : {}),
          }),
        ),
      });
      const now = new Date();
      await prisma.outboxMessage.createMany({
        data: db.messages
          .filter((m) => m.status === "queued")
          .map((m) => ({ clinicId, kind: MESSAGE_SEND, payload: { messageId: m.id }, availableAt: new Date(m.sendAt), createdAt: now })),
      });
      // B10: photos with their files, and the issued-documents log, with the seed's ids (MSW's and the API's agree in
      // `hybrid`). Keys are built here, as StorageService would, because the seed has no request; the ledger (E5) gets a
      // row per stored file.
      const EXT: Record<SeedFileType, FileExtension> = { "image/png": "png", "application/pdf": "pdf" };
      const photos = db.photos.map((p) => {
        const ext = EXT[p.contentType as SeedFileType];
        return { photo: p, ext, key: clinicKey(clinicId, "photos", p.id, ext), body: SEED_FILES[p.contentType as SeedFileType] };
      });
      if (files) {
        for (const { key, ext, body } of photos) await files.put(key, Buffer.from(body), { contentType: CONTENT_TYPES[ext], bytes: body.length });
        await prisma.storedFile.createMany({ data: photos.map(({ key, body }) => ({ clinicId, key, area: "photos", bytes: body.length, createdAt: now })) });
      }
      await prisma.clinicalPhoto.createMany({
        data: photos.map(({ photo: p, key, ext, body }) => ({
          ...photoData(p), id: p.id, clinicId, patientId: p.patientId, contentType: CONTENT_TYPES[ext],
          uploadedBy: p.uploadedBy ?? "staff", fileKey: key, bytes: body.length, createdAt: new Date(p.createdAt),
        })),
      });
      await prisma.patientDocument.createMany({
        data: db.documents.map((d) => ({ ...documentData(d), id: d.id, clinicId, patientId: d.patientId, title: d.title, createdAt: new Date(d.createdAt) })),
      });
    });
  }
}
