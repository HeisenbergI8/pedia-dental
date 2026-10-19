import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { DEMO_CLINIC_ID, seedPlatform, staffEmail } from "@pedia/seed";
import {
  AccountOverview, ClinicContext, CreateAccountResult, DEFAULT_OPENING_HOURS, DUPLICATE_EMAIL_MESSAGE, OwnerCandidate, Session, duplicateNameMessage,
} from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { CLINIC_RULES } from "../../src/auth/access-rules";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { FileStorage } from "../../src/storage/storage";
import { inClinic, resetDatabase } from "./support/database";
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

  it("has every clinic signed on file and current, and one Bulilit child without consent, as a count", async () => {
    const rows = AccountOverview.array().parse((await http().get("/api/operator/accounts").set("Cookie", op)).body);
    expect(rows.map((r) => r.account.id).sort()).toEqual(platform.accounts.map((a) => a.id).sort());
    for (const r of rows) expect(r.privacy, r.account.id).toMatchObject({ current: true, agreement: { method: "on_file" } });
    expect(rows.find((r) => r.account.id === DEMO_CLINIC_ID)!.privacy.patientsWithoutConsent).toBe(1);
    const demo = platform.tenants[DEMO_CLINIC_ID]!;
    expect(demo.patients.filter((p) => !p.privacyConsent).map((p) => p.id)).toEqual([demo.patients[5]!.id]); // the one counted
    expect(demo.patients[11]!.privacyChoices![0]!.photos).toBe(false);
  });

  it("answers 404 for an unknown account on every account route", async () => {
    for (const id of ["__proto__", "constructor", "toString", "nope"]) {
      for (const [method, path] of [["get", "subscription"], ["get", "staff"], ["post", "suspend"], ["post", "owner"]] as const) {
        const url = `/api/operator/accounts/${id}/${path}`;
        const res = await (method === "post" ? http().post(url).set("Cookie", op).send({ staffId: "x" }) : http().get(url).set("Cookie", op));
        expect([res.status, res.text], `${id} ${path}`).toEqual([404, "Clinic account not found"]);
      }
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
    const { signedOnFile: _ticked, ...unticked } = data;
    const { signedOn: _date, ...undated } = data;
    for (const without of [unticked, undated]) {
      expect((await http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify(without))).status).toBe(400);
    }
    const res = await http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify(data));
    expect(res.status).toBe(201);
    const made = CreateAccountResult.parse(res.body);
    expect(made.overview).toMatchObject({ account: { tier: "mid", status: "active" }, owner: { email: "owner@direct.demo" }, usage: { branches: 1, staffLogins: 1, patients: 0 } });
    expect(AccountOverview.array().parse((await http().get("/api/operator/accounts").set("Cookie", op)).body)).toHaveLength(4); // the seed's three and this one
    // A5: written as an approved, paid sign-up from the console, so its first payment is in one place.
    expect(await prisma.signup.findUniqueOrThrow({ where: { clinicId: made.overview.account.id } })).toMatchObject({ source: "console", status: "approved", paymentMethod: "bank_transfer" });
    expect(made.overview.privacy.agreement).toMatchObject({ method: "on_file", signedOn: "2026-10-17", acceptedBy: "Dr. Direct" });
    const login = await signIn(app, "owner@direct.demo", undefined, made.temporaryPassword);
    expect(Session.parse(login.res.body).user).toMatchObject({ clinicId: made.overview.account.id, mustChangePassword: true });
    expect(Session.parse(login.res.body).user.roles).toEqual(["owner", "dentist"]);
    const agreement = await prisma.agreement.findFirstOrThrow({ where: { clinicId: made.overview.account.id } });
    expect([agreement.method, agreement.signedOn?.toISOString().slice(0, 10)]).toEqual(["on_file", "2026-10-17"]);
    expect((await http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify(data))).status).toBe(409); // a double-click
  });

  it("moves ownership to an active login; the old Owner keeps their job", async () => {
    const candidates = OwnerCandidate.array().parse((await http().get(`/api/operator/accounts/${NGITI}/staff`).set("Cookie", op)).body);
    expect(candidates.map((c) => c.name)).not.toContain("Dr. Bea Lim"); // the Owner
    const to = candidates.find((c) => c.name === "Dr. Ana Reyes")!;
    const oldOwner = await signIn(app, staffEmail(ngiti.staff.find((s) => s.isOwner)!), NGITI); // Dr. Bea Lim, signed in throughout
    expect((await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: "staff_villanueva" })).status).toBe(400); // another account's
    await prisma.$executeRaw`UPDATE Staff SET deactivatedAt = NOW(3) WHERE id = ${to.staffId}`;
    expect((await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: to.staffId })).status).toBe(400);
    await prisma.$executeRaw`UPDATE Staff SET deactivatedAt = NULL WHERE id = ${to.staffId}`;
    const res = await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: to.staffId });
    expect(AccountOverview.parse(res.body).owner?.name).toBe("Dr. Ana Reyes");
    const again = await http().post(`/api/operator/accounts/${NGITI}/owner`).set("Cookie", op).send({ staffId: to.staffId });
    expect([again.status, again.text]).toEqual([400, "Dr. Ana Reyes is already the Owner"]);
    const old = await prisma.$queryRaw<{ isOwner: number; role: string }[]>`SELECT isOwner, role FROM Staff WHERE id = 'ngiti_staff_lim'`;
    expect([Number(old[0]!.isOwner), old[0]!.role]).toEqual([0, "dentist"]);
    const [owners] = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*) AS n FROM Staff WHERE clinicId = ${NGITI} AND isOwner = 1`;
    expect(Number(owners!.n)).toBe(1);
    expect((await http().get("/api/auth/me").set("Cookie", oldOwner.cookie)).body.roles).toEqual(["dentist"]);
    expect((await http().get("/api/clinic/usage").set("Cookie", oldOwner.cookie)).status).toBe(403); // clinic.manage went with ownership
    expect((await http().get("/api/clinic").set("Cookie", oldOwner.cookie)).status).toBe(200); // still works there
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
    expect((await signIn(app, staffEmail(ngiti.staff.find((s) => s.role === "front_desk")!), NGITI)).res.status).toBe(200); // reactivation lets staff back in
  });

  it("sets the look only for Design it for me clinics, and marks it delivered", async () => {
    const refused = await http().put(`/api/operator/accounts/${NGITI}/branding`).set("Cookie", op).field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" }));
    expect(refused.status).toBe(409);
    await http().post("/api/operator/signups/signup_hagikgik/payment").set("Cookie", op).send({ method: "gcash", paidOn: "2026-10-18" });
    const made = CreateAccountResult.parse((await http().post("/api/operator/signups/signup_hagikgik/approve").set("Cookie", op)).body);
    expect(made.overview.design).toBe("in_progress");
    const id = made.overview.account.id;
    expect(made.overview.look).toMatchObject({ headingFont: null, hasLogo: false });
    expect(await prisma.clinicAccount.findUniqueOrThrow({ where: { id } })).toMatchObject({ brandColor: "#5b3fa8", logoRef: null });
    const pale = await http().put(`/api/operator/accounts/${id}/branding`).set("Cookie", op)
      .field("data", JSON.stringify({ brandColor: "#9fe3d0", headingFont: "fredoka" })).attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
    expect(pale.status).toBe(400);
    const noLogo = await http().put(`/api/operator/accounts/${id}/branding`).set("Cookie", op).field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" }));
    expect([noLogo.status, noLogo.text]).toEqual([400, "Add the finished logo"]);
    const done = await http().put(`/api/operator/accounts/${id}/branding`).set("Cookie", op)
      .field("data", JSON.stringify({ brandColor: "#1d4ed8", headingFont: "nunito" })).attach("logo", PNG, { filename: "logo.png", contentType: "image/png" });
    expect(AccountOverview.parse(done.body)).toMatchObject({ design: "delivered", look: { brandColor: "#1d4ed8", headingFont: "nunito", hasLogo: true } });
    // The new Owner opens their clinic in the delivered look (temporary password, then their own, then confidentiality).
    const login = await signIn(app, made.overview.owner!.email, id, made.temporaryPassword);
    const changed = await http().post("/api/auth/password").set("Cookie", login.cookie).send({ current: made.temporaryPassword, next: "Bago-Password-2026" });
    const cookie = ([] as string[]).concat(changed.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))?.split(";")[0] ?? login.cookie;
    expect((await http().post("/api/auth/acknowledgement").set("Cookie", cookie).send({ kind: "confidentiality", version: 1 })).status).toBe(200);
    const clinic = ClinicContext.parse((await http().get("/api/clinic").set("Cookie", cookie)).body);
    expect(clinic.account).toMatchObject({ brandColor: "#1d4ed8", headingFont: "nunito" });
    expect(clinic.logoUrl).toContain("/clinic/logo?v=");
  });

  it("is refused by every clinic route, by cookie and by bearer header", async () => {
    const token = op.slice("pd_operator=".length);
    for (const rule of CLINIC_RULES) {
      const path = `/api${rule.path.replace(/:\w+/g, "patient_sibling")}`;
      const method = rule.method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
      // The operator's token in its own cookie, in the clinic cookie, and as a bearer header: none is a clinic session.
      const res = await http()[method](path).set("Cookie", `${op}; pd_session=${token}`).set("Authorization", `Bearer ${token}`);
      expect(res.status, `${rule.method} ${rule.path}`).toBe(401);
    }
    expect((await http().get("/api/auth/me").set("Cookie", `${op}; pd_session=${token}`)).status).toBe(401);
    // And a clinic token as a header to an operator route.
    const clinic = (await signIn(app, "owner@gmail.com", DEMO_CLINIC_ID)).cookie.slice("pd_session=".length);
    expect((await http().get("/api/operator/accounts").set("Authorization", `Bearer ${clinic}`)).status).toBe(401);
  });

  it("treats inner spaces as one clinic name", async () => {
    const create = (name: string, contactEmail: string, ownerEmail: string) => http().post("/api/operator/accounts").set("Cookie", op).field("data", JSON.stringify({
      account: { name, contactEmail, tin: "567-890-123", tier: "mid" },
      branch: { name: "Imus", address: "1 Imus", phone: "(046) 000 0000", openingHours: DEFAULT_OPENING_HOURS },
      owner: { fullName: "Dr. Twin", email: ownerEmail, role: "dentist" },
      branding: { choice: "default" },
      payment: { method: "bank_transfer", paidOn: "2026-10-18", reference: "BT-1" },
      signedOnFile: true,
      signedOn: "2026-10-17",
    }));
    const twin = await create("Bulilit  Smiles   Pediatric Dental", "twin@bulilit.demo", "twin@bulilit.demo");
    expect([twin.status, twin.text]).toEqual([409, duplicateNameMessage("Bulilit  Smiles   Pediatric Dental")]);
    // Billing #10: a contact email in use is refused too, and so is a waiting sign-up's name.
    const sameEmail = await create("Brand New Dental", "HELLO@ngiti.demo", "owner@brandnew.demo");
    expect([sameEmail.status, sameEmail.text]).toEqual([409, DUPLICATE_EMAIL_MESSAGE]);
    expect((await create("hagikgik kids  dental", "x@hagikgik2.demo", "owner@hagikgik2.demo")).status).toBe(409);
  });

  it("gives an old Owner whose branches were all archived every open branch, so the app still opens for them", async () => {
    const [first, second] = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM Branch WHERE clinicId = ${DEMO_CLINIC_ID} AND archived = false ORDER BY position`;
    // Dr. Villanueva (the Owner) worked only at the first branch and archived it: allowed, since an Owner works everywhere.
    await prisma.$executeRaw`UPDATE Staff SET branchIds = JSON_ARRAY(${first!.id}) WHERE id = 'staff_villanueva'`;
    await prisma.$executeRaw`UPDATE Branch SET archived = true WHERE id = ${first!.id}`;
    const [heir] = OwnerCandidate.array().parse((await http().get(`/api/operator/accounts/${DEMO_CLINIC_ID}/staff`).set("Cookie", op)).body);
    expect((await http().post(`/api/operator/accounts/${DEMO_CLINIC_ID}/owner`).set("Cookie", op).send({ staffId: heir!.staffId })).status).toBe(200);
    const old = await inClinic(DEMO_CLINIC_ID, () => prisma.staff.findFirstOrThrow({ where: { id: "staff_villanueva" }, select: { branchIds: true } }));
    expect(old.branchIds).toEqual([second!.id]);
    const owner = await signIn(app, "owner@gmail.com", DEMO_CLINIC_ID);
    expect((await http().get("/api/clinic").set("Cookie", owner.cookie)).status).toBe(200);
  });
});
