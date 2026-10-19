import { Injectable } from "@nestjs/common";
import { isDueItemOpen, type Appointment, type DueItem } from "@pedia/shared";
import { AppointmentRecordsService } from "../appointments/appointment-records.service";
import { PatientRestrictions } from "../auth/patient-restrictions";
import { PrismaService } from "../prisma/prisma.service";
import { clinicData } from "../prisma/tenant-scope";
import type { Tx } from "../prisma/transaction";
import { VisitsService } from "../visits/visits.service";
import { DUE_COLUMNS, DUE_ORDER, toDueItem, type DueRow } from "./due-item.rows";
import { bookedItem, dueBackfill, signChange, type SignedNote } from "./due-item.rules";

/** Owns DueItem (features/recalls/mocks.ts). Created by signing, taken by booking, open is computed (isDueItemOpen). */
@Injectable()
export class DueItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly appointments: AppointmentRecordsService,
    private readonly visits: VisitsService,
    private readonly restrictions: PatientRestrictions,
  ) {}

  /** GET /due-items: open ones, soonest first, each with its visit's dentist; a restricted child's left out (B13c2b E7). Not audited (decision 6). */
  async list(): Promise<DueItem[]> {
    const restricted = [...(await this.restrictions.restricted())];
    const rows = await this.prisma.dueItem.findMany({ where: { closedAt: null, patientId: { notIn: restricted } }, select: DUE_COLUMNS, orderBy: DUE_ORDER });
    const open = await this.openOf(rows);
    const dentists = await this.visits.dentistsOf(open.map((r) => r.visitId));
    return open.map((r) => toDueItem(r, dentists.get(r.visitId)));
  }

  /** The unclosed items of some patients that are open (the patient list's standing). */
  async openFor(patientIds: readonly string[], tx: Tx = this.prisma): Promise<DueItem[]> {
    if (!patientIds.length) return [];
    const rows = await tx.dueItem.findMany({ where: { patientId: { in: [...patientIds] }, closedAt: null }, select: DUE_COLUMNS, orderBy: DUE_ORDER });
    return (await this.openOf(rows, tx)).map((r) => toDueItem(r));
  }

  /** Whose item this is (the recall text's lookup before its transaction, B6 decision 3); undefined if unknown. */
  async patientOf(id: string): Promise<string | undefined> {
    return (await this.prisma.dueItem.findFirst({ where: { id }, select: { patientId: true } }))?.patientId;
  }

  /** The item and whether it is still open, over every appointment of its child (the mock's isDueItemOpen call). */
  async openState(tx: Tx, id: string): Promise<{ item: DueItem; open: boolean } | undefined> {
    const row = await tx.dueItem.findFirst({ where: { id }, select: DUE_COLUMNS });
    if (!row) return undefined;
    const item = toDueItem(row);
    return { item, open: isDueItemOpen(item, await this.appointments.forPatients([row.patientId], {}, tx)) };
  }

  /** Signing (NotesService.sign, in its transaction, under the patient's lock): close and open (signChange). */
  async afterSign(tx: Tx, note: { id: string; patientId: string; visitId: string; values: Record<string, unknown> }, procedure: string, visitDate: string, now: Date): Promise<void> {
    const items = (await tx.dueItem.findMany({ where: { patientId: note.patientId, procedure, closedAt: null }, select: DUE_COLUMNS })).map((r) => toDueItem(r));
    const change = signChange(procedure, visitDate, note.values, items);
    if (!change.open) return;
    // `now` is the note's signedAt: the mock closes and creates at that instant (notes/mocks.ts:89–95).
    if (change.close.length) await tx.dueItem.updateMany({ where: { id: { in: change.close } }, data: { closedAt: now } });
    await tx.dueItem.create({ data: { ...clinicData(), ...change.open, dueOn: new Date(`${change.open.dueOn}T00:00:00.000Z`), patientId: note.patientId, sourceNoteId: note.id, visitId: note.visitId, createdAt: now } });
  }

  /** Booking from the due list (AppointmentsService.book, in its transaction, under the patient's lock). */
  async takeFor(tx: Tx, booked: Appointment): Promise<void> {
    if (!booked.sourceRuleId) return;
    const items = (await tx.dueItem.findMany({ where: { patientId: booked.patientId, ruleId: booked.sourceRuleId, closedAt: null }, select: DUE_COLUMNS })).map((r) => toDueItem(r));
    const appointments = await this.appointments.forPatients([booked.patientId], {}, tx); // the new one too, as the mock
    const item = bookedItem(booked.patientId, booked.sourceRuleId, items, appointments);
    if (item) await tx.dueItem.update({ where: { id: item.id }, data: { appointmentId: booked.id } });
  }

  /** The backfill (E8) for the signed-in clinic: one transaction per clinic. Returns how many items it created. */
  async backfill(tx: Tx, notes: SignedNote[]): Promise<number> {
    const items = (await tx.dueItem.findMany({ select: DUE_COLUMNS })).map((r) => toDueItem(r));
    const sources = new Set(items.map((i) => i.sourceNoteId));
    const plan = dueBackfill(notes, items, (id) => sources.has(id));
    for (const { note, close, create } of plan) {
      if (close.length) await tx.dueItem.updateMany({ where: { id: { in: close } }, data: { closedAt: new Date(note.signedAt) } });
      await tx.dueItem.create({ data: { ...clinicData(), ...create, dueOn: new Date(`${create.dueOn}T00:00:00.000Z`), createdAt: new Date(create.createdAt) } });
    }
    return plan.length;
  }

  /** isDueItemOpen over the appointments it can depend on: done ones (closedBy) and the ones the items name. */
  private async openOf(rows: DueRow[], tx: Tx = this.prisma): Promise<DueRow[]> {
    const patients = [...new Set(rows.map((r) => r.patientId))];
    const named = rows.flatMap((r) => (r.appointmentId ? [r.appointmentId] : []));
    const appointments = await this.appointments.forPatients(patients, { OR: [{ status: "done" }, { id: { in: named } }] }, tx);
    return rows.filter((r) => isDueItemOpen(toDueItem(r), appointments));
  }
}
