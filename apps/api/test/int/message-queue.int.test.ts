import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import { composeMessage, reminderSendAt, type Patient } from "@pedia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { FixedClock } from "../../src/common/clock";
import { Hasher } from "../../src/auth/hashing";
import { MESSAGE_SEND } from "../../src/message-queue/message.rows";
import { MessageQueueService } from "../../src/message-queue/message-queue.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { runInTransaction, type Tx } from "../../src/prisma/transaction";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
const clinicName = platform.accounts.find((a) => a.id === DEMO_CLINIC_ID)!.name;
const at = (local: string) => new Date(`${local}+08:00`); // Manila wall time
const clock = new FixedClock(at("2026-10-20T14:00:00"));
let app: INestApplication;
let prisma: PrismaService;
let queue: MessageQueueService;

/** A seeded child with a mobile number and nothing declined, and its texts emptied for each case. */
const child = db.patients.find((p) => !p.privacyChoices?.some((c) => !c.reminders) && /^09\d{9}$/.test(p.guardians.find((g) => g.isPrimary)!.phone))!;
const booking = { id: "appt_q1", patientId: child.id, dentistId: "staff_reyes", procedureCode: "extraction", startsAt: at("2026-10-23T10:30:00").toISOString() };
const inTx = <T>(fn: (tx: Tx) => Promise<T>) => inClinic(DEMO_CLINIC_ID, () => runInTransaction(prisma, fn));
/** One fixed clock gives every row the same createdAt: order by kind (confirmation, reminder, pre_treatment). */
const rows = () => inClinic(DEMO_CLINIC_ID, () => prisma.message.findMany({ where: { patientId: child.id }, orderBy: [{ kind: "asc" }, { sendAt: "asc" }] }));
const outboxFor = async (ids: string[]) =>
  (await prisma.outboxMessage.findMany({ where: { kind: MESSAGE_SEND } })).filter((o) => ids.includes((o.payload as { messageId: string }).messageId));

beforeAll(async () => {
  app = await createIntApp({ clock });
  prisma = app.get(PrismaService);
  queue = app.get(MessageQueueService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
});
afterAll(() => app.close());
beforeEach(async () => {
  clock.set(at("2026-10-20T14:00:00"));
  await inClinic(DEMO_CLINIC_ID, () => prisma.message.deleteMany({ where: { patientId: child.id } }));
});

describe("the message queue on MySQL", () => {
  it("queues the booking set, rendered as the mock renders it, each with its outbox row at its sendAt", async () => {
    await inTx((tx) => queue.queueBooking(tx, booking, child));
    const texts = await rows();
    const now = clock.now().toISOString();
    const remind = reminderSendAt(booking.startsAt, clock.now());
    expect(texts.map((m) => [m.kind, m.sendAt.toISOString(), m.status])).toEqual([
      ["appointment_confirmation", now, "queued"],
      ["appointment_reminder", remind, "queued"],
      ["pre_treatment", remind, "queued"],
    ]);
    const refs = { templates: db.messageTemplates, patients: db.patients, staff: db.staff, clinicName };
    for (const m of texts) {
      const e = { kind: m.kind, patientId: child.id, sendAt: m.sendAt.toISOString(), appointmentId: booking.id, startsAt: booking.startsAt, dentistId: booking.dentistId };
      expect(m.body).toBe(composeMessage(e, refs, { id: "x", clinicId: DEMO_CLINIC_ID, createdAt: now })!.body);
    }
    const outbox = await outboxFor(texts.map((m) => m.id));
    expect(outbox.map((o) => o.availableAt.toISOString()).sort()).toEqual(texts.map((m) => m.sendAt.toISOString()).sort());

    // Booked for tomorrow at 10:30 after 9 AM today's reminder time has passed: the reminder goes now.
    await inTx((tx) => queue.queueBooking(tx, { ...booking, id: "appt_q2", procedureCode: undefined, startsAt: at("2026-10-21T10:30:00").toISOString() }, child));
    const reminder = (await rows()).find((m) => m.appointmentId === "appt_q2" && m.kind === "appointment_reminder")!;
    expect(reminder.sendAt).toEqual(at("2026-10-20T14:00:00"));
  });

  it("holds a text queued at night until 8 AM, in the log and in the outbox", async () => {
    clock.set(at("2026-10-20T21:30:00"));
    const m = await inTx((tx) => queue.queue(tx, { kind: "birthday", patientId: child.id, sendAt: clock.now().toISOString() }, child));
    expect(m!.sendAt).toBe(at("2026-10-21T08:00:00").toISOString());
    expect((await outboxFor([m!.id]))[0]!.availableAt).toEqual(at("2026-10-21T08:00:00"));
  });

  it("queues nothing for a family that declined reminders", async () => {
    const declined: Patient = { ...child, privacyChoices: [{ photos: true, reminders: false, by: "parent", byName: "Rosa", at: clock.now().toISOString() }] };
    expect(await inTx((tx) => queue.queue(tx, { kind: "birthday", patientId: child.id, sendAt: clock.now().toISOString() }, declined))).toBeUndefined();
    expect(await rows()).toEqual([]);
  });

  it("fails a text with no usable number at once, with no outbox row", async () => {
    const landline: Patient = { ...child, guardians: child.guardians.map((g) => (g.isPrimary ? { ...g, phone: "0281234567" } : g)) };
    const m = await inTx((tx) => queue.queue(tx, { kind: "birthday", patientId: child.id, sendAt: clock.now().toISOString() }, landline));
    expect(m).toMatchObject({ status: "failed", failureReason: "No phone number" });
    expect(await outboxFor([m!.id])).toEqual([]);
  });

  it("leaves no text and no outbox row when the caller's change rolls back", async () => {
    const before = await prisma.outboxMessage.count();
    const failing = inTx(async (tx) => {
      await queue.queueBooking(tx, booking, child);
      throw new Error("the booking failed");
    });
    await expect(failing).rejects.toThrow("the booking failed");
    expect(await rows()).toEqual([]);
    expect(await prisma.outboxMessage.count()).toBe(before);
  });

  it("withdraws only what is queued and not yet handed to the provider", async () => {
    await inTx((tx) => queue.queueBooking(tx, booking, child));
    const [confirmation, reminder, pre] = await rows();
    await inClinic(DEMO_CLINIC_ID, async () => {
      await prisma.message.update({ where: { id: confirmation!.id }, data: { status: "sent", sentAt: clock.now(), segments: 1 } });
      await prisma.message.update({ where: { id: reminder!.id }, data: { dispatchedAt: clock.now() } });
    });
    expect(await inTx((tx) => queue.withdrawAppointment(tx, booking.id))).toBe(1);
    expect((await rows()).map((m) => [m.id, m.status])).toEqual([
      [confirmation!.id, "sent"],
      [reminder!.id, "queued"],
      [pre!.id, "cancelled"],
    ]);
  });

  it("keeps each clinic's log to itself", async () => {
    await inTx((tx) => queue.queueBooking(tx, booking, child));
    const elsewhere = await inClinic("clinic_ngiti", () => queue.list({ patientId: child.id }));
    expect(elsewhere).toEqual([]);
    expect((await inClinic(DEMO_CLINIC_ID, () => queue.list({ patientId: child.id }))).length).toBe(3);
  });

  it("reads a child's last tried text, a sent one winning a tie at one send time (hasNoContact's rule)", async () => {
    const base = { clinicId: DEMO_CLINIC_ID, patientId: child.id, kind: "recall" as const, to: "09171234567", recipientName: "Rosa", body: "Hi", createdAt: clock.now() };
    const tie = at("2026-10-19T10:00:00");
    await inClinic(DEMO_CLINIC_ID, () =>
      prisma.message.createMany({
        data: [
          { ...base, id: "msg_tie_a", status: "sent", sendAt: tie, sentAt: tie },
          { ...base, id: "msg_tie_z", status: "failed", sendAt: tie, failureReason: "No phone number" }, // the higher id
          { ...base, id: "msg_tie_older", status: "failed", sendAt: at("2026-10-18T10:00:00"), failureReason: "No phone number" },
        ],
      }),
    );
    expect(await inClinic(DEMO_CLINIC_ID, () => queue.lastTried([child.id]))).toEqual([{ patientId: child.id, status: "sent", sendAt: tie.toISOString() }]);
  });

  it("counts a month's sent texts and parts by Manila time", async () => {
    await inTx((tx) => queue.queueBooking(tx, booking, child));
    const [first, second] = await rows();
    await inClinic(DEMO_CLINIC_ID, async () => {
      await prisma.message.updateMany({ where: { sentAt: { not: null } }, data: { sentAt: at("2026-08-15T10:00:00") } }); // the seed's, out of the way
      await prisma.message.update({ where: { id: first!.id }, data: { status: "sent", sentAt: at("2026-10-01T00:00:00"), segments: 2 } });
      await prisma.message.update({ where: { id: second!.id }, data: { status: "sent", sentAt: at("2026-09-30T23:59:00"), segments: 1 } });
    });
    expect(await inClinic(DEMO_CLINIC_ID, () => queue.sentIn("2026-10"))).toEqual({ texts: 1, segments: 2 });
    expect(await inClinic(DEMO_CLINIC_ID, () => queue.sentIn("2026-09"))).toEqual({ texts: 1, segments: 1 });
  });
});
