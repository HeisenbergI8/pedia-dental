import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, childrenOf, seedPlatform } from "@pedia/seed";
import { Patient, PatientView } from "@pedia/shared";
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

/** The mock's "stores, serves and removes the child's photo" and the photo routes' rules, against the API (B4e). */
const platform = seedPlatform();
const db = platform.tenants[DEMO_CLINIC_ID]!;
let app: INestApplication;
let prisma: PrismaService;
let sessions: SessionService;

type Login = readonly [clinicId: string, accountId: string];
const FRONT_DESK: Login = [DEMO_CLINIC_ID, "staff_cruz"];
const DENTIST: Login = [DEMO_CLINIC_ID, "staff_reyes"];
const NGITI_OWNER: Login = ["clinic_ngiti", "ngiti_staff_lim"];
const parentGuardianId = db.patients.find((p) => p.id === "patient_sibling")!.guardians[0]!.id;
const PARENT: Login = [DEMO_CLINIC_ID, `guardian.${parentGuardianId}`];
const own = childrenOf(db, parentGuardianId)[0]!;
const another = db.patients.find((p) => !p.guardians.some((g) => g.id === parentGuardianId))!;

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR: mkdtempSync(join(tmpdir(), "b4-photo-")) } });
  prisma = app.get(PrismaService);
  sessions = app.get(SessionService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async ([clinicId, accountId]: Login) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const http = () => request(app.getHttpServer());
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const put = (cookie: string, id: string, body: Buffer, type = "image/jpeg") =>
  http().put(`/api/patients/${id}/photo`).set("Cookie", cookie).attach("file", body, { filename: "photo", contentType: type });
const get = (cookie: string, id: string) => http().get(`/api/patients/${id}/photo`).set("Cookie", cookie);
const del = (cookie: string, id: string) => http().delete(`/api/patients/${id}/photo`).set("Cookie", cookie);
const photoRef = (id: string) => inClinic(DEMO_CLINIC_ID, async () => (await prisma.patient.findUniqueOrThrow({ where: { id }, select: { photoRef: true } })).photoRef);
const deletions = () => prisma.outboxMessage.findMany({ where: { kind: "storage.delete", status: "pending" }, select: { payload: true } });
const stored = (key: string) => inClinic(DEMO_CLINIC_ID, () => app.get(StorageService).get(key));

describe("the child's photo", () => {
  it("stores, serves and removes the child's photo", async () => {
    const cookie = await as(FRONT_DESK);
    const p = db.patients[0]!;
    const withPhoto = Patient.parse((await put(cookie, p.id, JPEG)).body);
    expect(withPhoto.photoUpdatedAt).toBeDefined();
    const res = await get(cookie, p.id);
    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain(`${p.lastName}-${p.firstName}-photo.jpg`.replace(/[^\w.-]+/g, "-").toLowerCase());
    expect([res.headers["content-type"], res.headers["x-content-type-options"]]).toEqual(["image/jpeg", "nosniff"]);
    const removed = Patient.parse((await del(cookie, p.id)).body);
    expect(removed.photoUpdatedAt).toBeUndefined();
    const gone = await get(cookie, p.id);
    expect([gone.status, gone.text]).toEqual([404, "No photo"]);
  });

  it("queues the replaced file's deletion through the outbox", async () => {
    const cookie = await as(FRONT_DESK);
    const id = db.patients[1]!.id;
    await put(cookie, id, JPEG);
    const first = (await photoRef(id))!;
    await put(cookie, id, PNG, "image/png");
    const second = (await photoRef(id))!;
    expect((await deletions()).map((d) => d.payload)).toContainEqual({ key: first });
    await app.get(OutboxWorker).drain();
    expect(await stored(first)).toBeUndefined();
    expect((await stored(second))?.contentType).toBe("image/png");
    expect((await get(cookie, id)).headers["content-type"]).toBe("image/png");
    await del(cookie, id);
    expect((await deletions()).map((d) => d.payload)).toContainEqual({ key: second });
  });

  it("refuses what isn't a photo, with the mock's words", async () => {
    const cookie = await as(FRONT_DESK);
    const id = db.patients[2]!.id;
    const text = await put(cookie, id, Buffer.from("fake-jpeg"));
    expect([text.status, text.text]).toEqual([400, "Attach an image file"]);
    const svg = await put(cookie, id, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), "image/svg+xml");
    expect([svg.status, svg.text]).toEqual([400, "Attach an image file"]);
    const big = await put(cookie, id, Buffer.concat([JPEG, Buffer.alloc(11 * 1024 * 1024)]));
    expect([big.status, big.text]).toEqual([413, "Images must be under 10 MB"]);
    const missing = await put(cookie, "nobody", JPEG);
    expect([missing.status, missing.text]).toEqual([404, "Patient not found"]);
  });
});

describe("audit, access and tenancy", () => {
  it("audits one view per five minutes, each change, and nothing for a missing photo", async () => {
    const id = db.patients[3]!.id;
    const desk = await as(FRONT_DESK);
    const count = (action: string, actorId?: string) =>
      inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { patientId: id, record: "Patient photo", action: action as never, ...(actorId && { actorId }) } }));
    const before = await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Patient photo" } }));
    expect((await get(desk, id)).status).toBe(404);
    expect(await inClinic(DEMO_CLINIC_ID, () => prisma.auditEvent.count({ where: { record: "Patient photo" } }))).toBe(before);
    await put(desk, id, JPEG);
    const dentist = await as(DENTIST);
    await get(dentist, id);
    await get(dentist, id);
    expect(await count("view", "staff_reyes")).toBe(1);
    await del(desk, id);
    expect(await count("update")).toBe(2);
  });

  it("lets a parent see their own child's photo, not another family's, and never upload", async () => {
    const desk = await as(FRONT_DESK);
    await put(desk, own.id, JPEG);
    await put(desk, another.id, JPEG);
    const parent = await as(PARENT);
    expect((await get(parent, own.id)).status).toBe(200);
    const theirs = await get(parent, another.id);
    expect([theirs.status, theirs.text]).toEqual([403, "This isn't one of your children's records"]);
    const upload = await put(parent, own.id, JPEG);
    expect([upload.status, upload.text]).toEqual([403, "You don't have access to this"]);
    expect(PatientView.parse((await http().get(`/api/patients/${own.id}`).set("Cookie", parent)).body).photoUpdatedAt).toBeDefined();
  });

  it("never serves another clinic's photo", async () => {
    const ngiti = await as(NGITI_OWNER);
    const res = await get(ngiti, own.id);
    expect([res.status, res.text]).toEqual([404, "No photo"]);
    // Even a key read inside another clinic is refused by StorageService.
    const key = (await photoRef(own.id))!;
    expect(await inClinic("clinic_ngiti", () => app.get(StorageService).get(key))).toBeUndefined();
  });
});
