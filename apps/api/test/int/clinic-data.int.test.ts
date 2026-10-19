import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, IPIN_ACCOUNT, seedPlatform } from "@pedia/seed";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { OperatorAccountsService } from "../../src/operator/operator-accounts.service";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { ClinicDataRefusal, ClinicDataService, EXPORT_MODELS, KEEP_ON_PURGE, PURGE_MODELS } from "../../src/privacy/clinic-data";
import { seedDatabase } from "../../src/seed/seed-database";
import { DELETE_FILE } from "../../src/storage/delete-file.handler";
import { FileStorage } from "../../src/storage/storage";
import { StorageService } from "../../src/storage/storage.service";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

/**
 * B13c2b-2: the operator's clinic data export and purge. API-only (scripts, no route), so no web twin and no ledger
 * line. The export runs on the demo clinic, the purge on Ipin; the demo and Ngiti clinics are the untouched controls.
 * Cases share one database, in order.
 */
const IPIN = IPIN_ACCOUNT.id;
const platform = seedPlatform();
const OTHERS = Object.keys(platform.tenants).filter((id) => id !== IPIN);
let app: INestApplication;
let prisma: PrismaService;
let data: ClinicDataService;
let operator: { id: string; name: string };
let dir: string;
let ipinKeys: string[] = [];

const delegate = (model: string) => (prisma as unknown as Record<string, { count(args?: object): Promise<number> }>)[model[0]!.toLowerCase() + model.slice(1)]!;
const rawCount = async (model: string, clinicId: string) =>
  Number(((await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${model}\` WHERE clinicId = ?`, clinicId)) as { n: bigint }[])[0]!.n);
const controls = () =>
  Promise.all(OTHERS.map((id) => inClinic(id, async () => [await prisma.patient.count(), await prisma.payment.count(), await prisma.auditEvent.count()])));
const ipinRows = () => inClinic(IPIN, async () => (await prisma.staff.count()) + (await prisma.patient.count()));

beforeAll(async () => {
  app = await createIntApp();
  prisma = app.get(PrismaService);
  data = app.get(ClinicDataService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform, app.get(FileStorage));
  operator = await prisma.operatorUser.findFirstOrThrow({ select: { id: true, name: true } });
  dir = mkdtempSync(join(tmpdir(), "clinic-export-"));
}, 60_000);
afterAll(async () => {
  rmSync(dir, { recursive: true, force: true });
  await app.close();
});

describe("the clinic's data at cancellation (B13c2b-2)", () => {
  it("exports every clinic table as JSON Lines, with its files, a manifest and checksums", async () => {
    await data.export(DEMO_CLINIC_ID, dir, operator);
    const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as { rows: Record<string, number>; files: number; missing: string[] };
    for (const model of EXPORT_MODELS) {
      const count = await inClinic(DEMO_CLINIC_ID, () => delegate(model).count());
      expect(manifest.rows[model], model).toBe(count);
      const text = readFileSync(join(dir, "tables", `${model}.jsonl`), "utf8");
      expect(text ? text.trimEnd().split("\n").length : 0, model).toBe(count);
      for (const other of OTHERS.filter((id) => id !== DEMO_CLINIC_ID).concat(IPIN)) expect(text.includes(`"${other}"`), `${model} holds ${other}`).toBe(false);
    }
    const stored = await inClinic(DEMO_CLINIC_ID, () => prisma.storedFile.findMany({ select: { key: true } }));
    expect(stored.length).toBeGreaterThan(0);
    for (const { key } of stored) expect(readFileSync(join(dir, "files", key)).length, key).toBeGreaterThan(0);
    for (const line of readFileSync(join(dir, "SHA256SUMS"), "utf8").trimEnd().split("\n")) {
      const [hash, path] = line.split("  ");
      expect(createHash("sha256").update(readFileSync(join(dir, path!))).digest("hex"), path).toBe(hash);
    }
    expect(await prisma.operatorAuditEvent.count({ where: { action: "export", record: "Clinic data (export)", targetId: DEMO_CLINIC_ID } })).toBe(1);
  });

  it("refuses a directory that isn't empty", async () => {
    await expect(data.export(DEMO_CLINIC_ID, dir, operator)).rejects.toThrow(ClinicDataRefusal);
    await expect(data.export(DEMO_CLINIC_ID, dir, operator)).rejects.toThrow(/isn't empty/);
    expect(await prisma.operatorAuditEvent.count({ where: { record: "Clinic data (export)" } })).toBe(1);
  });

  it("refuses to purge until the name is typed, the subscription has ended and the account is paused", async () => {
    const rows = await ipinRows();
    expect(rows).toBeGreaterThan(0);
    await expect(data.purge(IPIN, IPIN_ACCOUNT.name, operator)).rejects.toThrow(/hasn't ended/);
    await prisma.subscription.update({ where: { clinicId: IPIN }, data: { anchor: new Date("2020-01-01"), paidMonths: 1, cancelledAt: new Date("2020-01-15T00:00:00Z") } });
    await expect(data.purge(IPIN, IPIN_ACCOUNT.name, operator)).rejects.toThrow(/Pause/);
    await prisma.clinicAccount.update({ where: { id: IPIN }, data: { status: "suspended" } });
    await expect(data.purge(IPIN, IPIN_ACCOUNT.name.toLowerCase(), operator)).rejects.toThrow(/name typed/);
    expect(await ipinRows()).toBe(rows);
  });

  it("purges the clinic's data and keeps Primolar's books", async () => {
    // A file of Ipin's, so the purge has one to queue (the seed gives Ipin none).
    await inClinic(IPIN, () => app.get(StorageService).put("photos", "png", Buffer.from("ipin")));
    ipinKeys = (await inClinic(IPIN, () => prisma.storedFile.findMany({ select: { key: true } }))).map((f) => f.key);
    expect(ipinKeys.length).toBeGreaterThan(0);
    const kept = await Promise.all(KEEP_ON_PURGE.map((m) => rawCount(m, IPIN)));
    const before = await controls();

    const out = await data.purge(IPIN, IPIN_ACCOUNT.name, operator);
    expect(out).toMatchObject({ clinicId: IPIN, filesQueued: ipinKeys.length });

    for (const model of PURGE_MODELS) {
      if (model === "OutboxMessage") {
        expect(await prisma.outboxMessage.count({ where: { clinicId: IPIN, kind: { not: DELETE_FILE } } })).toBe(0);
        expect(await prisma.outboxMessage.count({ where: { clinicId: IPIN, kind: DELETE_FILE } })).toBe(ipinKeys.length);
      } else expect(await rawCount(model, IPIN), model).toBe(0);
    }
    const account = await prisma.clinicAccount.findUniqueOrThrow({ where: { id: IPIN } });
    expect(account.purgedAt).not.toBeNull();
    expect(account.logoRef).toBeNull();
    expect(await Promise.all(KEEP_ON_PURGE.map((m) => rawCount(m, IPIN)))).toEqual(kept);
    expect(await controls()).toEqual(before);
  });

  it("deletes the clinic's files once the outbox runs", async () => {
    await app.get(OutboxWorker).drain();
    const storage = app.get(StorageService);
    for (const key of ipinKeys) expect(await inClinic(IPIN, () => storage.get(key)), key).toBeUndefined();
  });

  it("does nothing the second time", async () => {
    const outbox = await prisma.outboxMessage.count();
    expect(await data.purge(IPIN, IPIN_ACCOUNT.name, operator)).toMatchObject({ alreadyPurgedAt: expect.any(String) });
    expect(await prisma.outboxMessage.count()).toBe(outbox);
  });

  it("won't reactivate a purged clinic", async () => {
    await expect(app.get(OperatorAccountsService).setStatus(IPIN, "active")).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/can't be reactivated/) });
    expect((await prisma.clinicAccount.findUniqueOrThrow({ where: { id: IPIN } })).status).toBe("suspended");
  });

  it("writes the purge to the operator trail", async () => {
    expect(await prisma.operatorAuditEvent.count({ where: { record: "Clinic data (purged)", targetId: IPIN } })).toBe(1);
  });
});
