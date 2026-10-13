import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import {
  DEFAULT_OPENING_HOURS,
  DUPLICATE_EMAIL_MESSAGE,
  PriceList,
  SignupStatusView,
  amountDue,
  duplicateNameMessage,
  type SignupInput,
} from "@pedia/shared";
import { signupFormData } from "@/features/signup/form-data";
import { ApiError, api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { currentClinicId, platform } from "./db";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const svg = () => new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" });
const png = () => new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" });
const submit = (input: SignupInput, files?: Parameters<typeof signupFormData>[1]) =>
  api("/signups", SignupStatusView, { method: "POST", body: signupFormData(input, files) });

/** A fresh, valid sign-up; `n` keeps names and emails apart between tests. */
const form = (n: string, branding: SignupInput["branding"], tier: SignupInput["account"]["tier"] = "small"): SignupInput => ({
  account: { name: `Ngipin ${n} Dental`, contactEmail: `hello@ngipin${n}.demo`, tin: "567-890-123", tier },
  branch: { name: "Tagaytay", address: "1 Aguinaldo Hi-way, Tagaytay", phone: "(046) 483 0000", openingHours: DEFAULT_OPENING_HOURS },
  owner: { fullName: `Dr. ${n} Cruz`, email: `owner@ngipin${n}.demo`, role: "admin" },
  branding,
});

beforeAll(() => {
  server.listen({ onUnhandledFrame: "error" });
  vi.stubGlobal("document", { cookie: "" }); // no session of any kind: the form is public (billing #4)
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("the public Get started form (billing #4–#11)", () => {
  it("serves the price list without a sign-in", async () => {
    expect(await api("/signups/prices", PriceList)).toEqual(platform.prices);
  });

  it("takes each branding choice and quotes setup + first month (+ design), VAT shown", async () => {
    const before = currentClinicId();
    const own = await submit(form("own", { choice: "own", brandColor: "#0D6E8C", headingFont: "poppins" }), { logo: svg() });
    const plain = await submit(form("plain", { choice: "default" }, "mid"));
    const designed = await submit(form("designed", { choice: "designed", brief: "Sunny, calm" }, "big"), { references: [png(), png()] });

    for (const [view, choice] of [[own, "own"], [plain, "default"], [designed, "designed"]] as const) {
      expect(view).toMatchObject({ status: "waiting", paid: false, branding: choice, rejectionReason: null });
      expect(view.reference).toMatch(/^PRM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(view.quote).toEqual(amountDue(platform.prices, view.tier, choice));
    }
    expect(designed.quote.designAddOn).toBe(platform.prices.designAddOn);
    expect(own.quote.designAddOn).toBe(0);

    const stored = (ref: string) => platform.signups.find((s) => s.reference === ref)!;
    expect(stored(own.reference)).toMatchObject({ branding: { brandColor: "#0d6e8c" }, logoRef: expect.any(String) });
    expect(stored(designed.reference).referenceRefs).toHaveLength(2);
    expect(stored(plain.reference).logoRef).toBeUndefined();
    expect(currentClinicId()).toBe(before); // a sign-up is no clinic yet: the tenant binding never moves
  });

  it("needs a logo and a passing colour for Use my own (billing #6, #19)", async () => {
    const own = form("nologo", { choice: "own", brandColor: "#0d6e8c", headingFont: null });
    await expect(submit(own)).rejects.toMatchObject({ status: 400, message: /Add your logo/ });
    const pale = form("pale", { choice: "own", brandColor: "#f4c542", headingFont: null });
    await expect(submit(pale, { logo: svg() })).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/too light.*Try #[0-9a-f]{6}\.$/) });
  });

  it("refuses bad files: a GIF logo, four reference images", async () => {
    const gif = new Blob(["GIF89a"], { type: "image/gif" });
    expect(await status(submit(form("gif", { choice: "own", brandColor: "#0d6e8c", headingFont: null }), { logo: gif }))).toBe(400);
    expect(await status(submit(form("four", { choice: "designed", brief: "x" }), { references: [png(), png(), png(), png()] }))).toBe(400);
  });

  it("refuses a name or contact email already on Primolar or waiting, ignoring case and spaces (billing #10)", async () => {
    const clinicName = { ...form("dup1", { choice: "default" }), account: { ...form("dup1", { choice: "default" }).account, name: "  bulilit SMILES pediatric   dental" } };
    await expect(submit(clinicName)).rejects.toMatchObject({ status: 409, message: duplicateNameMessage(clinicName.account.name) });
    const waitingName = { ...form("dup2", { choice: "default" }), account: { ...form("dup2", { choice: "default" }).account, name: "Hagikgik Kids Dental" } };
    expect(await status(submit(waitingName))).toBe(409); // the seeded sign-up, still waiting
    const email = { ...form("dup3", { choice: "default" }), account: { ...form("dup3", { choice: "default" }).account, contactEmail: "Hello@Ngiti.demo" } };
    await expect(submit(email)).rejects.toMatchObject({ status: 409, message: DUPLICATE_EMAIL_MESSAGE });
  });

  it("shows a sign-up by its reference, in any case, and nothing private (A1)", async () => {
    const made = await submit(form("lookup", { choice: "default" }));
    const seen = await api(`/signups/${made.reference.toLowerCase()}`, SignupStatusView);
    expect(seen).toEqual(made);
    const raw = await (await fetch(`${env.apiUrl}/signups/${made.reference}`)).text().catch(() => "");
    expect(raw).not.toContain("owner@ngipinlookup.demo");
    expect(await status(api("/signups/PRM-NONE-NONE", SignupStatusView))).toBe(404);
  });

  it("refuses a public route with no rule, and never needs a clinic session", async () => {
    expect(await status(api("/signups/prices/extra", z.unknown()))).toBe(403);
    expect(await status(api("/clinic", z.unknown()))).toBe(401); // the same browser has no clinic access
  });
});
