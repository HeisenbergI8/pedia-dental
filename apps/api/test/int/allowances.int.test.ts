import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { ClinicUsage, FAILURE, TIER_LIMITS, choiceDeclined, manilaMonth, storageFullMessage } from "@pedia/shared";
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
const fill = (bytes: number) =>
  inClinic(NGITI, () => prisma.storedFile.create({ data: { clinicId: NGITI, key: `clinics/${NGITI}/photos/filler.png`, area: "photos", bytes, createdAt: clock.now() } }));
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

  it("sends one of two reminders at 299 of 300 parts and fails the other; an invite still goes", async () => {
    await dispatched(299, new Date(`${month}-01T09:00:00+08:00`));
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

  it("doesn't count parts dispatched last month", async () => {
    await dispatched(300, new Date(new Date(`${month}-01T00:00:00+08:00`).getTime() - 60 * 60_000)); // 11 PM on the last day before
    await queued("reminder_d", "appointment_reminder");
    await app.get(OutboxWorker).drain();
    expect(await statusOf("reminder_d")).toBe("sent");
  });

  it("never refuses an invite for the limit (decision 3)", async () => {
    await dispatched(300, new Date(`${month}-01T09:00:00+08:00`)); // the month's parts all used
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
