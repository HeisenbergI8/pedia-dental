import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { Appointment, DueItem, Message, MessageTemplate, Patient, PatientView, smsSegments, type RegisterPatientInput } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { FixedClock } from "../../src/common/clock";
import { MESSAGE_SEND } from "../../src/message-queue/message.rows";
import { MessageQueueService } from "../../src/message-queue/message-queue.service";
import { BIRTHDAYS, MessagesJobs } from "../../src/messages/messages.jobs";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/** apps/web's "parent messages" routes against the API (CHUNKS B9): the log, the recall text, the greeting and its job. */
type Login = readonly [clinicId: string, accountId: string];
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
const at = (local: string) => new Date(`${local}+08:00`); // Manila wall time
const clock = new FixedClock(at("2026-03-16T10:00:00"));
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const ADMIN: Login = [DEMO_CLINIC_ID, "staff_delacruz"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const own = childrenOf(db, parentGuardianId)[0]!;
let a: INestApplication;
let b: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  [a, b] = await Promise.all([createIntApp({ clock }), createIntApp({ clock })]);
  prisma = a.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
  // The seed's queued texts would go out with the first drain: settle them, so the counts below are this file's.
  await prisma.outboxMessage.updateMany({ where: { kind: MESSAGE_SEND }, data: { status: "done" } });
}, 60_000);
afterAll(async () => {
  await Promise.all([a.close(), b.close()]);
});

/** Sessions start at the clock's time, so open one after setting it. */
const as = async ([clinicId, accountId]: Login) => `pd_session=${await a.get(SessionService).openClinic(clinicId, accountId)}`;
const call = (method: "get" | "post" | "put", path: string, cookie: string, body?: unknown) =>
  request(a.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T, status = 200): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(status);
  return schema.parse(r.body);
};
const refused = async (res: Promise<request.Response>) => {
  const r = await res;
  return [r.status, r.text];
};
let n = 0;
const register = async (birthDate = "2020-07-02", login: Login = FRONT_DESK) => {
  const body = {
    firstName: "Bea", lastName: `Texts${++n}`, birthDate, sex: "female", address: "",
    guardians: [{ id: "g_mother", fullName: "Rosa Mendoza", relationship: "Mother", phone: "09171234567", isPrimary: true }],
    emergencyContact: { name: "", phone: "" }, allergies: [], noKnownAllergies: true, medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: "g_mother", photos: true, reminders: true, confirmed: true },
  } as RegisterPatientInput;
  return (await ok(call("post", "/patients", await as(login), body), Patient, 201)).id;
};
const sayNo = async (id: string, login: Login = FRONT_DESK) => ok(call("post", `/patients/${id}/privacy-choices`, await as(login), { reminders: false }), PatientView);
const greetingsOf = (clinicId: string, patientId: string) => inClinic(clinicId, () => prisma.message.findMany({ where: { patientId, kind: "birthday" }, select: { greetingYear: true, status: true } }));

describe("the message log (GET /messages)", () => {
  it("lists newest first, narrows by child and status, and ignores an unknown status", async () => {
    clock.set(at("2026-03-16T10:00:00"));
    const desk = await as(FRONT_DESK);
    const all = await ok(call("get", "/messages", desk), z.array(Message));
    expect(all.length).toBe(db.messages.length);
    expect(all.map((m) => m.sendAt)).toEqual([...all.map((m) => m.sendAt)].sort().reverse());
    expect(await ok(call("get", "/messages?status=bogus", desk), z.array(Message))).toHaveLength(all.length);
    const failed = await ok(call("get", "/messages?status=failed", desk), z.array(Message));
    expect(failed.length).toBeGreaterThan(0);
    expect(failed.every((m) => m.status === "failed")).toBe(true);
    const mine = await ok(call("get", `/messages?patientId=${own.id}`, desk), z.array(Message));
    expect(mine.every((m) => m.patientId === own.id)).toBe(true);
  });

  it("lets staff read it, a parent only their own child's, and no other clinic", async () => {
    clock.set(at("2026-03-16T10:00:00"));
    for (const login of [FRONT_DESK, ADMIN]) expect((await call("get", "/messages", await as(login))).status).toBe(200);
    expect((await call("get", "/messages", await as(DENTIST))).status).toBe(403); // dentists don't hold messages.view
    const parent = await as(PARENT);
    await ok(call("get", `/messages?patientId=${own.id}`, parent), z.array(Message));
    const other = db.patients.find((p) => !p.guardians.some((g) => g.id === parentGuardianId))!;
    expect((await call("get", `/messages?patientId=${other.id}`, parent)).status).toBe(403);
    expect((await call("get", "/messages", parent)).status).toBe(403);
    expect(await ok(call("get", `/messages?patientId=${own.id}`, await as(NGITI_OWNER)), z.array(Message))).toEqual([]);
  });

  it("reads a repeated patientId as the one the guard checked, and an over-long one as no child (tester D1, D2)", async () => {
    clock.set(at("2026-03-16T10:00:00"));
    const other = db.patients.find((p) => !p.guardians.some((g) => g.id === parentGuardianId))!;
    const parent = await as(PARENT);
    const twice = await ok(call("get", `/messages?patientId=${own.id}&patientId=${other.id}`, parent), z.array(Message));
    expect(twice.every((m) => m.patientId === own.id)).toBe(true);
    expect((await call("get", `/messages?patientId=${other.id}&patientId=${own.id}`, parent)).status).toBe(403);
    expect(await ok(call("get", `/messages?patientId=${"x".repeat(192)}`, await as(FRONT_DESK)), z.array(Message))).toEqual([]);
  });

  it("audits a child's log, not the clinic's", async () => {
    clock.set(at("2026-03-16T10:00:00"));
    const views = () => inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Messages", action: "view" } }));
    const before = await views();
    await call("get", "/messages", await as(FRONT_DESK));
    expect(await views()).toBe(before);
    const unseen = db.patients.find((p) => p.id !== own.id)!.id; // a repeat view within 5 minutes isn't logged again
    await call("get", `/messages?patientId=${unseen}`, await as(FRONT_DESK));
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Messages", action: "view", patientId: unseen } }))).toBe(1);
    expect(await views()).toBe(before + 1);
  });
});

describe("the recall text (POST /due-items/:id/message)", () => {
  it("answers in the mock's order, with its words", async () => {
    clock.set(at("2026-03-16T10:00:00"));
    const desk = await as(FRONT_DESK);
    const open = await ok(call("get", "/due-items", desk), z.array(DueItem));
    const consented = (id: string) => !!db.patients.find((p) => p.id === id)?.privacyConsent && !db.patients.find((p) => p.id === id)?.privacyChoices?.some((c) => !c.reminders);
    const queuedFor = new Set(db.messages.filter((m) => m.status === "queued" && m.dueItemId).map((m) => m.dueItemId));
    const [first, second, third] = open.filter((i) => consented(i.patientId) && !queuedFor.has(i.id));
    expect(await refused(call("post", "/due-items/no_such_item/message", desk))).toEqual([404, "Due item not found"]);

    const sent = await ok(call("post", `/due-items/${first!.id}/message`, desk), Message, 201);
    expect(sent).toMatchObject({ kind: first!.kind === "follow_up" ? "follow_up_reminder" : "recall", dueItemId: first!.id, status: "queued" });
    expect(await refused(call("post", `/due-items/${first!.id}/message`, desk))).toEqual([409, "A reminder is already queued for this"]);

    const booking = { patientId: second!.patientId, dentistId: "staff_reyes", chairId: "chair_2", startsAt: at("2030-06-03T09:00:00").toISOString(), durationMin: 30, reason: "Recall", sourceRuleId: second!.ruleId };
    await ok(call("post", "/appointments", await as(ADMIN), booking), Appointment, 201);
    expect(await refused(call("post", `/due-items/${second!.id}/message`, desk))).toEqual([409, "This is already booked"]);

    await sayNo(third!.patientId);
    expect(await refused(call("post", `/due-items/${third!.id}/message`, desk))).toEqual([409, "This family declined reminder messages. Change it under Privacy on the child's Overview."]);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Recall message", patientId: first!.patientId } }))).toBe(1);
  });
});

describe("the birthday greeting (POST /patients/:id/birthday-greeting)", () => {
  it("answers in the mock's order, with its words, once a year", async () => {
    clock.set(at("2026-04-02T10:00:00"));
    const id = await register("2019-04-02");
    const notToday = await register("2019-04-03");
    const declined = await register("2019-04-02");
    await sayNo(declined);
    const desk = await as(FRONT_DESK);
    expect(await refused(call("post", "/patients/no_such_child/birthday-greeting", desk))).toEqual([404, "Patient not found"]);
    expect((await refused(call("post", `/patients/${declined}/birthday-greeting`, desk)))[0]).toBe(409);
    expect(await refused(call("post", `/patients/${notToday}/birthday-greeting`, desk))).toEqual([409, "It isn't Bea's birthday today"]);
    expect(await ok(call("post", `/patients/${id}/birthday-greeting`, desk), Message, 201)).toMatchObject({ kind: "birthday", status: "queued" });
    expect(await refused(call("post", `/patients/${id}/birthday-greeting`, desk))).toEqual([409, "Bea already has a birthday greeting this year"]);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Birthday greeting", patientId: id } }))).toBe(1);
  });

  it("greets once when 10 taps race", async () => {
    clock.set(at("2026-04-06T10:00:00"));
    const id = await register("2018-04-06");
    const desk = await as(FRONT_DESK);
    const results = await Promise.all(Array.from({ length: 10 }, () => call("post", `/patients/${id}/birthday-greeting`, desk)));
    expect(results.filter((r) => r.status >= 500).map((r) => r.text)).toEqual([]);
    expect(results.map((r) => r.status).sort()).toEqual([201, ...Array(9).fill(409)]);
    expect(await greetingsOf(DEMO_CLINIC_ID, id)).toHaveLength(1);
  });
});

describe("the daily birthday job", () => {
  it("greets each birthday child once in every active clinic, skipping declined and already-greeted ones", async () => {
    clock.set(at("2026-05-11T08:05:00"));
    const [byJob, byButton, declined] = [await register("2020-05-11"), await register("2020-05-11"), await register("2020-05-11")];
    await sayNo(declined);
    const ngiti = await register("2021-05-11", NGITI_OWNER);
    await ok(call("post", `/patients/${byButton}/birthday-greeting`, await as(FRONT_DESK)), Message, 201);

    expect(await a.get(MessagesJobs).runOnce()).toBeGreaterThanOrEqual(2);
    expect(await b.get(MessagesJobs).runOnce()).toBe(0); // a second instance finds everyone greeted
    for (const id of [byJob, byButton]) expect(await greetingsOf(DEMO_CLINIC_ID, id)).toEqual([{ greetingYear: 2026, status: "queued" }]);
    expect(await greetingsOf(DEMO_CLINIC_ID, declined)).toEqual([]);
    expect(await greetingsOf("clinic_ngiti", ngiti)).toHaveLength(1);
  });

  it("runs once when both instances fire the same tick", async () => {
    clock.set(at("2026-05-12T08:05:00"));
    const results = await Promise.all([a.get(MessagesJobs).birthdays(), b.get(MessagesJobs).birthdays()]);
    expect(results.sort()).toEqual(["ran", "skipped"]);
    await prisma.jobLock.deleteMany({ where: { name: BIRTHDAYS.name } }); // free the lease for the cases below
  });

  it("skips a suspended clinic, and counts a New Year greeting in the new Manila year", async () => {
    clock.set(at("2026-01-01T10:00:00"));
    const newYear = await register("2020-01-01");
    const ngiti = await register("2021-01-01", NGITI_OWNER);
    await ok(call("post", `/patients/${newYear}/birthday-greeting`, await as(FRONT_DESK)), Message, 201);
    await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "suspended" } });
    try {
      clock.set(at("2027-01-01T00:30:00")); // still 2026 in UTC
      await a.get(MessagesJobs).runOnce();
      expect((await greetingsOf(DEMO_CLINIC_ID, newYear)).map((g) => g.greetingYear).sort()).toEqual([2026, 2027]);
      expect(await greetingsOf("clinic_ngiti", ngiti)).toEqual([]);
    } finally {
      await prisma.clinicAccount.update({ where: { id: "clinic_ngiti" }, data: { status: "active" } });
    }
  });

  it("marks a text failed when its outbox row gave up and the hook never ran", async () => {
    clock.set(at("2026-05-13T10:00:00"));
    const id = await register("2020-05-13");
    const greeting = await ok(call("post", `/patients/${id}/birthday-greeting`, await as(FRONT_DESK)), Message, 201);
    const row = (await prisma.outboxMessage.findMany({ where: { kind: MESSAGE_SEND } })).find((o) => (o.payload as { messageId: string }).messageId === greeting.id)!;
    await prisma.outboxMessage.update({ where: { id: row.id }, data: { status: "failed" } });
    await a.get(MessagesJobs).runOnce();
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.message.findUniqueOrThrow({ where: { id: greeting.id } }))).toMatchObject({ status: "failed", failureReason: "Couldn't be sent after 4 tries" });
  });
});

describe("sending and the monthly count", () => {
  it("counts the texts and parts the provider took this month, per clinic", async () => {
    clock.set(at("2026-07-14T10:00:00"));
    const month = "2026-07";
    const count = (clinicId: string) => inClinic(clinicId, () => a.get(MessageQueueService).sentIn(month));
    // Earlier cases' greetings are still queued and due: settle them, so this drain sends only this case's three.
    await prisma.outboxMessage.updateMany({ where: { kind: MESSAGE_SEND, status: "pending" }, data: { status: "done" } });
    const before = await count(DEMO_CLINIC_ID);
    const ids = [await register("2020-07-14"), await register("2019-07-14"), await register("2018-07-14")];
    const desk = await as(FRONT_DESK);
    const texts = [];
    for (const id of ids) texts.push(await ok(call("post", `/patients/${id}/birthday-greeting`, desk), Message, 201));
    while ((await a.get(OutboxWorker).drain()) > 0);
    expect(await count(DEMO_CLINIC_ID)).toEqual({ texts: before.texts + 3, segments: before.segments + texts.reduce((sum, m) => sum + smsSegments(m.body), 0) });
    expect(await count("clinic_ngiti")).toEqual({ texts: 0, segments: 0 });
    const log = await ok(call("get", `/messages?patientId=${ids[0]}`, desk), z.array(Message));
    expect(log.map((m) => m.status)).toEqual(["sent"]);
  });

  it("keeps a queued text's words when the template changes, and uses the new words after", async () => {
    clock.set(at("2026-07-15T10:00:00"));
    const id = await register();
    const admin = await as(ADMIN);
    const book = (startsAt: string) => ok(call("post", "/appointments", admin, { patientId: id, dentistId: "staff_reyes", chairId: "chair_2", startsAt, durationMin: 30, reason: "Check-up" }), Appointment, 201);
    const first = await book(at("2030-06-04T09:00:00").toISOString());
    await ok(call("put", "/message-templates/appointment_reminder", admin, { body: "See you soon, {child_first_name}!" }), MessageTemplate);
    const second = await book(at("2030-06-05T09:00:00").toISOString());
    const reminder = async (appointmentId: string) => (await inClinic(DEMO_CLINIC_ID, () => prisma.message.findFirstOrThrow({ where: { appointmentId, kind: "appointment_reminder" } }))).body;
    expect(await reminder(first.id)).not.toBe("See you soon, Bea!");
    expect(await reminder(second.id)).toBe("See you soon, Bea!");
  });
});
