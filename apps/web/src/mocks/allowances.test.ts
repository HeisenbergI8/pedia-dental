import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { AccountOverview, ClinicUsage, FAILURE, GB, PortalAccess, storageFullMessage } from "@pedia/shared";
import { manilaMonthOf, textPartsUsed } from "./allowances";
import { ApiError, api } from "@/lib/api-client";
import { accountById, platform, selectTenant } from "./db";
import { usageOf } from "./allowances";
import { handlers } from "./handlers";
import { queueMessage } from "./outbox";

// B12 decisions 1–3, 16–19: the plans' storage and text allowances in the demo.
const server = setupServer(...handlers);
const NGITI_OWNER = "demo.clinic_ngiti.ngiti_staff_lim";
const BULILIT_ADMIN = "demo.clinic_demo.staff_delacruz";
const cookies = (...c: string[]) => vi.stubGlobal("document", { cookie: c.join("; ") });
const asStaff = (token: string) => cookies(`pd_session=${token}`);
const message = (p: Promise<unknown>) => p.then(() => "", (e: ApiError) => e.message);
const photo = () => {
  const body = new FormData();
  body.append("file", new File([new Uint8Array(100)], "kid.jpg", { type: "image/jpeg" }));
  return { method: "PUT", body };
};
const ngiti = () => platform.tenants.clinic_ngiti!;

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("storage (decisions 1, 16)", () => {
  it("refuses an upload that would pass the plan, storing and counting nothing", async () => {
    ngiti().storedFiles.push({ key: "filler", area: "photos", bytes: 25 * GB - 10 - ngiti().storedFiles.reduce((n, f) => n + f.bytes, 0) });
    const before = ngiti().storedFiles.length;
    asStaff(NGITI_OWNER);
    const kid = ngiti().patients[0]!.id;
    expect(await message(api(`/patients/${kid}/photo`, z.unknown(), photo()))).toBe(storageFullMessage("small"));
    expect(ngiti().storedFiles).toHaveLength(before);
  });

  it("stores the same photo on a bigger plan, counting it once however often it is replaced", async () => {
    asStaff(BULILIT_ADMIN);
    const tenant = platform.tenants.clinic_demo!;
    const kid = tenant.patients[0]!.id;
    const before = tenant.storedFiles.reduce((n, f) => n + f.bytes, 0);
    await api(`/patients/${kid}/photo`, z.unknown(), photo());
    await api(`/patients/${kid}/photo`, z.unknown(), photo());
    expect(tenant.storedFiles.reduce((n, f) => n + f.bytes, 0)).toBe(before + 100);
  });
});

describe("texts (decisions 2, 3, 18, 19)", () => {
  it("logs a template text past the month's parts as not sent", async () => {
    selectTenant("clinic_ngiti");
    const kid = ngiti().patients.find((p) => !p.privacyChoices?.some((c) => !c.reminders))!;
    const now = new Date().toISOString();
    ngiti().messages.push({ ...ngiti().messages[0]!, id: "filler_text", patientId: kid.id, status: "sent", sendAt: now, body: "x".repeat(153 * 500) });
    expect(queueMessage({ kind: "birthday", patientId: kid.id, sendAt: now })).toMatchObject({ status: "failed", failureReason: FAILURE.textLimit });
    asStaff(NGITI_OWNER);
    const usage = await api("/clinic/usage", ClinicUsage);
    expect(usage.texts.inUse).toBeGreaterThanOrEqual(500);
    expect(usage.storage).toEqual({ inUse: 25 * GB - 10, limit: 25 * GB });
  });

  it("sends a template text again once a confirmed top-up raises the month's limit (feature 16, revised)", async () => {
    selectTenant("clinic_ngiti");
    const kid = ngiti().patients.find((p) => !p.privacyChoices?.some((c) => !c.reminders))!;
    const now = new Date().toISOString();
    expect(queueMessage({ kind: "birthday", patientId: kid.id, sendAt: now })).toMatchObject({ status: "failed" }); // still at the limit
    platform.textTopUps.push({
      id: "topup_test", clinicId: "clinic_ngiti", invoiceNo: "PRM-INV-09999", month: manilaMonthOf(now),
      packs: 1, parts: 100, receiptId: null, amount: 15_000, method: "gcash", paidOn: now.slice(0, 10), recordedAt: now,
    });
    try {
      expect(queueMessage({ kind: "birthday", patientId: kid.id, sendAt: now })).toMatchObject({ status: "queued" });
    } finally {
      platform.textTopUps = platform.textTopUps.filter((t) => t.id !== "topup_test");
    }
  });

  it("counts a top-up only in the month it was confirmed for, never the next", () => {
    platform.textTopUps.push({
      id: "topup_month", clinicId: "clinic_demo", invoiceNo: "PRM-INV-09998", month: "2026-10", packs: 1, parts: 100, receiptId: null,
      amount: 15_000, method: "gcash", paidOn: "2026-10-31", recordedAt: "2026-10-31T10:00:00.000Z",
    });
    try {
      const account = accountById("clinic_demo")!;
      const tenant = platform.tenants.clinic_demo!;
      expect([usageOf(tenant, account, "2026-10").textTopUp, usageOf(tenant, account, "2026-11").textTopUp]).toEqual([100, 0]); // D1
    } finally {
      platform.textTopUps = platform.textTopUps.filter((t) => t.id !== "topup_month");
    }
  });

  it("shows the console the same usage as the Owner (decision 17)", async () => {
    asStaff(NGITI_OWNER);
    const owner = await api("/clinic/usage", ClinicUsage);
    cookies("pd_operator=operator.operator_primolar");
    const overview = (await api("/operator/accounts", z.array(AccountOverview))).find((a) => a.account.id === "clinic_ngiti")!;
    expect([overview.usage.storage, overview.usage.texts]).toEqual([owner.storage, owner.texts]);
  });

  it("still sends an invite in November 2026 with the month's texts used, as invites count only from December (text-abuse limits)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-27T10:00:00+08:00")); // before INVITES_COUNT_FROM
    try {
      asStaff(NGITI_OWNER);
      const kid = ngiti().patients.find((p) => p.guardians.some((g) => /^09\d{9}$/.test(g.phone)))!;
      const g = kid.guardians.find((x) => /^09\d{9}$/.test(x.phone))!;
      const account = ngiti().portalAccounts.find((a) => a.guardianId === g.id);
      if (account) account.state = "off"; // seeded parents are active: invite them again
      ngiti().messages.push({ ...ngiti().messages[0]!, id: "month_used", kind: "recall", status: "sent", sendAt: new Date().toISOString(), body: "x".repeat(153 * 2000) });
      try {
        await api(`/patients/${kid.id}/guardians/${g.id}/portal-invite`, PortalAccess, { method: "POST" });
        expect(ngiti().messages.at(-1)).toMatchObject({ kind: "portal_invite", status: "queued" });
      } finally {
        ngiti().messages = ngiti().messages.filter((m) => m.id !== "month_used");
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it("never counts or refuses an invite before December 2026, so onboarding invites stay free (text-abuse limits)", () => {
    const tenant = platform.tenants.clinic_ngiti!;
    const at = "2026-11-20T10:00:00.000Z";
    tenant.messages.push({ ...tenant.messages[0]!, id: "nov_invite", kind: "portal_invite", status: "sent", sendAt: at, body: "x".repeat(153 * 50) });
    tenant.messages.push({ ...tenant.messages[0]!, id: "dec_invite", kind: "portal_invite", status: "sent", sendAt: "2026-12-20T10:00:00.000Z", body: "x".repeat(153 * 50) });
    try {
      const without = (month: string) => textPartsUsed({ ...tenant, messages: tenant.messages.filter((m) => !m.id.endsWith("_invite")) }, month);
      expect(textPartsUsed(tenant, "2026-11")).toBe(without("2026-11"));
      expect(textPartsUsed(tenant, "2026-12")).toBe(without("2026-12") + 50);
    } finally {
      tenant.messages = tenant.messages.filter((m) => !m.id.endsWith("_invite"));
    }
  });

  it("never counts resets toward the month (audit #3)", async () => {
    asStaff(BULILIT_ADMIN);
    const tenant = platform.tenants.clinic_demo!;
    const month = manilaMonthOf(new Date().toISOString());
    const before = textPartsUsed(tenant, month);
    const now = new Date().toISOString();
    tenant.messages.push({ ...tenant.messages[0]!, id: "reset_flood", kind: "password_reset", status: "sent", sendAt: now, body: "x".repeat(153 * 50) });
    expect(textPartsUsed(tenant, month)).toBe(before); // still in the log, not in the count
    tenant.messages = tenant.messages.filter((m) => m.id !== "reset_flood");
  });
});

describe("storage while a downgrade waits (audit #25)", () => {
  it("counts the smaller plan's storage until the downgrade's date", async () => {
    asStaff(BULILIT_ADMIN);
    const tenant = platform.tenants.clinic_demo!;
    const sub = platform.subscriptions.find((s) => s.clinicId === "clinic_demo")!;
    const kept = sub.downgrade;
    tenant.storedFiles.push({ key: "filler_down", area: "photos", bytes: 25 * GB - tenant.storedFiles.reduce((n, f) => n + f.bytes, 0) });
    try {
      sub.downgrade = { tier: "small", on: "2099-01-01" };
      const kid = tenant.patients[0]!.id;
      expect(await message(api(`/patients/${kid}/photo`, z.unknown(), photo()))).toBe(storageFullMessage("small"));
      sub.downgrade = kept;
      expect(await message(api(`/patients/${kid}/photo`, z.unknown(), photo()))).toBe("");
    } finally {
      sub.downgrade = kept;
      tenant.storedFiles = tenant.storedFiles.filter((f) => f.key !== "filler_down");
    }
  });
});
