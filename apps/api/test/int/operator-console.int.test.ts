import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform, staffEmail } from "@pedia/seed";
import { AccountOverview, CreateAccountResult, DEFAULT_OPENING_HOURS, OwnerCandidate, Session } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { FileStorage } from "../../src/storage/storage";
import { resetDatabase } from "./support/database";
import { signIn } from "./support/clinic-login";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** apps/web's mocks/operator.test.ts against the API (B12 Step 7.5): the console's accounts, never a patient record. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b12-console-"));
const platform = seedPlatform();
const NGITI = "clinic_ngiti";
const ngiti = platform.tenants[NGITI]!;
let app: INestApplication;
let prisma: PrismaService;
let op = "";

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform, app.get(FileStorage)); // the photos' files and ledger
  op = await asOperator(app);
}, 60_000);

const http = () => request(app.getHttpServer());
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

describe("the console's accounts on MySQL (decision #25)", () => {
  it("lists every account by name with counts only: no patient field anywhere", async () => {
    const res = await http().get("/api/operator/accounts").set("Cookie", op);
    const rows = AccountOverview.array().parse(res.body);
    expect(rows.map((r) => r.account.name)).toEqual(["Bulilit Smiles Pediatric Dental", "Ipin Kids Dental", "Ngiti Kids Dental"]);
    const bulilit = rows[0]!;
    expect(bulilit.usage).toMatchObject({ branches: 2, patients: platform.tenants[DEMO_CLINIC_ID]!.patients.length });
    expect(bulilit.usage.storage.inUse).toBeGreaterThan(0); // the seeded photos
    expect(bulilit.owner?.email).toBe("owner@gmail.com");
    const text = JSON.stringify(res.body);
    for (const p of platform.tenants[DEMO_CLINIC_ID]!.patients.slice(0, 5)) expect(text).not.toContain(p.lastName);
  });

  it("answers 404 for an unknown account on every account route", async () => {
    for (const [method, path] of [["get", "subscription"], ["get", "staff"], ["post", "suspend"]] as const) {
      const res = await http()[method](`/api/operator/accounts/nope/${path}`).set("Cookie", op);
      expect([res.status, res.text], path).toEqual([404, "Clinic account not found"]);
    }
  });

  it("creates a clinic directly (billing #16): the Owner signs in with the temporary password", async () => {
    const data = {
      account: { name: "Ngipin Direct Dental", contactEmail: "hello@direct.demo", tin: "567-890-123", tier: "mid" },
      branch: { name: "Imus", address: "1 Imus", phone: "(046) 000 0000", openingHours: DEFAULT_OPENING_HOURS },
      owner: { fullName: "Dr. Direct", email: "owner@direct.demo", role: "dentist" },
      branding: { choice: "default" },
      payment: { method: "bank_transfer", paidOn: "2026-10-18", reference: "BT-1" },
      signedOnFile: true,
      signedOn: "2026-10-17",
    };
    const res = await http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify(data));
    expect(res.status).toBe(201);
    const made = CreateAccountResult.parse(res.body);
    const login = await signIn(app, "owner@direct.demo", undefined, made.temporaryPassword);
    expect(Session.parse(login.res.body).user).toMatchObject({ clinicId: made.overview.account.id, mustChangePassword: true });
    const agreement = await prisma.agreement.findFirstOrThrow({ where: { clinicId: made.overview.account.id } });
    expect([agreement.method, agreement.signedOn?.toISOString().slice(0, 10)]).toEqual(["on_file", "2026-10-17"]);
    expect((await http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify(data))).status).toBe(409); // a double-click
  });

  it("moves ownership to an active login; the old Owner keeps their job", async () => {
    const candidates = OwnerCandidate.array().parse((await http().get(`/api/operator/accounts/${NGITI}/staff`).set("Cookie", op)).body);
    expect(candidates.map((c) => c.name)).not.toContain("Dr. Bea Lim"); // the Owner
    const to = candidates.find((c) => c.name === "Dr. Ana Reyes")!;
    const res = await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: to.staffId });
    expect(AccountOverview.parse(res.body).owner?.name).toBe("Dr. Ana Reyes");
    const again = await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: to.staffId });
    expect([again.status, again.text]).toEqual([400, "Dr. Ana Reyes is already the Owner"]);
    const old = await prisma.$queryRaw<{ isOwner: number; role: string }[]>`SELECT isOwner, role FROM Staff WHERE id = 'ngiti_staff_lim'`;
    expect([Number(old[0]!.isOwner), old[0]!.role]).toEqual([0, "dentist"]);
  });

  it("pauses a clinic: staff out at sign-in and on their next request, parents read on; reactivates", async () => {
    const desk = await signIn(app, staffEmail(ngiti.staff.find((s) => s.role === "front_desk")!), NGITI);
    expect((await http().post(`/api/operator/accounts/${NGITI}/suspend`).set("Cookie", op)).status).toBe(200);
    expect((await http().get("/api/patients").set("Cookie", desk.cookie)).status).toBe(401);
    expect((await signIn(app, staffEmail(ngiti.staff.find((s) => s.role === "front_desk")!), NGITI)).res.status).toBe(403);
    const guardian = await prisma.credential.findFirstOrThrow({ where: { clinicId: NGITI, guardianId: { not: null }, phone: { not: null } } });
    expect(Session.parse((await signIn(app, guardian.phone!, NGITI)).res.body).user.readOnly).toBe(true);
    const back = await http().post(`/api/operator/accounts/${NGITI}/reactivate`).set("Cookie", op);
    expect(AccountOverview.parse(back.body).account.status).toBe("active");
  });

  it("sets the look only for Design it for me clinics, and marks it delivered", async () => {
    const refused = await http().put(`/api/operator/accounts/${NGITI}/branding`).set("Cookie", op).field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" }));
    expect(refused.status).toBe(409);
    await http().post("/api/operator/signups/signup_hagikgik/payment").set("Cookie", op).send({ method: "gcash", paidOn: "2026-10-18" });
    const made = CreateAccountResult.parse((await http().post("/api/operator/signups/signup_hagikgik/approve").set("Cookie", op)).body);
    expect(made.overview.design).toBe("in_progress");
    const id = made.overview.account.id;
    const noLogo = await http().put(`/api/operator/accounts/${id}/branding`).set("Cookie", op).field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" }));
    expect([noLogo.status, noLogo.text]).toEqual([400, "Add the finished logo"]);
    const done = await http().put(`/api/operator/accounts/${id}/branding`).set("Cookie", op)
      .field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" })).attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
    expect(AccountOverview.parse(done.body)).toMatchObject({ design: "delivered", look: { brandColor: "#1d4ed8", headingFont: "nunito", hasLogo: true } });
  });
});
