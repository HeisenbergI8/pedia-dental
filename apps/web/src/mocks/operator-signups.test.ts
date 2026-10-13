import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import {
  AccountOverview,
  ClinicContext,
  CreateAccountResult,
  DEFAULT_BRAND_COLOR,
  DEFAULT_OPENING_HOURS,
  PriceList,
  Session,
  Signup,
  SignupStatusView,
  amountDue,
  pesos,
  signupStatusLabel,
  type SignupInput,
} from "@pedia/shared";
import { PAID_PLAN_LOCKED } from "@/features/operator/signup-mocks";
import { signupFormData } from "@/features/signup/form-data";
import { env } from "@/lib/env";
import { ApiError, api } from "@/lib/api-client";
import { platform } from "./db";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const cookies = (...c: string[]) => vi.stubGlobal("document", { cookie: c.join("; ") });
const asOperator = () => cookies("pd_operator=operator.operator_primolar");
const asStaff = (token: string) => cookies(`pd_session=${token}`);
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const json = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const multipart = (method: string, data: unknown, files?: Parameters<typeof signupFormData>[1]) => ({ method, body: signupFormData(data, files) });
const svg = () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" });
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const PAID = { method: "gcash", reference: "GC-0042", paidOn: "2026-10-13" } as const;

const input = (n: string, branding: SignupInput["branding"]): SignupInput => ({
  account: { name: `Ngiti ${n} Kids`, contactEmail: `hello@${n}.demo`, tin: "678-901-234", tier: "mid" },
  branch: { name: "Lipa", address: "5 Rizal Avenue, Lipa", phone: "(043) 756 0000", openingHours: DEFAULT_OPENING_HOURS },
  owner: { fullName: `Dr. ${n} Reyes`, email: `owner@${n}.demo`, role: "dentist" },
  branding,
});
/** The client's side: a public submission, no cookie. Returns the stored sign-up as the operator sees it. */
async function submitted(i: SignupInput, files?: Parameters<typeof signupFormData>[1]) {
  cookies();
  const view = await api("/signups", SignupStatusView, multipart("POST", i, files));
  asOperator();
  return (await api("/operator/signups", z.array(Signup))).find((s) => s.reference === view.reference)!;
}
const pay = (id: string) => api(`/operator/signups/${id}/payment`, Signup, json("POST", PAID));
const approve = (id: string) => api(`/operator/signups/${id}/approve`, CreateAccountResult, json("POST"));
/** Signs the new Owner in with the one-time password, chooses their own, and opens their clinic (decision #21). */
async function ownerOpens(made: CreateAccountResult): Promise<ClinicContext> {
  cookies();
  const first = await api("/auth/login", Session, json("POST", { email: made.overview.owner!.email, password: made.temporaryPassword }));
  asStaff(first.token);
  const fresh = await api("/auth/password", Session, json("POST", { current: made.temporaryPassword, next: "EXAMPLE-owner-chose-this" }));
  asStaff(fresh.token);
  return api("/clinic", ClinicContext);
}

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("sign-ups in the console (billing #12–#15)", () => {
  it("lists the demo sign-up waiting for its setup fee", async () => {
    asOperator();
    const rows = await api("/operator/signups", z.array(Signup));
    expect(signupStatusLabel(rows.find((s) => s.id === "signup_hagikgik")!)).toBe("Waiting for setup fee");
  });

  it("won't approve before the setup fee is recorded, then records it as the quoted total, once", async () => {
    const s = await submitted(input("orderly", { choice: "default" }));
    await expect(approve(s.id)).rejects.toMatchObject({ status: 409, message: /Record the setup fee/ });
    const paid = await pay(s.id);
    expect(paid.payment).toMatchObject({ ...PAID, amount: s.quote.total });
    expect(signupStatusLabel(paid)).toBe("Paid, ready to approve");
    expect(await status(pay(s.id))).toBe(409);
  });

  it("approves Use my own: the Owner signs in to a clinic already in their logo, colour and font", async () => {
    const s = await submitted(input("ownlook", { choice: "own", brandColor: "#1e5fb4", headingFont: "lexend" }), { logo: svg() });
    await pay(s.id);
    const made = await approve(s.id);
    expect(made.overview).toMatchObject({ account: { tier: "mid", status: "active" }, usage: { branches: 1, staffLogins: 1 }, design: null });
    const clinic = await ownerOpens(made);
    expect(clinic.account).toMatchObject({ brandColor: "#1e5fb4", headingFont: "lexend" });
    expect(clinic.branches[0]).toMatchObject({ name: "Lipa", openingHours: DEFAULT_OPENING_HOURS });
    expect(clinic.logoUrl).toContain("/clinic/logo?v=");
    const logo = await fetch(`${env.apiUrl}/clinic/logo`, { credentials: "include" });
    expect(logo.headers.get("content-type")).toBe("image/svg+xml");
    // The client's page says so too (A1).
    cookies();
    expect((await api(`/signups/${s.reference}`, SignupStatusView)).status).toBe("approved");
  });

  it("approves the default look: Primolar's colour and no logo (billing #7)", async () => {
    const s = await submitted(input("plainlook", { choice: "default" }));
    await pay(s.id);
    const clinic = await ownerOpens(await approve(s.id));
    expect(clinic.account.brandColor).toBe(DEFAULT_BRAND_COLOR);
    expect(clinic.account.headingFont).toBeUndefined();
    expect(clinic.logoUrl).toBeNull();
  });

  it("fixes a waiting sign-up, re-quoting a plan change, and refuses a fix that clashes (billing #13, A2)", async () => {
    const s = await submitted(input("typo", { choice: "default" }));
    const fixed = await api(`/operator/signups/${s.id}`, Signup, multipart("PUT", { ...input("typo", { choice: "default" }), account: { ...s.account, name: "Ngiti Typo Kids Dental", tier: "big" } }));
    expect(fixed.account.name).toBe("Ngiti Typo Kids Dental");
    expect(fixed.quote).toEqual(amountDue(platform.prices, "big", "default"));
    const clash = { ...input("typo", { choice: "default" }), account: { ...s.account, name: "Ngiti Kids Dental" } };
    expect(await status(api(`/operator/signups/${s.id}`, Signup, multipart("PUT", clash)))).toBe(409);
  });

  it("locks the plan and look once the setup fee is recorded, so nothing is approved underpaid (billing #24)", async () => {
    const s = await submitted(input("locked", { choice: "default" }));
    await pay(s.id);
    const bigger = { ...input("locked", { choice: "default" }), account: { ...s.account, tier: "big" as const } };
    await expect(api(`/operator/signups/${s.id}`, Signup, multipart("PUT", bigger))).rejects.toMatchObject({ status: 409, message: PAID_PLAN_LOCKED });
    const typo = await api(`/operator/signups/${s.id}`, Signup, multipart("PUT", { ...input("locked", { choice: "default" }), account: { ...s.account, name: "Ngiti Locked Kids Dental" } }));
    expect([typo.account.name, typo.account.tier, typo.quote]).toEqual(["Ngiti Locked Kids Dental", "mid", s.quote]);
  });

  it("rejects with a reason the client sees; a paid one reads Rejected, refunded (billing #13, #14)", async () => {
    const s = await submitted(input("nope", { choice: "default" }));
    await pay(s.id);
    const reason = "We couldn't confirm the clinic's PRC registration. Call us to sort it out.";
    const rejected = await api(`/operator/signups/${s.id}/reject`, Signup, json("POST", { reason }));
    expect(signupStatusLabel(rejected)).toBe("Rejected, refunded");
    expect(await status(approve(s.id))).toBe(409);
    expect(await status(api(`/operator/signups/${s.id}/reject`, Signup, json("POST", { reason })))).toBe(409);
    cookies();
    expect(await api(`/signups/${s.reference}`, SignupStatusView)).toMatchObject({ status: "rejected", paid: true, rejectionReason: reason });
    // A11: a rejected name may sign up again.
    expect(await status(api("/signups", SignupStatusView, multipart("POST", input("nope", { choice: "default" }))))).toBe(200);
  });

  it("re-checks the name at approval, in case a clinic took it since", async () => {
    const s = await submitted(input("late", { choice: "default" }));
    await pay(s.id);
    const ngiti = platform.accounts.find((a) => a.id === "clinic_ngiti")!;
    const was = ngiti.name;
    ngiti.name = s.account.name; // the Owner renamed their clinic in Settings meanwhile
    try {
      expect(await status(approve(s.id))).toBe(409);
    } finally {
      ngiti.name = was;
    }
  });

  it("serves a sign-up's files to the operator only, and only its own", async () => {
    const s = await submitted(input("files", { choice: "designed", brief: "Calm" }), { references: [png()] });
    const res = await fetch(`${env.apiUrl}/operator/signups/${s.id}/files/${s.referenceRefs[0]}`, { credentials: "include" });
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");
    expect(await status(api(`/operator/signups/${s.id}/files/not_a_key`, z.unknown()))).toBe(404);
    cookies();
    expect(await status(api(`/operator/signups/${s.id}/files/${s.referenceRefs[0]}`, z.unknown()))).toBe(401);
  });
});

describe("Design it for me (billing #17–#20)", () => {
  it("goes live with the default look, then Set branding delivers the finished logo, colour and font", async () => {
    asOperator();
    await pay("signup_hagikgik");
    const made = await approve("signup_hagikgik");
    expect(made.overview.design).toBe("in_progress");
    expect(made.overview.look).toMatchObject({ headingFont: null, hasLogo: false });
    const id = made.overview.account.id;
    const clinic = await ownerOpens(made);
    expect([clinic.account.brandColor, clinic.logoUrl]).toEqual([DEFAULT_BRAND_COLOR, null]);

    asOperator();
    const pale = { brandColor: "#9fe3d0", headingFont: "fredoka" };
    expect(await status(api(`/operator/accounts/${id}/branding`, AccountOverview, multipart("PUT", pale, { logo: svg() })))).toBe(400);
    expect(await status(api(`/operator/accounts/${id}/branding`, AccountOverview, multipart("PUT", { brandColor: "#0f766e", headingFont: "fredoka" })))).toBe(400); // no logo yet
    const done = await api(`/operator/accounts/${id}/branding`, AccountOverview, multipart("PUT", { brandColor: "#0f766e", headingFont: "fredoka" }, { logo: svg() }));
    expect(done.design).toBe("delivered");
    expect(done.look).toEqual({ brandColor: "#0f766e", headingFont: "fredoka", hasLogo: true }); // Set branding starts from it next time
    const owner = platform.tenants[id]!.staff.find((s) => s.isOwner)!;
    asStaff(`demo.${id}.${owner.id}`);
    const after = await api("/clinic", ClinicContext);
    expect(after.account).toMatchObject({ brandColor: "#0f766e", headingFont: "fredoka" });
    expect(after.logoUrl).toContain("/clinic/logo?v=");
  });

  it("is the operator's only branding power: refused for a clinic that didn't choose it", async () => {
    asOperator();
    const res = api("/operator/accounts/clinic_demo/branding", AccountOverview, multipart("PUT", { brandColor: "#0f766e", headingFont: "nunito" }, { logo: svg() }));
    expect(await status(res)).toBe(409);
  });
});

describe("the price list (billing #23, A2) — keep last: it changes platform.prices", () => {
  it("is edited by the operator; new sign-ups are quoted from it, waiting ones keep their quote", async () => {
    const waiting = await submitted(input("before", { choice: "default" }));
    const raised: PriceList = { ...platform.prices, plans: { ...platform.prices.plans, mid: { setupFee: pesos(12000), monthlyFee: pesos(6000) } } };
    expect(await api("/operator/prices", PriceList, json("PUT", raised))).toEqual(raised);
    const after = await submitted(input("after", { choice: "default" }));
    expect(after.quote.total).toBe(pesos(18000));
    expect(platform.signups.find((s) => s.id === waiting.id)!.quote).toEqual(waiting.quote);
    cookies();
    expect(await api("/signups/prices", PriceList)).toEqual(raised);
  });

  it("refuses a negative or fractional amount, and anyone but the operator", async () => {
    asOperator();
    const bad = { ...platform.prices, designAddOn: -1 };
    expect(await status(api("/operator/prices", PriceList, json("PUT", bad)))).toBe(400);
    expect(await status(api("/operator/prices", PriceList, json("PUT", { ...platform.prices, designAddOn: 10.5 })))).toBe(400);
    asStaff("demo.clinic_demo.staff_villanueva");
    expect(await status(api("/operator/prices", PriceList, json("PUT", platform.prices)))).toBe(401);
  });
});
