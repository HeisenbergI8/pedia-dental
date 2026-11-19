import type { INestApplication } from "@nestjs/common";
import { DEMO_PASSWORD, accountsByLogin, childrenOf, seedPlatform } from "@pedia/seed";
import { rolesCan } from "@pedia/shared";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLINIC_RULES } from "../../src/auth/access-rules";
import { Hasher } from "../../src/auth/hashing";
import { RecordOwners } from "../../src/auth/record-owners";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { inClinic, resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

// CHUNKS B11 done-when, swept from the route map (E12): a seeded parent gets 403 for another family's child on every
// route a parent can pass, and never 403 for their own.
const platform = seedPlatform();
const db = platform.tenants.clinic_demo!;
const parent = accountsByLogin(platform, "parent@gmail.com")[0]!.account;
const ours = new Set(childrenOf(db, parent.guardianId!).map((p) => p.id));
const mine = [...ours][0]!;
const other = db.patients.find((p) => !ours.has(p.id))!.id;
/** A record of each record-owned route, ours and another family's. A new route without fixtures here fails the test. */
const RECORDS: Record<string, { ours?: string; theirs?: string }> = {
  "/appointments/:id/status": { ours: db.appointments.find((a) => ours.has(a.patientId))?.id, theirs: db.appointments.find((a) => !ours.has(a.patientId))?.id },
  "/photos/:id/file": { ours: db.photos.find((p) => ours.has(p.patientId) && p.uploadedBy === "parent")?.id, theirs: "photo_other_family" }, // written below
};
const PARENT_ROUTES = CLINIC_RULES.filter(
  (r) => r.owner && r.owner !== "filtered" && [r.permission].flat().some((p) => rolesCan(["parent"], p) && !rolesCan(["parent"], p, "all")),
);
/** Hoisted so the `.each(...)` argument holds no parentheses: the port ledger's title reader stops at the first `)`. */
const PARENT_CASES = PARENT_ROUTES.map((r) => [`${r.method} ${r.path}`, r] as const);

let app: INestApplication;
let cookie = "";
beforeAll(async () => {
  app = await createIntApp({ env: { DEMO_LOGINS: "true" } });
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
  // The seed's photos are all one family's: another family's upload, as a row (the file itself is never reached).
  await inClinic("clinic_demo", () =>
    prisma.clinicalPhoto.create({
      data: { id: "photo_other_family", clinicId: "clinic_demo", patientId: other, type: "document", takenOn: new Date("2026-01-05"), caption: "Clearance", contentType: "application/pdf", uploadedBy: "parent", fileKey: "clinics/clinic_demo/photos/none.pdf", bytes: 1, createdAt: new Date() },
      select: { id: true },
    }),
  );
  // #38: a clinic photo of their own child (staff-uploaded), and a voided bill for that child, as rows.
  await inClinic("clinic_demo", async () => {
    await prisma.clinicalPhoto.create({
      data: { id: "photo_staff_own_child", clinicId: "clinic_demo", patientId: mine, type: "xray", takenOn: new Date("2026-01-06"), caption: "Bitewing", contentType: "image/jpeg", uploadedBy: "staff", fileKey: "clinics/clinic_demo/photos/none.jpg", bytes: 1, createdAt: new Date() },
      select: { id: true },
    });
    await prisma.invoice.create({
      data: { id: "invoice_voided_own_child", clinicId: "clinic_demo", branchId: "branch_imus", patientId: mine, discount: 0, issuedAt: new Date("2026-01-06T02:00:00Z"), voidedAt: new Date("2026-01-06T03:00:00Z"), voidedBy: "staff_delacruz", voidReason: "Wrong child" },
      select: { id: true },
    });
    await prisma.invoiceLine.create({
      data: { clinicId: "clinic_demo", invoiceId: "invoice_voided_own_child", position: 0, procedureCode: "fluoride", description: "Fluoride varnish", amount: 80_000 },
      select: { id: true },
    });
  });
  const res = await request(app.getHttpServer()).post("/api/auth/login").send({ email: "parent@gmail.com", password: DEMO_PASSWORD });
  cookie = ([] as string[]).concat(res.headers["set-cookie"] ?? []).find((c) => c.startsWith("pd_session="))!.split(";")[0]!;
}, 60_000);
afterAll(() => app.close());

/** The route's path for this child (or record), and its query. */
function pathFor(rule: (typeof PARENT_ROUTES)[number], which: "ours" | "theirs"): string {
  const child = which === "ours" ? mine : other;
  if (rule.owner === "query") return `${rule.path}?patientId=${child}`;
  if (rule.owner === "id") return rule.path.replace(":id", child);
  const id = RECORDS[rule.path]?.[which];
  expect(id, `${rule.method} ${rule.path}: add a ${which} fixture`).toBeDefined();
  return rule.path.replace(":id", id!);
}
const call = (method: string, path: string) =>
  method === "GET" ? request(app.getHttpServer()).get(`/api${path}`).set("Cookie", cookie) : request(app.getHttpServer())[method.toLowerCase() as "post"](`/api${path}`).set("Cookie", cookie).send({});

describe("a parent's ownership on every route they can pass (B11 E12)", () => {
  it("has a registered lookup for every record route a parent can pass", () => {
    const owners = app.get(RecordOwners);
    expect(PARENT_ROUTES.filter((r) => r.owner === "record").filter((r) => !owners.has(r.path)).map((r) => r.path)).toEqual([]);
  });

  it("registers an owner for every record route, so the guard can find a restricted child (B13c2b)", () => {
    const owners = app.get(RecordOwners);
    expect(CLINIC_RULES.filter((r) => r.owner === "record" && !owners.has(r.path)).map((r) => r.path)).toEqual([]);
  });

  it.each(PARENT_CASES)("%s: 403 for another family's child, never for their own", async (_, rule) => {
    const theirs = await call(rule.method, pathFor(rule, "theirs"));
    expect([theirs.status, theirs.text]).toEqual([403, "This isn't one of your children's records"]);
    // Their own: past the guard (a 400 for the empty body, a 404 for a child with no profile photo), never refused or broken.
    const own = (await call(rule.method, pathFor(rule, "ours"))).status;
    expect([own, rule.path]).toEqual([expect.toSatisfy((s: number) => s < 500 && s !== 403), rule.path]);
  });

  it("refuses the message log without a child named", async () => {
    expect((await call("GET", "/messages")).status).toBe(403);
  });

  it("shows a parent only their own children, and 403 for another child's (Chunk 17 done-when)", async () => {
    const listed = ((await call("GET", "/patients")).body as { id: string }[]).map((p) => p.id);
    expect(listed.sort()).toEqual([...ours].sort());
    expect(listed).toContain("patient_sibling");
    expect(listed).toHaveLength(2);
    for (const path of ["", "/plan", "/appointments", "/invoices", "/payments", "/photos", "/appointment-requests"]) {
      expect([path, (await call("GET", `/patients/${mine}${path}`)).status]).toEqual([path, 200]);
      expect([path, (await call("GET", `/patients/${other}${path}`)).status]).toEqual([path, 403]);
    }
    expect((await call("GET", `/messages?patientId=${mine}`)).status).toBe(200);
    for (const path of [`/messages?patientId=${other}`, "/messages", "/appointments", `/patients/${mine}/chart`, `/patients/${mine}/notes`, "/reports/finance"]) {
      expect([path, (await call("GET", path)).status]).toEqual([path, 403]);
    }
  });

  // #38: the four reads the sweep above can't see, because they filter rather than refuse.
  it("lists only a parent's own children in the patient summaries", async () => {
    const page = await call("GET", "/patient-summaries?pageSize=100");
    expect(page.status).toBe(200);
    expect((page.body.rows as { id: string }[]).map((r) => r.id).sort()).toEqual([...ours].sort());
  });

  it("hides the clinic's photos of their own child from a parent, and opens none of their files", async () => {
    const photos = await call("GET", `/patients/${mine}/photos`);
    expect(photos.status).toBe(200);
    const listed = photos.body as { id: string; uploadedBy?: string }[];
    expect(listed.map((p) => p.id)).not.toContain("photo_staff_own_child");
    expect(listed.every((p) => p.uploadedBy === "parent")).toBe(true);
    expect((await call("GET", "/photos/photo_staff_own_child/file")).status).toBe(404);
  });

  it("shows a parent only the live bills of their own child, never a voided one", async () => {
    const bills = await call("GET", `/patients/${mine}/invoices`);
    expect(bills.status).toBe(200);
    const listed = bills.body as { id: string; voided?: unknown }[];
    expect(listed.map((i) => i.id)).not.toContain("invoice_voided_own_child");
    expect(listed.every((i) => !i.voided)).toBe(true);
  });
});
