import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { ClinicUsage, FAILURE, GB, TIER_LIMITS, choiceDeclined, manilaMonth, storageFullMessage } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { FixedClock } from "../../src/common/clock";
import { MESSAGE_SEND } from "../../src/message-queue/message.rows";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { FileStorage } from "../../src/storage/storage";
import { inClinic, resetDatabase } from "./support/database";
import { binary } from "./support/files";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** B12 Step 8.4: the plan's storage (decision 1, E8) and texts (decisions 2, 3, 18, 19, E9) on MySQL, with races. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b12-allowances-"));
const platform = seedPlatform();
const NGITI = "clinic_ngiti";
const ngiti = platform.tenants[NGITI]!;
const OWNER = ngiti.staff.find((s) => s.isOwner)!;
const child = ngiti.patients.find((p) => !choiceDeclined(p, "photos") && !choiceDeclined(p, "reminders"))!;
// Mid-morning in Manila today: inside sending hours (B9 decision 4), so the worker sends at once.
const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
const clock = new FixedClock(new Date(`${day}T10:00:00+08:00`));
const month = manilaMonth(day);
let app: INestApplication;
let prisma: PrismaService;

beforeAll(async () => {
  app = await createIntApp({ clock, env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform, app.get(FileStorage));
}, 60_000);

const http = () => request(app.getHttpServer());
const owner = async () => `pd_session=${await app.get(SessionService).openClinic(NGITI, OWNER.id)}`;
const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(bytes - 4, 7)]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
/** Filler rows of at most 1 GiB each: `bytes` is a 32-bit column, and Starter's 25 GB is more than one row holds. */
const fill = (bytes: number) =>
  inClinic(NGITI, () =>
    prisma.storedFile.createMany({
      data: Array.from({ length: Math.ceil(bytes / GB) }, (_, i) => ({
        clinicId: NGITI, key: `clinics/${NGITI}/photos/filler-${i}.png`, area: "photos", bytes: Math.min(GB, bytes - i * GB), createdAt: clock.now(),
      })),
    }),
  );
const used = () => inClinic(NGITI, async () => (await prisma.storedFile.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0);
const photo = (cookie: string, body: Buffer) =>
  http().post(`/api/patients/${child.id}/photos`).set("Cookie", cookie)
    .field("meta", JSON.stringify({ type: "intraoral", takenOn: day, caption: "" })).attach("file", body, { filename: "p.jpg", contentType: "image/jpeg" });

describe("storage (decision 1, E8)", () => {
  it("stores one of three parallel uploads that only one can fit, never going past the plan", async () => {
    const limit = TIER_LIMITS.small.storageBytes;
    const seeded = await used();
    await fill(limit - 1024 * 1024 - seeded); // 1 MB left
    const cookie = await owner();
    const results = await Promise.all([1, 2, 3].map(() => photo(cookie, jpeg(600 * 1024))));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(results.find((r) => r.status === 409)!.text).toBe(storageFullMessage("small"));
    expect(await used()).toBeLessThanOrEqual(limit);
  });

  it("refuses a logo when full and keeps serving the old one", async () => {
    const cookie = await owner();
    const first = await http().put("/api/clinic/logo").set("Cookie", cookie).attach("file", PNG, { filename: "l.png", contentType: "image/png" });
    expect(first.status).toBe(200);
    await fill(TIER_LIMITS.small.storageBytes - (await used()));
    const full = await http().put("/api/clinic/logo").set("Cookie", cookie).attach("file", PNG, { filename: "l.png", contentType: "image/png" });
    expect([full.status, full.text]).toEqual([409, storageFullMessage("small")]);
    const logo = await http().get("/api/clinic/logo").set("Cookie", cookie).buffer(true).parse(binary);
    expect([logo.status, (logo.body as Buffer).equals(PNG)]).toEqual([200, true]);
  });
});

describe("storage while a downgrade waits (audit #25)", () => {
  it("counts the smaller plan's storage until the downgrade's date", async () => {
    const BULILIT = "clinic_demo";
    const tenant = platform.tenants[BULILIT]!;
    const kid = tenant.patients.find((p) => !choiceDeclined(p, "photos"))!;
    const dentist = `pd_session=${await app.get(SessionService).openClinic(BULILIT, "staff_reyes")}`;
    const usedHere = () => inClinic(BULILIT, async () => (await prisma.storedFile.aggregate({ _sum: { bytes: true } }))._sum.bytes ?? 0);
    const room = TIER_LIMITS.small.storageBytes - (await usedHere()) - 1024; // 1 KB left on Starter
    await inClinic(BULILIT, () =>
      prisma.storedFile.createMany({
        data: Array.from({ length: Math.ceil(room / GB) }, (_, i) => ({
          clinicId: BULILIT, key: `clinics/${BULILIT}/photos/filler-${i}.png`, area: "photos", bytes: Math.min(GB, room - i * GB), createdAt: clock.now(),
        })),
      }),
    );
    const send = () =>
      http().post(`/api/patients/${kid.id}/photos`).set("Cookie", dentist)
        .field("meta", JSON.stringify({ type: "intraoral", takenOn: day, caption: "" })).attach("file", jpeg(4096), { filename: "p.jpg", contentType: "image/jpeg" });
    await prisma.subscription.update({ where: { clinicId: BULILIT }, data: { downgradeTier: "small", downgradeOn: new Date(`${day}T00:00:00Z`) } });
    const refused = await send();
    expect([refused.status, refused.text]).toEqual([409, storageFullMessage("small")]);
    await prisma.subscription.update({ where: { clinicId: BULILIT }, data: { downgradeTier: null, downgradeOn: null } });
    expect((await send()).status).toBe(201); // the plan in force has room
  });
});

describe("texts (decisions 2, 3, 18, 19, E9)", () => {
  /** A text already handed to the provider at `at`, with `parts` billed parts. */
  const dispatched = (parts: number, at: Date) =>
    inClinic(NGITI, () =>
      prisma.message.create({
        data: {
          id: `filler_${at.getTime()}`, clinicId: NGITI, patientId: child.id, kind: "recall", to: child.guardians[0]!.phone, recipientName: "x",
          body: "x", status: "sent", sendAt: at, createdAt: at, dispatchedAt: at, sentAt: at, segments: parts,
        },
      }),
    );
  /** A queued 1-part text with its outbox row, due now. */
  const queued = async (id: string, kind: "appointment_reminder" | "portal_invite") => {
    await inClinic(NGITI, () =>
      prisma.message.create({
        data: { id, clinicId: NGITI, patientId: child.id, kind, to: child.guardians[0]!.phone, recipientName: "x", body: "See you tomorrow.", status: "queued", sendAt: clock.now(), createdAt: clock.now() },
      }),
    );
    await prisma.outboxMessage.create({ data: { kind: MESSAGE_SEND, payload: { messageId: id }, clinicId: NGITI, availableAt: clock.now(), createdAt: clock.now() } });
  };
  const statusOf = (id: string) => inClinic(NGITI, async () => (await prisma.message.findUniqueOrThrow({ where: { id } })).status);

  beforeEach(async () => {
    await prisma.outboxMessage.deleteMany(); // only this test's texts in the worker's batch
    await inClinic(NGITI, () => prisma.message.updateMany({ where: { dispatchedAt: { not: null } }, data: { dispatchedAt: null, segments: null } }));
  });

  it("sends one of two reminders at 499 of 500 parts and fails the other; an invite still goes", async () => {
    await dispatched(TIER_LIMITS.small.textParts - 1, new Date(`${month}-01T09:00:00+08:00`));
    await queued("reminder_a", "appointment_reminder");
    await queued("reminder_b", "appointment_reminder");
    await Promise.all([app.get(OutboxWorker).drain(), app.get(OutboxWorker).drain()]);
    const statuses = [await statusOf("reminder_a"), await statusOf("reminder_b")].sort();
    expect(statuses).toEqual(["failed", "sent"]);
    const failed = await inClinic(NGITI, () => prisma.message.findFirstOrThrow({ where: { id: { in: ["reminder_a", "reminder_b"] }, status: "failed" } }));
    expect(failed.failureReason).toBe(FAILURE.textLimit);
    await queued("invite_c", "portal_invite");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("invite_c")).toBe("sent"); // account texts always go (decision 3)
  });

  it("sends a template text again once a confirmed top-up raises the month's limit (feature 16, revised)", async () => {
    await dispatched(TIER_LIMITS.small.textParts, new Date(`${month}-01T09:00:00+08:00`));
    await queued("reminder_e", "appointment_reminder");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_e")).toBe("failed"); // at the plan's limit
    await prisma.textTopUp.create({
      data: { clinicId: NGITI, month, packs: 1, parts: 100, invoiceNo: "PRM-INV-09999", method: "gcash", paidOn: new Date(`${month}-01T00:00:00Z`), amount: 15_000, recordedAt: clock.now() },
    });
    await queued("reminder_f", "appointment_reminder");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_f")).toBe("sent");
    expect(await statusOf("reminder_e")).toBe("failed"); // never sent later (B12 decision 19)
  });

  it("doesn't count parts dispatched last month", async () => {
    await dispatched(TIER_LIMITS.small.textParts, new Date(new Date(`${month}-01T00:00:00+08:00`).getTime() - 60 * 60_000)); // 11 PM on the last day before
    await queued("reminder_d", "appointment_reminder");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_d")).toBe("sent");
  });

  it("never refuses an invite for the limit (decision 3)", async () => {
    await dispatched(TIER_LIMITS.small.textParts, new Date(`${month}-01T09:00:00+08:00`)); // the month's parts all used
    const kid = ngiti.patients.find((p) => p.guardians.some((g) => /^09\d{9}$/.test(g.phone)))!;
    const g = kid.guardians.find((x) => /^09\d{9}$/.test(x.phone))!;
    // Seeded parents are active: turn the login off so it can be invited again.
    await inClinic(NGITI, () => prisma.portalAccount.updateMany({ where: { guardianId: g.id }, data: { state: "off" } }));
    const invites = () => inClinic(NGITI, () => prisma.message.findMany({ where: { patientId: kid.id, kind: "portal_invite" }, select: { id: true, status: true } }));
    const before = new Set((await invites()).map((m) => m.id));
    const res = await http().post(`/api/patients/${kid.id}/guardians/${g.id}/portal-invite`).set("Cookie", await owner());
    expect(res.status).toBe(200);
    await app.get(OutboxWorker).drain();
    const sent = (await invites()).filter((m) => !before.has(m.id));
    expect(sent.map((m) => m.status)).toEqual(["sent"]); // account texts always go (decision 3)
  });

  it("counts template texts only toward the month, never invites or resets (audit #3)", async () => {
    await dispatched(TIER_LIMITS.small.textParts - 1, new Date(`${month}-01T09:00:00+08:00`));
    const before = ClinicUsage.parse((await http().get("/api/clinic/usage").set("Cookie", await owner())).body).texts.inUse;
    const at = new Date(`${month}-01T10:00:00+08:00`);
    await inClinic(NGITI, () =>
      prisma.message.create({
        data: {
          clinicId: NGITI, patientId: child.id, kind: "password_reset", to: child.guardians[0]!.phone, recipientName: "x", body: "x",
          status: "sent", sendAt: at, createdAt: at, dispatchedAt: at, sentAt: at, segments: 400,
        },
      }),
    );
    expect(ClinicUsage.parse((await http().get("/api/clinic/usage").set("Cookie", await owner())).body).texts.inUse).toBe(before); // in the log, not the count
    await queued("reminder_g", "appointment_reminder");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_g")).toBe("sent"); // the last part is still the clinic's
  });

  it("fails a paused clinic's template texts for good and still sends its account texts (audit #24)", async () => {
    await prisma.clinicAccount.update({ where: { id: NGITI }, data: { status: "suspended" } });
    await queued("reminder_h", "appointment_reminder");
    await queued("invite_h", "portal_invite");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("invite_h")).toBe("sent");
    const failed = await inClinic(NGITI, () => prisma.message.findUniqueOrThrow({ where: { id: "reminder_h" } }));
    expect([failed.status, failed.failureReason, failed.dispatchedAt]).toEqual(["failed", FAILURE.clinicPaused, null]);
    await prisma.clinicAccount.update({ where: { id: NGITI }, data: { status: "active" } });
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_h")).toBe("failed"); // never sent later
  });

  it("shows the same storage and texts on the Plan and in the console", async () => {
    await dispatched(42, new Date(`${month}-01T09:00:00+08:00`));
    const plan = ClinicUsage.parse((await http().get("/api/clinic/usage").set("Cookie", await owner())).body);
    const op = await asOperator(app);
    const row = (await http().get("/api/operator/accounts").set("Cookie", op)).body.find((r: { account: { id: string } }) => r.account.id === NGITI);
    expect(plan.texts.inUse).toBeGreaterThanOrEqual(42);
    expect([row.usage.storage, row.usage.texts]).toEqual([plan.storage, plan.texts]);
    expect(plan.month).toBe(month);
  });
});
