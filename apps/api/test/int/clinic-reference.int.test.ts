import type { INestApplication } from "@nestjs/common";
import { seedPlatform } from "@pedia/seed";
import { Chair, MessageTemplate, NoteTemplate, Procedure } from "@pedia/shared";
import request from "supertest";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Hasher } from "../../src/auth/hashing";
import { SessionService } from "../../src/auth/session.service";
import { PrismaService } from "../../src/prisma/prisma.service";
import { seedDatabase } from "../../src/seed/seed-database";
import { resetDatabase } from "./support/database";
import { createIntApp } from "./support/int-app";

const platform = seedPlatform();
let app: INestApplication;
let sessions: SessionService;

beforeAll(async () => {
  app = await createIntApp();
  sessions = app.get(SessionService);
  const prisma = app.get(PrismaService);
  await resetDatabase(prisma);
  await seedDatabase(prisma, new Hasher(), { DEMO_LOGINS: true }, platform);
}, 60_000);
afterAll(() => app.close());

const as = async (clinicId: string, accountId: string) => `pd_session=${await sessions.openClinic(clinicId, accountId)}`;
const call = (method: "get" | "put", path: string, cookie: string, body?: unknown) =>
  request(app.getHttpServer())[method](`/api${path}`).set("Cookie", cookie).send(body as object);
const ok = async <T extends z.ZodType>(res: Promise<request.Response>, schema: T): Promise<z.infer<T>> => {
  const r = await res;
  expect(r.status, r.text).toBe(200);
  return schema.parse(r.body);
};
const parent = () => `guardian.${platform.tenants.clinic_demo!.patients[0]!.guardians[0]!.id}`;

describe("clinic reference data (handlers.test.ts, tenancy.test.ts)", () => {
  it("serves each clinic's procedure catalog exactly as the mock seeds it", async () => {
    for (const [clinicId, owner] of [["clinic_demo", "staff_villanueva"], ["clinic_ngiti", "ngiti_staff_lim"]] as const) {
      const procedures = await ok(call("get", "/procedures", await as(clinicId, owner)), z.array(Procedure));
      expect(procedures).toEqual(platform.tenants[clinicId]!.procedures.map((p) => ({ ...p, clinicId })));
    }
  });

  it("lists only the signed-in account's chairs, every branch's (tenancy.test.ts, B3's part)", async () => {
    const chairs = await ok(call("get", "/chairs", await as("clinic_ngiti", "ngiti_staff_tan")), z.array(Chair));
    expect(chairs).toEqual(platform.tenants.clinic_ngiti!.chairs);
    const demo = await ok(call("get", "/chairs", await as("clinic_demo", "staff_cruz")), z.array(Chair));
    expect(new Set(demo.map((c) => c.branchId))).toEqual(new Set(["branch_imus", "branch_dasma"])); // not the device's branch only
  });

  it("has exactly one note template per catalog procedure, so every plan item can be completed", async () => {
    const cookie = await as("clinic_demo", "staff_reyes");
    const templates = await ok(call("get", "/note-templates", cookie), z.array(NoteTemplate));
    const codes = (await ok(call("get", "/procedures", cookie), z.array(Procedure))).map((p) => p.code);
    expect(templates.map((t) => t.procedure).sort()).toEqual([...codes].sort());
    expect(templates).toEqual(platform.tenants.clinic_demo!.noteTemplates);
  });

  it("lets a parent read the catalog but not the message templates", async () => {
    const cookie = await as("clinic_demo", parent());
    expect((await call("get", "/procedures", cookie)).status).toBe(200);
    expect((await call("get", "/message-templates", cookie)).status).toBe(403);
  });
});

describe("message templates (handlers.test.ts, messages)", () => {
  const path = "/message-templates/appointment_confirmation";

  it("serves one template per kind in the mock's order", async () => {
    const rows = await ok(call("get", "/message-templates", await as("clinic_demo", "staff_cruz")), z.array(MessageTemplate));
    const seeded = platform.tenants.clinic_demo!.messageTemplates;
    expect(rows.map(({ updatedAt: _, ...t }) => t)).toEqual(seeded.map(({ updatedAt: _, ...t }) => t));
  });

  it("refuses an unknown placeholder with the issues array, and saves a good body", async () => {
    const cookie = await as("clinic_demo", "staff_cruz");
    const bad = await call("put", path, cookie, { body: "See you, {child_nmae}!" });
    expect([bad.status, Array.isArray(bad.body)]).toEqual([400, true]);
    const saved = await ok(call("put", path, cookie, { body: "See you {date}, {child_first_name}!" }), MessageTemplate);
    expect(saved.body).toBe("See you {date}, {child_first_name}!");
    expect(Date.parse(saved.updatedAt)).toBeGreaterThan(Date.parse(platform.tenants.clinic_demo!.messageTemplates[0]!.updatedAt));
    // Ngiti's own copy is untouched.
    const ngiti = await ok(call("get", "/message-templates", await as("clinic_ngiti", "ngiti_staff_tan")), z.array(MessageTemplate));
    expect(ngiti.find((t) => t.kind === "appointment_confirmation")!.body).not.toContain("See you");
  });

  it("answers 404 for a kind that isn't one, before reading the body", async () => {
    const res = await call("put", "/message-templates/postcard", await as("clinic_demo", "staff_cruz"), {});
    expect([res.status, res.text]).toEqual([404, "Template not found"]);
  });
});
