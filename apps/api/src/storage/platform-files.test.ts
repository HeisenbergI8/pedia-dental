import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalDiskStorage } from "./local-disk.storage";
import { PlatformFilesService } from "./platform-files.service";
import { clinicKey, parseKey, parsePlatformKey, platformKey } from "./storage";

let root: string;
let disk: LocalDiskStorage;
let files: PlatformFilesService;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "b12-platform-"));
  disk = new LocalDiskStorage(root, "s".repeat(32));
  files = new PlatformFilesService(disk);
});
afterAll(() => rm(root, { recursive: true, force: true }));

describe("platform keys (B12 E2)", () => {
  it("round-trip, and are never clinic keys (nor the reverse)", () => {
    const key = platformKey("receipts", "abc_1", "png");
    expect(key).toBe("platform/receipts/abc_1.png");
    expect(parsePlatformKey(key)).toEqual({ area: "receipts", name: "abc_1", ext: "png" });
    expect(parseKey(key)).toBeUndefined();
    expect(parsePlatformKey(clinicKey("clinic_a", "photos", "p1", "png"))).toBeUndefined();
  });

  it("refuse traversal, an unknown area or extension, and a bad name", () => {
    for (const bad of ["platform/../x.png", "platform/other/x.png", "platform/receipts/x.gif", "platform/receipts/../x.png", "platform/receipts/a/b.png"]) {
      expect(parsePlatformKey(bad), bad).toBeUndefined();
    }
    expect(() => platformKey("receipts", "../x", "png")).toThrow();
  });
});

describe("PlatformFilesService", () => {
  it("stores a checked upload, copies it back, links it and deletes it; ignores clinic keys", async () => {
    const path = join(root, "upload.tmp");
    await writeFile(path, Buffer.from("receipt"));
    const key = await files.putFile("receipts", "png", { path, bytes: 7 });
    expect(parsePlatformKey(key)?.area).toBe("receipts");
    expect((await files.copy(key))?.body.toString()).toBe("receipt");
    const link = await files.link(key, { fileName: "receipt" });
    const opened = await disk.open(link!.split("/").pop()!);
    expect([opened?.contentType, opened?.name]).toEqual(["image/png", "receipt.png"]);
    opened?.stream.destroy();
    const clinicFile = clinicKey("clinic_a", "photos", "p1", "png");
    await disk.put(clinicFile, Buffer.from("x"), { contentType: "image/png", bytes: 1 });
    expect([await files.copy(clinicFile), await files.link(clinicFile, { fileName: "x" })]).toEqual([undefined, undefined]);
    await files.delete(clinicFile); // not a platform key: left alone
    expect(await disk.get(clinicFile)).toBeDefined();
    await files.delete(key);
    expect(await files.copy(key)).toBeUndefined();
  });

  it("removes the stored files when the write that points at them fails", async () => {
    const key = await files.put("signups", "png", Buffer.from("logo"));
    await expect(files.keepIf([key, undefined], async () => Promise.reject(new Error("refused")))).rejects.toThrow("refused");
    expect(await files.copy(key)).toBeUndefined();
  });
});
