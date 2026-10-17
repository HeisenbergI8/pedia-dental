import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { ClinicalPhoto, choiceDeclined } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { AuditService } from "../../src/audit/audit.service";
import { OutboxWorker } from "../../src/outbox/outbox.worker";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { LINK_GONE } from "../../src/storage/local-files.controller";
import { StorageService } from "../../src/storage/storage.service";
import { inClinic, resetDatabase } from "./support/database";
import { openFile } from "./support/files";
import { createIntApp } from "./support/int-app";

/** apps/web's "photos" handler tests against the API (CHUNKS B10), with B10's done-when: storage, isolation, restart. */
type Login = readonly [clinicId: string, accountId: string];
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b10-photos-"));
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const own = childrenOf(db, parentGuardianId)[0]!;
const another = db.patients.find((p) => !p.guardians.some((g) => g.id === parentGuardianId) && !choiceDeclined(p, "photos"))!;
const declinedChild = db.patients.find((p) => choiceDeclined(p, "photos"))!;
const UPLOADS = join(tmpdir(), "primolar-uploads");
const spooled = () => readdirSync(UPLOADS);
let app: INestApplication;
let prisma: PrismaService;
let spooledBefore: string[] = [];

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
  spooledBefore = (() => {
    try {
      return spooled();
    } catch {
      return [];
    }
  })();
}, 60_000);
afterAll(async () => {
  expect(spooled().filter((f) => !spooledBefore.includes(f))).toEqual([]); // case 13: no temp file left by this file
  await app.close();
});

const as = async ([clinicId, accountId]: Login) => `pd_session=${await app.get(SessionService).openClinic(clinicId, accountId)}`;
const http = () => request(app.getHttpServer());
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(60, 3)]);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
const SVG = Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>");
type Meta = Record<string, unknown>;
const meta = (m: Meta = {}) => ({ type: "intraoral", takenOn: "2026-10-02", caption: "", ...m });
/** A multipart upload: `meta` as JSON (or raw text), then `file`, each optional. */
function upload(cookie: string, patientId: string, m: Meta | string | null, body: Buffer | null, type = "image/jpeg") {
  let req = http().post(`/api/patients/${patientId}/photos`).set("Cookie", cookie);
  if (m !== null) req = req.field("meta", typeof m === "string" ? m : JSON.stringify(meta(m)));
  if (body) req = req.attach("file", body, { filename: "f", contentType: type });
  return body || m !== null ? req : req.set("Content-Type", "multipart/form-data; boundary=x").send("--x--\r\n");
}
const said = async (res: Promise<request.Response>) => {
  const r = await res;
  return [r.status, r.text];
};
const visitOf = (patientId: string) => db.visits.find((v) => v.patientId === patientId)!;
const used = (clinicId: string) => inClinic(clinicId, () => app.get(StorageService).usedBytes());

describe("photos (apps/web handlers.test.ts → photos)", () => {
  it("lists before and after on a tooth newest first, and serves the bytes through a 5-minute link", async () => {
    const dentist = await as(DENTIST);
    const p = another;
    const before = ClinicalPhoto.parse((await upload(dentist, p.id, { tooth: 74, stage: "before", takenOn: "2026-09-01" }, JPEG)).body);
    const after = ClinicalPhoto.parse((await upload(dentist, p.id, { tooth: 74, stage: "after", takenOn: "2026-10-01" }, JPEG)).body);
    const list = z.array(ClinicalPhoto).parse((await http().get(`/api/patients/${p.id}/photos`).set("Cookie", dentist)).body);
    expect(list.filter((x) => x.tooth === 74).map((x) => x.id)).toEqual([after.id, before.id]);
    const { first, file } = await openFile(app, dentist, `/api/photos/${before.id}/file`);
    expect([first.status, file?.status, file?.headers["content-type"]]).toEqual([302, 200, "image/jpeg"]);
    expect((file!.body as Buffer).equals(JPEG)).toBe(true);
  });

  it("refuses a non-image, a bad tooth and another child's visit", async () => {
    const dentist = await as(DENTIST);
    expect(await said(upload(dentist, another.id, {}, Buffer.from("hello"), "text/plain"))).toEqual([400, "Attach an image file"]);
    const tooth = await upload(dentist, another.id, { tooth: 19 }, JPEG);
    expect([tooth.status, Array.isArray(tooth.body)]).toEqual([400, true]);
    expect(await said(upload(dentist, another.id, { visitId: visitOf(own.id).id }, JPEG))).toEqual([400, "Visit not found"]);
  });

  it("takes a PDF as a medical document, opens it inline or as an attachment, but not as a clinical photo", async () => {
    const dentist = await as(DENTIST);
    const doc = ClinicalPhoto.parse((await upload(dentist, another.id, { type: "document" }, PDF, "application/pdf")).body);
    expect(doc.contentType).toBe("application/pdf");
    const opened = await openFile(app, dentist, `/api/photos/${doc.id}/file`);
    expect(opened.file!.headers["content-disposition"]).toMatch(/^inline; filename=".+-document-2026-10-02\.pdf"$/);
    const saved = await openFile(app, dentist, `/api/photos/${doc.id}/file?download=1`);
    expect(saved.file!.headers["content-disposition"]).toMatch(/^attachment; filename=".+\.pdf"$/);
    expect((await upload(dentist, another.id, {}, PDF, "application/pdf")).status).toBe(400);
  });

  it("answers in the mock's order, with its words", async () => {
    const dentist = await as(DENTIST);
    const parent = await as(PARENT);
    expect(await said(upload(dentist, "nobody", {}, JPEG))).toEqual([404, "Patient not found"]);
    expect(await said(upload(dentist, another.id, {}, null))).toEqual([400, "Attach a file"]);
    expect(await said(upload(dentist, another.id, "oops", JPEG))).toEqual([400, "`meta` must be JSON"]);
    expect((await upload(dentist, another.id, null, JPEG)).status).toBe(400);
    const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
    expect(await said(upload(dentist, another.id, {}, big))).toEqual([413, "Files must be under 10 MB"]);
    expect(await said(upload(dentist, another.id, "oops", big))).toEqual([400, "`meta` must be JSON"]); // meta is checked first
    expect(await said(upload(dentist, another.id, {}, SVG))).toEqual([400, "Attach an image file"]);
    const refusal = await said(upload(dentist, declinedChild.id, {}, JPEG));
    expect(refusal).toEqual([409, `${declinedChild.firstName}'s family declined clinical photos. Staff can change this under Privacy on the child's Overview; parents on the portal's Home page.`]);
    expect((await upload(dentist, declinedChild.id, { type: "xray" }, JPEG)).status).toBe(201); // only photos need consent
    expect(await said(upload(parent, own.id, { type: "xray" }, JPEG))).toEqual([400, "Upload a photo or a medical document"]);
    expect(await said(upload(parent, own.id, { tooth: 74 }, JPEG))).toEqual([400, "Upload a photo or a medical document"]);
    expect(ClinicalPhoto.parse((await upload(parent, own.id, { type: "document" }, PDF, "application/pdf")).body).uploadedBy).toBe("parent");
    expect((await upload(await as(FRONT_DESK), another.id, {}, JPEG)).status).toBe(403); // front desk can't upload: the rule
  });

  it("lets the bytes decide the type", async () => {
    const dentist = await as(DENTIST);
    const photo = ClinicalPhoto.parse((await upload(dentist, another.id, {}, PNG, "image/jpeg")).body);
    expect(photo.contentType).toBe("image/png");
    expect((await openFile(app, dentist, `/api/photos/${photo.id}/file`)).file!.headers["content-type"]).toBe("image/png");
  });

  it("shows a parent only parent uploads, and never opens clinical imaging for them", async () => {
    const dentist = await as(DENTIST);
    const parent = await as(PARENT);
    const staffPhoto = ClinicalPhoto.parse((await upload(dentist, own.id, {}, JPEG)).body);
    const theirs = ClinicalPhoto.parse((await upload(parent, own.id, { type: "extraoral" }, JPEG)).body);
    const list = z.array(ClinicalPhoto).parse((await http().get(`/api/patients/${own.id}/photos`).set("Cookie", parent)).body);
    expect(list.every((p) => p.uploadedBy === "parent")).toBe(true);
    expect(list.map((p) => p.id)).toContain(theirs.id);
    expect(await said(http().get(`/api/photos/${staffPhoto.id}/file`).set("Cookie", parent))).toEqual([404, "Photo not found"]);
    expect((await openFile(app, parent, `/api/photos/${theirs.id}/file`)).file?.status).toBe(200);
    const other = ClinicalPhoto.parse((await upload(dentist, another.id, {}, JPEG)).body);
    expect(await said(http().get(`/api/photos/${other.id}/file`).set("Cookie", parent))).toEqual([403, "This isn't one of your children's records"]);
  });
});

describe("B10's guarantees", () => {
  it("never keeps a photo when a family's 'no' to photos lands mid-upload (E6)", async () => {
    const dentist = await as(DENTIST);
    const desk = await as(FRONT_DESK);
    const child = db.patients.find((p) => p.privacyConsent && !choiceDeclined(p, "photos") && p.id !== another.id && p.id !== own.id)!;
    const storage = app.get(StorageService);
    const real = storage.putFile.bind(storage);
    let stored = "";
    vi.spyOn(storage, "putFile").mockImplementationOnce(async (...args) => {
      stored = await real(...args);
      expect((await http().post(`/api/patients/${child.id}/privacy-choices`).set("Cookie", desk).send({ photos: false })).status).toBe(200);
      return stored;
    });
    const before = await used(DEMO_CLINIC_ID);
    const res = await upload(dentist, child.id, {}, JPEG);
    expect(res.status).toBe(409);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.clinicalPhoto.count({ where: { patientId: child.id } }))).toBe(0);
    expect((await prisma.outboxMessage.findMany({ where: { kind: "storage.delete", status: "pending" } })).map((o) => o.payload)).toContainEqual({ key: stored });
    while ((await app.get(OutboxWorker).drain()) > 0);
    expect(await inClinic(DEMO_CLINIC_ID, () => storage.get(stored))).toBeUndefined();
    expect(await used(DEMO_CLINIC_ID)).toBe(before);
  });

  it("never lets one clinic reach another's photo or file, even with its key (decision 3)", async () => {
    const dentist = await as(DENTIST);
    const photo = ClinicalPhoto.parse((await upload(dentist, another.id, {}, JPEG)).body);
    const ngiti = await as(NGITI_OWNER);
    expect(await said(http().get(`/api/photos/${photo.id}/file`).set("Cookie", ngiti))).toEqual(await said(http().get("/api/photos/never/file").set("Cookie", ngiti)));
    expect((await upload(ngiti, another.id, {}, JPEG)).status).toBe(404);
    const key = (await inClinic(DEMO_CLINIC_ID, () => prisma.clinicalPhoto.findFirstOrThrow({ where: { id: photo.id } }))).fileKey;
    const storage = app.get(StorageService);
    expect(await inClinic("clinic_ngiti", () => storage.link(key, { fileName: "x.jpg" }))).toBeUndefined();
    expect(await inClinic("clinic_ngiti", () => storage.get(key))).toBeUndefined();
    // A link can't be forged to name Bulilit's key: the token is encrypted and authenticated (audit finding 1, E8), and it
    // never shows the child's name in the URL.
    const link = (await openFile(app, dentist, `/api/photos/${photo.id}/file`)).first.headers.location!;
    expect(Buffer.from(link.slice("/api/files/".length), "base64url").toString("latin1")).not.toContain(another.lastName.toLowerCase());
    const forged = Buffer.from(JSON.stringify({ key, exp: Date.now() + 60_000, name: "x.jpg", download: false })).toString("base64url");
    expect(await said(http().get(`/api/files/${forged}`))).toEqual([404, LINK_GONE]);
  });

  it("keeps photos across an API restart (done-when)", async () => {
    const dentist = await as(DENTIST);
    const photo = ClinicalPhoto.parse((await upload(dentist, another.id, { caption: "Survives" }, JPEG)).body);
    const oldLink = (await openFile(app, dentist, `/api/photos/${photo.id}/file`)).first.headers.location!;
    await app.close();
    app = await createIntApp({ env: { STORAGE_DIR } });
    prisma = app.get(PrismaService);
    const cookie = await as(DENTIST);
    const list = z.array(ClinicalPhoto).parse((await http().get(`/api/patients/${another.id}/photos`).set("Cookie", cookie)).body);
    expect(list.map((p) => p.id)).toContain(photo.id);
    const { file } = await openFile(app, cookie, `/api/photos/${photo.id}/file`);
    expect((file!.body as Buffer).equals(JPEG)).toBe(true);
    expect((await http().get(oldLink)).status).toBe(404); // links die with the process; files don't
  });

  it("counts each clinic's stored bytes, and nothing for a refused upload (decision 8)", async () => {
    const dentist = await as(DENTIST);
    const [bulilit, ngiti] = [await used(DEMO_CLINIC_ID), await used("clinic_ngiti")];
    await upload(dentist, another.id, {}, JPEG);
    await upload(dentist, another.id, {}, PNG, "image/png");
    await upload(dentist, another.id, {}, SVG); // refused before storing
    expect(await used(DEMO_CLINIC_ID)).toBe(bulilit + JPEG.length + PNG.length);
    expect(await used("clinic_ngiti")).toBe(ngiti);
  });

  it("audits each list, each stored upload and each open, and never a refused upload", async () => {
    const dentist = await as(DENTIST);
    // From the end of the roster: the consent race above switched photos off for the first such child.
    const child = db.patients.findLast((p) => p.privacyConsent && !choiceDeclined(p, "photos") && ![another.id, own.id].includes(p.id))!;
    const count = (action: string, record: string) => inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { patientId: child.id, record, action: action as never } }));
    await upload(dentist, child.id, {}, SVG);
    expect(await count("create", "Photo")).toBe(0);
    const photo = ClinicalPhoto.parse((await upload(dentist, child.id, {}, JPEG)).body);
    expect(await count("create", "Photo")).toBe(1);
    await http().get(`/api/patients/${child.id}/photos`).set("Cookie", dentist);
    expect(await count("view", "Photos")).toBe(1);
    await openFile(app, dentist, `/api/photos/${photo.id}/file`);
    await openFile(app, dentist, `/api/photos/${photo.id}/file`);
    expect(await count("view", "Photo")).toBe(1); // within five minutes, once
  });

  it("refuses an impossible date, a bodiless multipart and an over-long id without a 500 or a stray file (tester D1–D3)", async () => {
    const dentist = await as(DENTIST);
    const before = await used(DEMO_CLINIC_ID);
    for (const takenOn of ["2026-13-45", "2026-02-30", "0000-00-00"]) expect((await upload(dentist, another.id, { takenOn }, JPEG)).status).toBe(400);
    for (const type of ["multipart/form-data", "multipart/form-data; boundary="]) {
      const res = await http().post(`/api/patients/${another.id}/photos`).set("Cookie", dentist).set("Content-Type", type).send("x");
      expect([res.status, res.text]).toEqual([400, "The upload didn't arrive whole. Try again."]);
    }
    expect(await used(DEMO_CLINIC_ID)).toBe(before);
    const long = "x".repeat(255);
    expect([(await http().get(`/api/patients/${long}/photos`).set("Cookie", dentist)).body, (await http().get(`/api/patients/${long}/documents`).set("Cookie", dentist)).body]).toEqual([[], []]);
  });

  it("removes the stored file when the photo's row can't be written", async () => {
    const dentist = await as(DENTIST);
    const before = await used(DEMO_CLINIC_ID);
    vi.spyOn(app.get(AuditService), "record").mockRejectedValueOnce(new Error("audit down"));
    expect((await upload(dentist, another.id, {}, JPEG)).status).toBe(500);
    expect(await used(DEMO_CLINIC_ID)).toBe(before);
  });

  it("has no way to change or delete a photo (decision 5)", async () => {
    const dentist = await as(DENTIST);
    const photo = ClinicalPhoto.parse((await upload(dentist, another.id, {}, JPEG)).body);
    expect((await http().delete(`/api/photos/${photo.id}`).set("Cookie", dentist)).status).toBe(404);
    await expect(inClinic(DEMO_CLINIC_ID, () => prisma.clinicalPhoto.update({ where: { id: photo.id }, data: { caption: "x" } }))).rejects.toThrow(/append-only/);
  });
});
