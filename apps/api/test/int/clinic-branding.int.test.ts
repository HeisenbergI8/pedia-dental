import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { ClinicAccount, ClinicContext } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { StorageService } from "../../src/storage/storage.service";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR: mkdtempSync(join(tmpdir(), "b3-logo-")) } });
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
}, 60_000);
afterAll(() => app.close());

const NGITI_OWNER = ["clinic_ngiti", "ngiti_staff_lim"] as const;
const DEMO_ADMIN = ["clinic_demo", "staff_delacruz"] as const;
const as = async ([clinicId, accountId]: readonly [string, string]) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const http = () => request(app.getHttpServer());
const context = async (cookie: string) => ClinicContext.parse((await http().get("/api/clinic").set("Cookie", cookie)).body);
const upload = (cookie: string, type: string, name: string, body: string | Buffer) =>
  http().put("/api/clinic/logo").set("Cookie", cookie).attach("file", Buffer.from(body), { filename: name, contentType: type });
const deletions = () => prisma.outboxMessage.findMany({ where: { kind: "storage.delete" }, select: { payload: true } });

describe("branding (owner-settings.test.ts, decisions #28–#31)", () => {
  it("refuses a low-contrast colour with the nearest that passes, and saves a passing one", async () => {
    const cookie = await as(NGITI_OWNER);
    const refused = await http().put("/api/clinic/branding").set("Cookie", cookie).send({ brandColor: "#e07a48", headingFont: null });
    expect(refused.status).toBe(400);
    expect(refused.text).toMatch(/too light for text and buttons.*Try #[0-9a-f]{6}\.$/);
    const saved = await http().put("/api/clinic/branding").set("Cookie", cookie).send({ brandColor: "#0D6E8C", headingFont: null });
    expect(ClinicAccount.parse(saved.body).brandColor).toBe("#0d6e8c");
    expect((await context(cookie)).account.brandColor).toBe("#0d6e8c");
  });

  it("lets a Small clinic choose a heading font (billing #8)", async () => {
    const cookie = await as(NGITI_OWNER);
    const saved = await http().put("/api/clinic/branding").set("Cookie", cookie).send({ brandColor: "#1e5fb4", headingFont: "nunito" });
    expect(ClinicAccount.parse(saved.body).headingFont).toBe("nunito");
    expect((await context(cookie)).account.headingFont).toBe("nunito");
  });

  it("is the Owner's alone", async () => {
    const res = await http().put("/api/clinic/branding").set("Cookie", await as(DEMO_ADMIN)).send({ brandColor: "#1e5fb4", headingFont: null });
    expect(res.status).toBe(403);
  });

  it("serves the seeded logo as a static file, and an uploaded one from storage with the sandbox CSP", async () => {
    const cookie = await as(NGITI_OWNER);
    expect((await context(cookie)).logoUrl).toBe("/demo/ngiti-logo.svg");
    const res = await upload(cookie, "image/svg+xml", "logo.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const account = ClinicAccount.parse(res.body);
    expect((await context(cookie)).logoUrl).toContain(`/clinic/logo?v=${encodeURIComponent(account.logoRef!)}`);
    const logo = await http().get("/api/clinic/logo").set("Cookie", cookie);
    expect([logo.status, logo.headers["content-type"]]).toEqual([200, "image/svg+xml"]);
    expect(logo.headers["content-security-policy"]).toContain("sandbox");
    expect(logo.headers["x-content-type-options"]).toBe("nosniff");
    expect((await upload(cookie, "image/gif", "logo.gif", "GIF89a")).status).toBe(400);
    expect(await deletions()).toEqual([]); // the seeded logo was unlinked, never deleted
  });

  it("stores an SVG without its script, and refuses bytes that aren't the declared type", async () => {
    const cookie = await as(NGITI_OWNER);
    await upload(cookie, "image/svg+xml", "x.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script><rect width="1" height="1"/></svg>');
    const stored = (await http().get("/api/clinic/logo").set("Cookie", cookie).buffer(true)).body as Buffer;
    expect(stored.toString()).not.toMatch(/script|onload|alert/);
    const renamed = await upload(cookie, "image/png", "fake.png", "GIF89a");
    expect([renamed.status, renamed.text]).toEqual([400, "Choose a PNG, JPG or SVG file"]);
    const big = await upload(cookie, "image/png", "big.png", Buffer.alloc(1024 * 1024 + 10, 1));
    expect([big.status, big.text]).toEqual([413, "Logos must be 1 MB or smaller"]);
    const none = await http().put("/api/clinic/logo").set("Cookie", cookie).field("other", "x");
    expect([none.status, none.text]).toEqual([400, "Attach the logo file"]);
  });

  it("deletes the replaced logo's file through the outbox, after the swap commits", async () => {
    const cookie = await as(NGITI_OWNER);
    const before = ClinicAccount.parse((await upload(cookie, "image/svg+xml", "a.svg", '<svg xmlns="http://www.w3.org/2000/svg"/>')).body).logoRef!;
    const removed = ClinicAccount.parse((await http().delete("/api/clinic/logo").set("Cookie", cookie)).body);
    expect(removed.logoRef).toBeUndefined();
    expect((await context(cookie)).logoUrl).toBeNull();
    expect((await deletions()).map((d) => (d.payload as { key: string }).key)).toContain(before);
    await app.get(OutboxWorker).drain();
    expect(await inClinic("clinic_ngiti", () => app.get(StorageService).get(before))).toBeUndefined();
    expect((await http().get("/api/clinic/logo").set("Cookie", cookie)).status).toBe(404);
  });

  it("never shows one clinic's logo to another", async () => {
    const bulilit = await as(["clinic_demo", "staff_villanueva"]);
    expect((await context(bulilit)).logoUrl).toBe("/demo/bulilit-logo.svg");
    expect((await http().get("/api/clinic/logo").set("Cookie", bulilit)).status).toBe(404);
  });

  it("checks the TIN format (decision #42)", async () => {
    const cookie = await as(NGITI_OWNER);
    const profile = { name: "Ngiti Kids Dental", contactEmail: "hello@ngiti.demo", tin: "234567890" };
    expect((await http().put("/api/clinic").set("Cookie", cookie).send(profile)).status).toBe(400);
    const saved = await http().put("/api/clinic").set("Cookie", cookie).send({ ...profile, tin: "234-567-890-0001" });
    expect(ClinicAccount.parse(saved.body).tin).toBe("234-567-890-0001");
  });
});
