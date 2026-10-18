import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { AccountOverview, ClinicUsage, FAILURE, GB, PortalAccess, storageFullMessage } from "@pedia/shared";
import { ApiError, api } from "@/lib/api-client";
import { platform, selectTenant } from "./db";
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
    ngiti().storedFiles.push({ key: "filler", area: "photos", bytes: 2 * GB - 10 - ngiti().storedFiles.reduce((n, f) => n + f.bytes, 0) });
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
  it("logs a template text past the month's parts as not sent, and still queues a portal invite", async () => {
    selectTenant("clinic_ngiti");
    const kid = ngiti().patients.find((p) => !p.privacyChoices?.some((c) => !c.reminders))!;
    const now = new Date().toISOString();
    ngiti().messages.push({ ...ngiti().messages[0]!, id: "filler_text", patientId: kid.id, status: "sent", sendAt: now, body: "x".repeat(153 * 300) });
    expect(queueMessage({ kind: "birthday", patientId: kid.id, sendAt: now })).toMatchObject({ status: "failed", failureReason: FAILURE.textLimit });
    asStaff(NGITI_OWNER);
    const usage = await api("/clinic/usage", ClinicUsage);
    expect(usage.texts.inUse).toBeGreaterThanOrEqual(300);
    expect(usage.storage).toEqual({ inUse: 2 * GB - 10, limit: 2 * GB });
  });

  it("shows the console the same usage as the Owner (decision 17)", async () => {
    asStaff(NGITI_OWNER);
    const owner = await api("/clinic/usage", ClinicUsage);
    cookies("pd_operator=operator.operator_primolar");
    const overview = (await api("/operator/accounts", z.array(AccountOverview))).find((a) => a.account.id === "clinic_ngiti")!;
    expect([overview.usage.storage, overview.usage.texts]).toEqual([owner.storage, owner.texts]);
  });

  it("never refuses an invite for the limit (decision 3)", async () => {
    asStaff(NGITI_OWNER);
    const kid = ngiti().patients.find((p) => p.guardians.some((g) => /^09\d{9}$/.test(g.phone)))!;
    const g = kid.guardians.find((x) => /^09\d{9}$/.test(x.phone))!;
    const account = ngiti().portalAccounts.find((a) => a.guardianId === g.id);
    if (account) account.state = "off"; // seeded parents are active: invite them again
    await api(`/patients/${kid.id}/guardians/${g.id}/portal-invite`, PortalAccess, { method: "POST" });
    expect(ngiti().messages.at(-1)).toMatchObject({ kind: "portal_invite", status: "queued" });
  });
});
