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
/** Rules the API has no controller for yet (Nest's 404 comes before the guard): a record's copy is B13's (DPA operations). */
const NOT_SERVED = new Set(["POST /patients/:id/exports"]);
const PARENT_ROUTES = CLINIC_RULES.filter(
  (r) => r.owner && r.owner !== "filtered" && !NOT_SERVED.has(`${r.method} ${r.path}`) && [r.permission].flat().some((p) => rolesCan(["parent"], p) && !rolesCan(["parent"], p, "all")),
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
});
