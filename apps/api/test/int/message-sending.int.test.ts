import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform } from "@pedia/seed";
import type { Patient } from "@pedia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { FixedClock } from "../../src/common/clock";
import { MESSAGE_SEND } from "../../src/message-queue/message.rows";
import { MessageQueueService } from "../../src/message-queue/message-queue.service";
import { SMS_PROVIDER, SmsInDoubt, SmsRejected, SmsUnavailable, type SmsProvider, type SmsSend } from "../../src/message-queue/sms-provider";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { runInTransaction, type Tx } from "../../src/prisma/transaction";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase, testPrisma } from "./support/database";
import { createIntApp } from "./support/int-app";

const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
const at = (local: string) => new Date(`${local}+08:00`); // Manila wall time
const TEN = at("2026-10-20T10:00:00");
const clock = new FixedClock(TEN);
const prisma = testPrisma();
// Two API instances on one database, as in outbox.int: a restart replaces `a`.
let a: INestApplication;
let b: INestApplication;

const child = db.patients.find((p) => !p.privacyChoices?.some((c) => !c.reminders) && /^09\d{9}$/.test(p.guardians.find((g) => g.isPrimary)!.phone))!;
const inTx = <T>(app: INestApplication, fn: (tx: Tx) => Promise<T>) => inClinic(DEMO_CLINIC_ID, () => runInTransaction(app.get(PrismaService), fn));
/** A text due now (the birthday kind: no appointment needed). */
const queueOne = async (patient: Patient = child) =>
  (await inTx(a, (tx) => a.get(MessageQueueService).queue(tx, { kind: "birthday", patientId: child.id, sendAt: clock.now().toISOString() }, patient)))!.id;
const message = (id: string) => inClinic(DEMO_CLINIC_ID, () => prisma.message.findUniqueOrThrow({ where: { id } }));
const outboxOf = async (id: string) => (await prisma.outboxMessage.findMany({ where: { kind: MESSAGE_SEND } })).find((o) => (o.payload as { messageId: string }).messageId === id)!;
const drainAll = async (...apps: INestApplication[]) => {
  for (const app of apps) while ((await app.get(OutboxWorker).drain()) > 0);
};

/** Every provider call, from any app: what the parent's phone would have received. */
const calls: SmsSend[] = [];
const script = (...outcomes: ("ok" | Error)[]) => {
  let n = 0;
  return async (sms: SmsSend) => {
    calls.push(sms);
    const outcome = outcomes[Math.min(n++, outcomes.length - 1)] ?? "ok";
    if (outcome !== "ok") throw outcome;
    return { providerRef: `log:${sms.messageId}`, segments: 1 };
  };
};
const provide = (app: INestApplication, ...outcomes: ("ok" | Error)[]) => vi.spyOn(app.get<SmsProvider>(SMS_PROVIDER), "send").mockImplementation(script(...outcomes));

beforeAll(async () => {
  [a, b] = await Promise.all([createIntApp({ clock }), createIntApp({ clock })]);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
  // The seed's queued texts would be sent by the first drain: settle them out of the way.
  await prisma.outboxMessage.updateMany({ where: { kind: MESSAGE_SEND }, data: { status: "done" } });
}, 60_000);
afterAll(async () => {
  await Promise.all([a.close(), b.close()]);
  await prisma.onModuleDestroy();
});
beforeEach(async () => {
  clock.set(TEN);
  calls.length = 0;
  vi.restoreAllMocks();
  provide(a);
  provide(b);
  await inClinic(DEMO_CLINIC_ID, () => prisma.message.deleteMany({ where: { patientId: child.id } }));
  await prisma.outboxMessage.deleteMany({ where: { kind: MESSAGE_SEND, status: { not: "done" } } });
});

describe("sending texts on MySQL", () => {
  it("sends a booking's confirmation exactly once, across a worker restart (B9's done-when)", async () => {
    await inTx(a, (tx) => a.get(MessageQueueService).queueBooking(tx, { id: "appt_s1", patientId: child.id, dentistId: "staff_reyes", startsAt: at("2026-10-27T10:30:00").toISOString() }, child));
    await drainAll(a);
    expect(calls.map((c) => c.body)).toHaveLength(1); // the confirmation; the reminder waits for its day
    const confirmation = (await inClinic(DEMO_CLINIC_ID, () => prisma.message.findFirstOrThrow({ where: { appointmentId: "appt_s1", kind: "appointment_confirmation" } }))).id;

    // The worker dies after the provider took the text and before the outbox row settled: the row comes back.
    await prisma.outboxMessage.update({ where: { id: (await outboxOf(confirmation)).id }, data: { status: "pending", availableAt: clock.now() } });
    await a.close();
    a = await createIntApp({ clock });
    provide(a);
    await drainAll(a, b);

    expect(calls).toHaveLength(1);
    expect(await outboxOf(confirmation)).toMatchObject({ status: "done" });
    expect(await message(confirmation)).toMatchObject({ status: "sent", sentAt: clock.now(), segments: 1, providerRef: `log:${confirmation}` });
  });

  it("never sends a text claimed by a try that left no outcome", async () => {
    const id = await queueOne();
    await inClinic(DEMO_CLINIC_ID, () => prisma.message.update({ where: { id }, data: { dispatchedAt: clock.now() } }));
    await drainAll(a);
    expect(calls).toEqual([]);
    expect(await message(id)).toMatchObject({ status: "failed", failureReason: "Not confirmed by the SMS provider" });
    expect(await outboxOf(id)).toMatchObject({ status: "done" });
  });

  it("retries after about 1, 5 and 30 minutes, then shows the text as failed", async () => {
    provide(a, new SmsUnavailable());
    const id = await queueOne();
    for (const minutes of [0, 1, 6, 36]) {
      clock.set(new Date(TEN.getTime() + minutes * 60_000));
      expect(await a.get(OutboxWorker).drain()).toBe(1);
      expect((await message(id)).dispatchedAt).toBeNull();
    }
    expect(calls).toHaveLength(4);
    expect(await message(id)).toMatchObject({ status: "failed", failureReason: "Couldn't be sent after 4 tries" });
    expect(await outboxOf(id)).toMatchObject({ status: "failed" });
    clock.set(at("2026-10-20T12:00:00"));
    expect(await a.get(OutboxWorker).drain()).toBe(0);
  });

  it("sends on a retry after the provider recovers", async () => {
    provide(a, new SmsUnavailable(), new SmsUnavailable(), "ok");
    const id = await queueOne();
    for (const minutes of [0, 1, 6]) {
      clock.set(new Date(TEN.getTime() + minutes * 60_000));
      await a.get(OutboxWorker).drain();
    }
    expect(calls).toHaveLength(3);
    expect(await message(id)).toMatchObject({ status: "sent" });
  });

  it("fails a refused number at once, without retrying", async () => {
    provide(a, new SmsRejected());
    const id = await queueOne();
    await drainAll(a);
    clock.set(at("2026-10-20T11:00:00"));
    await drainAll(a);
    expect(calls).toHaveLength(1);
    expect(await message(id)).toMatchObject({ status: "failed", failureReason: "The SMS provider refused this number", segments: null }); // not sent: not counted (E9)
  });

  it("never resends a text the provider may have taken (decision 13)", async () => {
    provide(a, new SmsInDoubt());
    const id = await queueOne();
    await drainAll(a);
    clock.set(at("2026-10-20T11:00:00"));
    await drainAll(a);
    expect(calls).toHaveLength(1);
    expect(await message(id)).toMatchObject({ status: "failed", failureReason: "Not confirmed by the SMS provider" });
    expect(await outboxOf(id)).toMatchObject({ status: "done" });
  });

  it("holds a retry that would land at night until 8 AM, without spending a try", async () => {
    provide(a, new SmsUnavailable(), "ok");
    clock.set(at("2026-10-20T19:59:00"));
    const id = await queueOne();
    await drainAll(a); // try 1 fails; the retry is due 20:00
    clock.set(at("2026-10-20T20:00:00"));
    await drainAll(a);
    expect(await outboxOf(id)).toMatchObject({ status: "pending", attempts: 1, availableAt: at("2026-10-21T08:00:00") });
    clock.set(at("2026-10-21T08:00:00"));
    await drainAll(a);
    expect(calls).toHaveLength(2);
    expect(await message(id)).toMatchObject({ status: "sent" });
  });

  it("sends nothing for a text withdrawn before its time", async () => {
    await inTx(a, (tx) => a.get(MessageQueueService).queueBooking(tx, { id: "appt_s2", patientId: child.id, dentistId: "staff_reyes", startsAt: at("2026-10-23T10:30:00").toISOString() }, child));
    await inTx(a, (tx) => a.get(MessageQueueService).withdrawAppointment(tx, "appt_s2"));
    clock.set(at("2026-10-22T09:30:00"));
    await drainAll(a);
    expect(calls).toEqual([]);
    const texts = await inClinic(DEMO_CLINIC_ID, () => prisma.message.findMany({ where: { appointmentId: "appt_s2" } }));
    expect(texts.map((m) => m.status)).toEqual(["cancelled", "cancelled"]);
    for (const m of texts) expect(await outboxOf(m.id)).toMatchObject({ status: "done" });
  });

  it("lets a withdrawal stop only a text not yet handed to the provider", async () => {
    const id = await queueOne();
    // Hold the row the way the handler's claim does, and let a reminders "no" arrive meanwhile.
    let release!: () => void;
    let locked!: () => void;
    const lockTaken = new Promise<void>((resolve) => (locked = resolve));
    const claim = inTx(a, async (tx) => {
      await tx.$queryRaw`SELECT id FROM Message WHERE id = ${id} FOR UPDATE`;
      await tx.message.update({ where: { id }, data: { dispatchedAt: clock.now() } });
      locked();
      await new Promise<void>((resolve) => (release = resolve));
    });
    await lockTaken;
    const withdraw = inTx(b, (tx) => b.get(MessageQueueService).withdrawPatient(tx, child.id));
    await new Promise((resolve) => setTimeout(resolve, 200)); // the withdrawal is now waiting on the row
    release();
    await claim;
    expect(await withdraw).toBe(0);
    expect(await message(id)).toMatchObject({ status: "queued" });

    // The other way round: withdrawn first, so the worker sends nothing.
    const second = await queueOne();
    await inTx(b, (tx) => b.get(MessageQueueService).withdrawPatient(tx, child.id));
    await inClinic(DEMO_CLINIC_ID, () => prisma.message.update({ where: { id }, data: { status: "cancelled" } })); // the first, out of the way
    await drainAll(a);
    expect(calls).toEqual([]);
    expect(await message(second)).toMatchObject({ status: "cancelled" });
  });

  it("gives each text to one worker only, whatever runs in parallel", async () => {
    const ids = [];
    for (let n = 0; n < 30; n++) ids.push(await queueOne());
    await Promise.all([drainAll(a), drainAll(b), drainAll(a), drainAll(b)]);
    expect(calls).toHaveLength(30);
    expect(new Set(calls.map((c) => c.messageId))).toEqual(new Set(ids));
  });

  it("fails a text whose number stopped being usable after it was queued", async () => {
    const id = await queueOne();
    await inClinic(DEMO_CLINIC_ID, () => prisma.message.update({ where: { id }, data: { to: "0281234567" } }));
    await drainAll(a);
    expect(calls).toEqual([]);
    expect(await message(id)).toMatchObject({ status: "failed", failureReason: "No phone number" });
    expect(await outboxOf(id)).toMatchObject({ status: "failed", attempts: 1 });
  });
});
