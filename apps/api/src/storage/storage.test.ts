import "reflect-metadata";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Global, Module } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestContext } from "../common/request-context";
import { ENV, loadEnv } from "../config/env";
import { OutboxHandlers } from "../outbox/outbox.handlers";
import { OutboxModule } from "../outbox/outbox.module";
import { LocalDiskStorage } from "./local-disk.storage";
import { clinicKey, parseKey } from "./storage";
import { StorageModule } from "./storage.module";
import { StorageService } from "./storage.service";

let root: string;
let storage: StorageService;
let handlers: OutboxHandlers;

/** Stands in for AppModule's global ENV. */
@Global()
@Module({ providers: [{ provide: ENV, useFactory: () => loadEnv({ DATABASE_URL: "mysql://unused", STORAGE_DIR: root }) }], exports: [ENV] })
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
    const restarted = new StorageService(new LocalDiskStorage(root));
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
    await expect(new LocalDiskStorage(root).get("../outside")).rejects.toThrow(/outside the storage root/);
  });
});
