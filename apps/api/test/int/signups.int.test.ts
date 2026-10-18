import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { INestApplication } from "@nestjs/common";
import { SEED_PRICES, seedPlatform } from "@pedia/seed";
import {
  CreateAccountResult, DEFAULT_OPENING_HOURS, DUPLICATE_EMAIL_MESSAGE, Session, Signup, SignupStatusView, amountDue, duplicateNameMessage,
  type GetStartedInput,
} from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { PAID_PLAN_LOCKED } from "../../src/signups/signups.service";
import { inClinic, resetDatabase } from "./support/database";
import { binary } from "./support/files";
import { createIntApp } from "./support/int-app";
import { asOperator } from "./support/operator";

/** apps/web's mocks/signups.test.ts and operator-signups.test.ts against the API (B12 Step 6.4), with races. */
const STORAGE_DIR = mkdtempSync(join(tmpdir(), "b12-signups-"));
let app: INestApplication;
let prisma: PrismaService;
let op = "";

beforeAll(async () => {
  app = await createIntApp({ env: { STORAGE_DIR } });
  prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, seedPlatform());
  op = await asOperator(app);
}, 60_000);
afterAll(() => app.close());
beforeEach(async () => {
  await prisma.rateLimitCounter.deleteMany(); // decision 14 counts per address, and every request here is 127.0.0.1
});

const http = () => request(app.getHttpServer());
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect width="4" height="4"/></svg>');
const GIF = Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;", "latin1");
let n = 0;
/** A fresh, valid sign-up; each call gets its own name and emails. */
const form = (branding: GetStartedInput["branding"], tier: GetStartedInput["account"]["tier"] = "small", name = `Ngipin ${++n} Dental`): GetStartedInput => ({
  account: { name, contactEmail: `hello${n}@ngipin.demo`, tin: "567-890-123", tier },
  branch: { name: "Tagaytay", address: "1 Aguinaldo Hi-way, Tagaytay", phone: "(046) 483 0000", openingHours: DEFAULT_OPENING_HOURS },
  owner: { fullName: `Dr. Cruz ${n}`, email: `owner${n}@ngipin.demo`, role: "admin" },
  branding,
  acceptTerms: true,
});
type Files = { logo?: [Buffer, string]; references?: Buffer[] };
function multipart(req: request.Test, data: unknown, files: Files = {}) {
  let r = req.field("data", JSON.stringify(data));
  if (files.logo) r = r.attach("logo", files.logo[0], { filename: "logo", contentType: files.logo[1] });
  for (const f of files.references ?? []) r = r.attach("reference", f, { filename: "ref.png", contentType: "image/png" });
  return r;
}
const submit = (input: GetStartedInput, files?: Files) => multipart(http().post("/api/signups"), input, files);
const signupOf = async (reference: string) => Signup.parse((await http().get("/api/operator/signups").set("Cookie", op)).body.find((s: Signup) => s.reference === reference));
const pay = (id: string) => http().post(`/api/operator/signups/${id}/payment`).set("Cookie", op).send({ method: "gcash", paidOn: "2026-10-18", reference: "GC-1" });

describe("the public Get started form on MySQL (billing #4–#11)", () => {
  it("takes each branding choice and quotes setup + first month (+ design) from the operator's prices", async () => {
    const own = await submit(form({ choice: "own", brandColor: "#0d6e8c", headingFont: "poppins" }), { logo: [SVG, "image/svg+xml"] });
    const plain = await submit(form({ choice: "default" }, "mid"));
    const designed = await submit(form({ choice: "designed", brief: "Sunny, calm" }, "big"), { references: [PNG, PNG] });
    expect([own.status, plain.status, designed.status]).toEqual([201, 201, 201]);
    expect(SignupStatusView.parse(designed.body).quote).toEqual(amountDue(SEED_PRICES, "big", "designed"));
    expect(designed.body).toMatchObject({ status: "waiting", paid: false, receipt: null, paymentQr: null });
    expect((await signupOf(designed.body.reference)).referenceRefs).toHaveLength(2);
    expect((await signupOf(own.body.reference)).logoRef).toMatch(/^platform\/signups\/.+\.svg$/);
  });

  it("needs a logo and a passing colour for Use my own; refuses a GIF logo and four reference images", async () => {
    const noLogo = await submit(form({ choice: "own", brandColor: "#0d6e8c", headingFont: null }));
    expect([noLogo.status, noLogo.text]).toEqual([400, "Add your logo, or choose Use the default look"]);
    const pale = await submit(form({ choice: "own", brandColor: "#ffff00", headingFont: null }), { logo: [SVG, "image/svg+xml"] });
    expect(pale.status).toBe(400);
    expect(pale.text).toMatch(/Try #[0-9a-f]{6}\.$/);
    expect((await submit(form({ choice: "own", brandColor: "#0d6e8c", headingFont: null }), { logo: [GIF, "image/gif"] })).status).toBe(400);
    const four = await submit(form({ choice: "designed", brief: "x" }), { references: [PNG, PNG, PNG, PNG] });
    expect([four.status, four.text]).toEqual([400, "Choose up to 3 reference images"]);
  });

  it("refuses a name or contact email already on Primolar or waiting, ignoring case and spaces (billing #10)", async () => {
    const taken = form({ choice: "default" }, "small", "  bulilit   SMILES Pediatric Dental ");
    expect([(await submit(taken)).status, (await submit(taken)).text]).toEqual([409, duplicateNameMessage(taken.account.name)]);
    expect((await submit(form({ choice: "default" }, "small", "Hagikgik Kids Dental"))).status).toBe(409); // the seeded waiting sign-up
    const email = { ...form({ choice: "default" }), account: { ...form({ choice: "default" }).account, contactEmail: "HELLO@BULILIT.DEMO" } };
    const clinicEmail = (await prisma.clinicAccount.findUniqueOrThrow({ where: { id: "clinic_demo" } })).contactEmail;
    email.account.contactEmail = clinicEmail.toUpperCase();
    expect([(await submit(email)).status, (await submit(email)).text]).toEqual([409, DUPLICATE_EMAIL_MESSAGE]);
  });

  it("shows a sign-up by its reference in any case, and nothing private (A1); a console sign-up has no page", async () => {
    const made = await submit(form({ choice: "default" }));
    const view = await http().get(`/api/signups/  ${made.body.reference.toLowerCase()} `);
    expect(SignupStatusView.parse(view.body).reference).toBe(made.body.reference);
    expect(JSON.stringify(view.body)).not.toContain("@ngipin.demo");
    const missing = await http().get("/api/signups/PRM-ZZZZ-ZZZZ");
    expect([missing.status, missing.text]).toEqual([404, "We can't find a sign-up with that reference. Check it and try again."]);
  });

  it("makes exactly one sign-up of five sent at once with one name (the platform lock)", async () => {
    const one = form({ choice: "default" });
    const results = await Promise.all([0, 1, 2, 3, 4].map(() => submit(one)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
    expect(await prisma.signup.count({ where: { name: one.account.name } })).toBe(1);
  });

  it("refuses a sixth sign-up from one address within the hour, storing nothing (decision 14)", async () => {
    for (let i = 0; i < 5; i++) expect((await submit(form({ choice: "default" }))).status).toBe(201);
    const before = await prisma.signup.count();
    const sixth = await submit(form({ choice: "default" }));
    expect([sixth.status, sixth.text]).toEqual([429, "Too many sign-ups from this connection. Try again in an hour."]);
    expect(await prisma.signup.count()).toBe(before);
  });
});

describe("sign-ups in the console on MySQL (billing #12–#15)", () => {
  it("won't approve before the setup fee, records it once as the quoted total, then approves into a working clinic", async () => {
    const made = await submit(form({ choice: "own", brandColor: "#0d6e8c", headingFont: "poppins" }), { logo: [PNG, "image/png"] });
    const s = await signupOf(made.body.reference);
    const early = await http().post(`/api/operator/signups/${s.id}/approve`).set("Cookie", op);
    expect([early.status, early.text]).toEqual([409, "Record the setup fee before approving"]);
    expect(Signup.parse((await pay(s.id)).body).payment?.amount).toBe(s.quote.total);
    expect([(await pay(s.id)).status, (await pay(s.id)).text]).toEqual([409, "The setup fee is already recorded"]);
    const counter = (await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "primolar" } })).next;

    const approved = await http().post(`/api/operator/signups/${s.id}/approve`).set("Cookie", op);
    expect(approved.status).toBe(201);
    const result = CreateAccountResult.parse(approved.body);
    const clinicId = result.overview.account.id;
    expect(result.overview).toMatchObject({ account: { name: s.account.name, status: "active", tier: "small" }, usage: { branches: 1, staffLogins: 1, patients: 0 } });

    // One branch, one chair, the procedures and templates, the notice; the subscription with the quote as invoice 1.
    const counts = await inClinic(clinicId, async () => [
      await prisma.branch.count(), await prisma.chair.count(), await prisma.procedure.count() > 0, await prisma.noteTemplate.count() > 0,
      await prisma.messageTemplate.count() > 0, await prisma.privacyNotice.count(), await prisma.auditEvent.count({ where: { record: "Terms and DPA (accepted)" } }),
    ]);
    expect(counts).toEqual([1, 1, true, true, true, 1, 1]);
    const sub = await prisma.subscription.findUniqueOrThrow({ where: { clinicId } });
    expect(sub.paidMonths).toBe(1);
    const first = await prisma.subscriptionPayment.findFirstOrThrow({ where: { clinicId } });
    expect([first.invoiceNo, first.amount]).toEqual([`PRM-INV-${String(counter).padStart(5, "0")}`, s.quote.total]);
    expect(await prisma.subscriptionLine.count({ where: { paymentId: first.id } })).toBe(2); // setup fee, first month

    // Use my own: the account has the colour, the font and a copy of the logo, counted in the clinic's storage.
    const account = await prisma.clinicAccount.findUniqueOrThrow({ where: { id: clinicId } });
    expect([account.brandColor, account.headingFont, account.logoRef?.startsWith(`clinics/${clinicId}/branding/`)]).toEqual(["#0d6e8c", "poppins", true]);
    expect(await inClinic(clinicId, () => prisma.storedFile.count())).toBe(1);

    // The Owner signs in with the temporary password, and must choose their own first (decision #21).
    const login = await http().post("/api/auth/login").send({ email: s.owner.email, password: result.temporaryPassword });
    expect(Session.parse(login.body).user).toMatchObject({ clinicId, mustChangePassword: true, roles: ["owner", "admin"] });
    const sessionOf = (res: request.Response, fallback = "") => ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))?.split(";")[0] ?? fallback;
    let cookie = sessionOf(login);
    const changed = await http().post("/api/auth/password").set("Cookie", cookie).send({ current: result.temporaryPassword, next: "Bago-Password-2026" });
    expect(changed.status).toBe(200);
    cookie = sessionOf(changed, cookie); // a password change opens a fresh session
    expect((await http().post("/api/auth/acknowledgement").set("Cookie", cookie).send({ kind: "confidentiality", version: 1 })).status).toBe(200);
    const logo = await http().get("/api/clinic/logo").set("Cookie", cookie).buffer(true).parse(binary);
    expect([logo.status, (logo.body as Buffer).equals(PNG)]).toEqual([200, true]);
  });

  it("approves the default look with Primolar's colour and no logo, and Design it for me as in progress", async () => {
    const plain = await signupOf((await submit(form({ choice: "default" }))).body.reference);
    await pay(plain.id);
    const a = CreateAccountResult.parse((await http().post(`/api/operator/signups/${plain.id}/approve`).set("Cookie", op)).body);
    expect(await prisma.clinicAccount.findUniqueOrThrow({ where: { id: a.overview.account.id } })).toMatchObject({ brandColor: "#5b3fa8", logoRef: null });
    const designed = await signupOf((await submit(form({ choice: "designed", brief: "Pastel" }), { references: [PNG] })).body.reference);
    await pay(designed.id);
    const d = CreateAccountResult.parse((await http().post(`/api/operator/signups/${designed.id}/approve`).set("Cookie", op)).body);
    expect(d.overview.design).toBe("in_progress");
  });

  it("approves once of two at once, leaving no orphan rows", async () => {
    const s = await signupOf((await submit(form({ choice: "default" }))).body.reference);
    await pay(s.id);
    const before = await prisma.clinicAccount.count();
    const results = await Promise.all([0, 1].map(() => http().post(`/api/operator/signups/${s.id}/approve`).set("Cookie", op)));
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(results.find((r) => r.status === 409)!.text).toBe("This sign-up has already been decided");
    expect(await prisma.clinicAccount.count()).toBe(before + 1);
    expect(await prisma.subscription.count({ where: { clinicId: results.find((r) => r.status === 201)!.body.overview.account.id } })).toBe(1);
  });

  it("never makes two clinics of one name when an approval races a new sign-up with that name", async () => {
    const s = await signupOf((await submit(form({ choice: "default" }))).body.reference);
    await pay(s.id);
    const [approved, twin] = await Promise.all([
      http().post(`/api/operator/signups/${s.id}/approve`).set("Cookie", op),
      submit({ ...form({ choice: "default" }), account: { ...form({ choice: "default" }).account, name: s.account.name } }),
    ]);
    expect(approved.status).toBe(201);
    expect(twin.status).toBe(409);
    expect(await prisma.clinicAccount.count({ where: { name: s.account.name } })).toBe(1);
  });

  it("rolls the whole clinic back when a write inside fails: no account, no subscription, the sign-up waiting, the counter unchanged", async () => {
    const s = await signupOf((await submit(form({ choice: "default" }))).body.reference);
    await pay(s.id);
    const counter = (await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "primolar" } })).next;
    const accounts = await prisma.clinicAccount.count();
    // The last write of the transaction fails: the next invoice number is already taken (a row put there on purpose).
    await prisma.$executeRawUnsafe(`INSERT INTO SubscriptionPayment (id, clinicId, invoiceNo, tier, periodStart, periodEnd, method, paidOn, amount, recordedAt) VALUES ('clash', 'other', 'PRM-INV-${String(counter).padStart(5, "0")}', 'small', '2026-01-01', '2026-02-01', 'gcash', '2026-01-01', 1, NOW())`);
    const res = await http().post(`/api/operator/signups/${s.id}/approve`).set("Cookie", op);
    expect(res.status).toBe(409); // the invoice number is taken: the insert fails inside the transaction
    expect(await prisma.clinicAccount.count()).toBe(accounts);
    expect((await prisma.signup.findUniqueOrThrow({ where: { id: s.id } })).status).toBe("waiting");
    expect((await prisma.invoiceCounter.findUniqueOrThrow({ where: { id: "primolar" } })).next).toBe(counter);
    await prisma.$executeRawUnsafe("DELETE FROM SubscriptionPayment WHERE id = 'clash'");
  });

  it("fixes a waiting sign-up, re-quoting a plan change, and locks the plan once paid (billing #13, #24)", async () => {
    const made = await submit(form({ choice: "default" }));
    const s = await signupOf(made.body.reference);
    const fix = (input: unknown) => multipart(http().put(`/api/operator/signups/${s.id}`).set("Cookie", op), input);
    const { acceptTerms: _, ...input } = form({ choice: "default" }, "mid", s.account.name);
    const fixed = Signup.parse((await fix({ ...input, account: { ...input.account, contactEmail: s.account.contactEmail } })).body);
    expect(fixed.quote).toEqual(amountDue(SEED_PRICES, "mid", "default"));
    await pay(s.id);
    const locked = await fix({ ...input, account: { ...input.account, tier: "big", contactEmail: s.account.contactEmail } });
    expect([locked.status, locked.text]).toEqual([409, PAID_PLAN_LOCKED]);
  });

  it("rejects with a reason the client sees, and its waiting receipt is rejected with it", async () => {
    const made = await submit(form({ choice: "default" }));
    const s = await signupOf(made.body.reference);
    await prisma.platformSettings.update({ where: { id: "primolar" }, data: { paymentQrKey: "platform/payment-qr/x.png", paymentQrUpdatedAt: new Date() } });
    const receipt = await http().post(`/api/signups/${s.reference}/receipts`).field("data", JSON.stringify({ reference: "BPI-1" })).attach("file", PNG, { filename: "r.png", contentType: "image/png" });
    expect(receipt.status).toBe(201);
    const rejected = await http().post(`/api/operator/signups/${s.id}/reject`).set("Cookie", op).send({ reason: "Duplicate of another clinic" });
    expect(Signup.parse(rejected.body).rejection?.reason).toBe("Duplicate of another clinic");
    const view = SignupStatusView.parse((await http().get(`/api/signups/${s.reference}`)).body);
    expect([view.status, view.rejectionReason, view.receipt?.status, view.receipt?.rejectionReason]).toEqual(["rejected", "Duplicate of another clinic", "rejected", "The sign-up was rejected"]);
    await prisma.platformSettings.update({ where: { id: "primolar" }, data: { paymentQrKey: null, paymentQrUpdatedAt: null } });
  });

  it("serves a sign-up's files to the operator only, and only its own", async () => {
    const made = await submit(form({ choice: "designed", brief: "x" }), { references: [PNG] });
    const s = await signupOf(made.body.reference);
    const key = encodeURIComponent(s.referenceRefs[0]!);
    expect((await http().get(`/api/operator/signups/${s.id}/files/${key}`).set("Cookie", op)).status).toBe(302);
    expect((await http().get(`/api/operator/signups/${s.id}/files/${key}`)).status).toBe(401);
    const other = encodeURIComponent("platform/signups/someone-else.png");
    const res = await http().get(`/api/operator/signups/${s.id}/files/${other}`).set("Cookie", op);
    expect([res.status, res.text]).toEqual([404, "That file isn't part of this sign-up"]);
  });
});
