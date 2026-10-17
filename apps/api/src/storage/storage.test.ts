import "reflect-metadata";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Clock, SystemClock } from "../common/clock";
import { requestContext } from "../common/request-context";
import { ENV, loadEnv } from "../config/env";
import { OutboxHandlers } from "../outbox/outbox.handlers";
import { OutboxModule } from "../outbox/outbox.module";
import { PrismaService } from "../prisma/prisma.service";
import { LocalDiskStorage } from "./local-disk.storage";
import { clinicKey, parseKey } from "./storage";
import { StorageModule } from "./storage.module";
import { StorageService } from "./storage.service";

let root: string;
let storage: StorageService;
let handlers: OutboxHandlers;

/** The StoredFile ledger in memory, scoped by the request's clinic as the tenant extension would (E5). */
type Row = { clinicId: string; key: string; area: string; bytes: number };
const ledger: Row[] = [];
const clinicOf = () => requestContext.current()?.clinicId;
const fakePrisma = {
  storedFile: {
    create: async ({ data }: { data: Row }) => void ledger.push(data),
    deleteMany: async ({ where }: { where: { key: string } }) => {
      const at = ledger.findIndex((r) => r.key === where.key && r.clinicId === clinicOf());
      if (at >= 0) ledger.splice(at, 1);
    },
    aggregate: async () => ({ _sum: { bytes: ledger.filter((r) => r.clinicId === clinicOf()).reduce((n, r) => n + r.bytes, 0) || null } }),
  },
};

/** Stands in for AppModule's global ENV, Clock and PrismaService. */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv({ DATABASE_URL: "mysql://unused", STORAGE_DIR: root }) },
    { provide: Clock, useClass: SystemClock },
    { provide: PrismaService, useValue: fakePrisma },
  ],
  exports: [ENV, Clock, PrismaService],
})
class TestEnv {}

/** Stands in for OutboxModule: StorageModule only registers its storage.delete handler there. */
@Module({ providers: [OutboxHandlers], exports: [OutboxHandlers] })
class TestOutbox {}

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "pd-storage-"));
  const moduleRef = await Test.createTestingModule({ imports: [TestEnv, StorageModule] }).overrideModule(OutboxModule).useModule(TestOutbox).compile();
  await moduleRef.init();
  storage = moduleRef.get(StorageService);
  handlers = moduleRef.get(OutboxHandlers);
});
afterAll(() => rm(root, { recursive: true, force: true }));

const as = <T>(clinicId: string | undefined, fn: () => Promise<T>) =>
  requestContext.run({ requestId: "storage-test", operator: false, ...(clinicId ? { clinicId } : {}) }, async () => await fn());
const svg = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");

describe("StorageService on the local disk", () => {
  it("registers storage.delete with the outbox (B3: a replaced logo's file is removed after commit)", () => {
    expect(handlers.get("storage.delete")).toBeDefined();
  });

  it("keys a file by clinic and reads it back with its content type", async () => {
    const key = await as("clinic_a", () => storage.put("branding", "svg", svg));
    expect(key).toMatch(/^clinics\/clinic_a\/branding\/[0-9a-f-]{36}\.svg$/);
    expect(await as("clinic_a", () => storage.get(key))).toEqual({ body: svg, contentType: "image/svg+xml" });
    expect(await readdir(join(root, "clinics/clinic_a/branding"))).toEqual([key.split("/").pop()]); // no partial left
  });

  it("keeps files across a restart (a new driver on the same directory)", async () => {
    const key = await as("clinic_a", () => storage.put("branding", "png", Buffer.from([1, 2, 3])));
    const restarted = new StorageService(new LocalDiskStorage(root, "s".repeat(32)), fakePrisma as unknown as PrismaService, new SystemClock());
    expect((await as("clinic_a", () => restarted.get(key)))?.body).toEqual(Buffer.from([1, 2, 3]));
  });

  it("treats another clinic's key as missing, for reads and deletes", async () => {
    const key = await as("clinic_a", () => storage.put("branding", "svg", svg));
    expect(await as("clinic_b", () => storage.get(key))).toBeUndefined();
    await as("clinic_b", () => storage.delete(key));
    expect(await as("clinic_a", () => storage.get(key))).toBeDefined();
  });

  it("deletes, and deleting twice is fine", async () => {
    const key = await as("clinic_a", () => storage.put("branding", "svg", svg));
    await as("clinic_a", () => storage.delete(key));
    await as("clinic_a", () => storage.delete(key));
    expect(await as("clinic_a", () => storage.get(key))).toBeUndefined();
  });

  it("writes a ledger row per file, removes it with the file, and sums a clinic's bytes (decision 8)", async () => {
    const before = await as("clinic_c", () => storage.usedBytes());
    const key = await as("clinic_c", () => storage.put("branding", "png", Buffer.alloc(1_000)));
    expect(ledger.find((r) => r.key === key)).toMatchObject({ clinicId: "clinic_c", area: "branding", bytes: 1_000 });
    expect(await as("clinic_c", () => storage.usedBytes())).toBe(before + 1_000);
    expect(await as("clinic_d", () => storage.usedBytes())).toBe(0);
    await as("clinic_c", () => storage.delete(key));
    expect(ledger.some((r) => r.key === key)).toBe(false);
  });

  it("streams a checked upload's temp file to storage without reading it whole, and counts its bytes", async () => {
    const path = join(root, "upload.tmp");
    const bytes = Buffer.alloc(3 * 1024 * 1024, 7);
    await writeFile(path, bytes);
    const key = await as("clinic_a", () => storage.putFile("photos", "jpg", { path, bytes: bytes.length }));
    expect((await as("clinic_a", () => storage.get(key)))?.body.equals(bytes)).toBe(true);
    expect(ledger.find((r) => r.key === key)?.bytes).toBe(bytes.length);
  });

  it("links only the request's clinic's files, and the link opens the bytes (E8)", async () => {
    const key = await as("clinic_a", () => storage.put("photos", "png", Buffer.from([9, 8, 7])));
    const link = await as("clinic_a", () => storage.link(key, { fileName: "bea.png", download: true }));
    expect(link).toMatch(/^\/api\/files\/[\w-]+$/);
    const driver = (storage as unknown as { files: LocalDiskStorage }).files;
    const opened = await driver.open(link!.slice("/api/files/".length));
    expect(opened).toMatchObject({ bytes: 3, contentType: "image/png", name: "bea.png", download: true });
    opened!.stream.destroy();
    expect(await as("clinic_b", () => storage.link(key, { fileName: "x.png" }))).toBeUndefined();
  });

  it("refuses to work without a clinic", async () => {
    await expect(as(undefined, () => storage.put("branding", "svg", svg))).rejects.toThrow(/Clinic files need a clinic/);
  });
});

describe("storage keys", () => {
  it("refuse traversal, unknown extensions and other shapes", () => {
    for (const bad of ["clinics/a/../b/x.svg", "clinics/a/branding/x.exe", "/etc/passwd", "clinics/a/branding/x.svg/.."]) {
      expect(parseKey(bad)).toBeUndefined();
    }
    expect(() => clinicKey("../other", "branding", "x", "svg")).toThrow();
  });

  it("can't reach outside the root through the driver either", async () => {
    await expect(new LocalDiskStorage(root, "s".repeat(32)).get("../outside")).rejects.toThrow(/outside the storage root/);
  });
});
