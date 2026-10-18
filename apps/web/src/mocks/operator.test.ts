import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import {
  AccountOverview,
  CONFIDENTIALITY_NOTICE,
  Branch,
  ClinicContext,
  ClinicUsage,
  CreateAccountResult,
  DEFAULT_OPENING_HOURS,
  LoginResult,
  OperatorSession,
  OperatorUser,
  OwnerCandidate,
  Session,
  SessionUser,
  limitMessage,
  type CreateAccountInput,
} from "@pedia/shared";
import { read } from "@/design/source";
import { signupFormData } from "@/features/signup/form-data";
import { ApiError, api } from "@/lib/api-client";
import { ACCESS_RULES } from "./access";
import { today } from "./clock";
import { currentClinicId, platform } from "./db";
import { DEMO_PASSWORD } from "./demo-accounts";
import { handlers } from "./handlers";
import { staffAcknowledged } from "@pedia/seed";

const server = setupServer(...handlers);
const OPERATOR = "operator.operator_primolar";
const DEMO_OWNER = "demo.clinic_demo.staff_villanueva";
const cookies = (...c: string[]) => vi.stubGlobal("document", { cookie: c.join("; ") });
const asOperator = () => cookies(`pd_operator=${OPERATOR}`);
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const status = (p: Promise<unknown>) => p.then(() => 200, (e: ApiError) => e.status);
const accounts = () => api("/operator/accounts", z.array(AccountOverview));

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("operator sign-in", () => {
  it("signs in with its own token shape", async () => {
    cookies();
    const s = await api("/operator/auth/login", OperatorSession, send("POST", { email: "operator@primolar.demo", password: DEMO_PASSWORD }));
    expect(s.token).toBe(OPERATOR);
    asOperator();
    expect((await api("/operator/auth/me", OperatorUser)).email).toBe("operator@primolar.demo");
  });

  it("refuses a wrong password", async () => {
    cookies();
    expect(await status(api("/operator/auth/login", OperatorSession, send("POST", { email: "operator@primolar.demo", password: "nope" })))).toBe(401);
  });

  it("is not a clinic login", async () => {
    cookies();
    expect(await status(api("/auth/login", LoginResult, send("POST", { email: "operator@primolar.demo", password: DEMO_PASSWORD })))).toBe(401);
  });
});

describe("the operator never reaches clinic data (decision #25)", () => {
  it("is refused by every clinic route, by cookie and by bearer header", async () => {
    asOperator();
    for (const rule of ACCESS_RULES) {
      const path = rule.path.replace(/:\w+/g, "patient_sibling");
      const init = { method: rule.method, headers: { authorization: `Bearer ${OPERATOR}` }, ...(rule.method === "GET" ? {} : { body: "{}" }) };
      expect(await status(api(path, z.unknown(), init)), `${rule.method} ${rule.path}`).toBe(401);
    }
    expect(await status(api("/auth/me", z.unknown()))).toBe(401);
  });

  it("serves counts, never patient rows, and never moves the tenant", async () => {
    const before = currentClinicId();
    asOperator();
    const rows = await accounts();
    const demo = platform.tenants.clinic_demo!;
    expect(rows.find((r) => r.account.id === "clinic_demo")!.usage.patients).toBe(demo.patients.length);
    const text = JSON.stringify(rows);
    for (const p of demo.patients) expect(text).not.toContain(p.id);
    expect(currentClinicId()).toBe(before);
  });

  it("refuses a clinic Owner on operator routes, even with both cookies' names swapped", async () => {
    cookies(`pd_session=${DEMO_OWNER}`);
    expect(await status(accounts())).toBe(401);
    cookies(`pd_operator=${DEMO_OWNER}`);
    expect(await status(accounts())).toBe(401);
  });

  it("refuses the operator token by cookie alone, and a clinic token as a header to operator routes", async () => {
    cookies(`pd_session=${OPERATOR}`); // an operator token in the clinic cookie is not a clinic session
    for (const rule of ACCESS_RULES) {
      const path = rule.path.replace(/:\w+/g, "patient_sibling");
      const init = { method: rule.method, ...(rule.method === "GET" ? {} : { body: "{}" }) };
      expect(await status(api(path, z.unknown(), init)), `${rule.method} ${rule.path}`).toBe(401);
    }
    cookies();
    expect(await status(api("/operator/accounts", z.unknown(), { headers: { authorization: `Bearer ${DEMO_OWNER}` } }))).toBe(401);
  });

  it("answers not found for ids that aren't accounts, prototype keys included", async () => {
    asOperator();
    for (const id of ["__proto__", "constructor", "toString", "clinic_nope"]) {
      expect(await status(api(`/operator/accounts/${id}/staff`, z.unknown())), id).toBe(404);
      expect(await status(api(`/operator/accounts/${id}/owner`, z.unknown(), send("POST", { staffId: "x" }))), id).toBe(404);
    }
  });

  it("refuses an operator route with no rule", async () => {
    asOperator();
    expect(await status(api("/operator/patients", z.unknown()))).toBe(403);
  });

  it("keeps operator and sign-up handlers out of the tenant binding (decision #25, billing #4)", () => {
    const files = ["features/operator/mocks.ts", "features/operator/signup-mocks.ts", "features/signup/mocks.ts", "mocks/signups.ts", "mocks/subscriptions.ts", "features/legal/mocks.ts", "features/operator/payment-mocks.ts", "mocks/receipts.ts", "mocks/allowances.ts"];
    for (const file of files) {
      const src = read(file);
      expect(src, file).not.toMatch(/\b(selectTenant|sessionOf|activeBranch|currentClinicId|currentAccount)\b/);
      expect(src, file).not.toMatch(/import \{[^}]*\bdb\b[^}]*\} from "(@\/mocks|\.)\/db"/);
    }
  });
});

const EXAMPLE_NEW = "EXAMPLE-chosen-at-first-sign-in";
const TALA: CreateAccountInput = {
  account: { name: "Tala Kids Dental", contactEmail: "hello@tala.demo", tin: "345-678-901", tier: "mid" },
  branch: { name: "Silang", address: "3 Rizal Street, Silang, Cavite", phone: "(046) 400 0300", openingHours: DEFAULT_OPENING_HOURS },
  owner: { fullName: "Dr. Tala Ramos", email: "owner@tala.demo", role: "dentist" },
  branding: { choice: "default" },
  payment: { method: "bank_transfer", paidOn: "2026-10-13" },
  signedOnFile: true,
  signedOn: "2026-10-01",
};
const multipart = (data: unknown, files?: Parameters<typeof signupFormData>[1]) => ({ method: "POST", body: signupFormData(data, files) });
const asStaff = (token: string) => cookies(`pd_session=${token}`);

describe("operator account actions (chunk 21 done-when)", () => {
  let created: CreateAccountResult;
  let ownerToken: string;

  it("creates a third account, and its new Owner signs in to it", async () => {
    asOperator();
    created = await api("/operator/accounts", CreateAccountResult, multipart(TALA));
    expect(await accounts()).toHaveLength(4); // Bulilit, Ngiti, Ipin (chunk 23) and Tala
    expect(created.overview).toMatchObject({ account: { tier: "mid", status: "active" }, owner: { email: "owner@tala.demo" }, usage: { branches: 1, staffLogins: 1, patients: 0 } });
    expect(await status(api("/operator/accounts", CreateAccountResult, multipart(TALA)))).toBe(409);
    // A5: written as an approved, paid sign-up from the console, so chunk 23 finds its first payment in one place.
    expect(platform.signups.find((s) => s.approval?.clinicId === created.overview.account.id)).toMatchObject({ source: "console", status: "approved", payment: { method: "bank_transfer" } });

    cookies();
    const first = await api("/auth/login", Session, send("POST", { email: "owner@tala.demo", password: created.temporaryPassword }));
    asStaff(first.token);
    expect(await status(api("/clinic", ClinicContext))).toBe(403); // must choose a password first (#21)
    const fresh = await api("/auth/password", Session, send("POST", { current: created.temporaryPassword, next: EXAMPLE_NEW }));
    ownerToken = fresh.token;
    asStaff(ownerToken);
    await api("/auth/acknowledgement", Session, send("POST", { kind: "confidentiality", version: CONFIDENTIALITY_NOTICE.version })); // privacy #21
    const clinic = await api("/clinic", ClinicContext);
    expect(clinic.account.name).toBe("Tala Kids Dental");
    expect(fresh.user.roles).toEqual(["owner", "dentist"]);
  });

  it("refuses a downgrade the clinic is over (B12 decision 12); once within it, the downgrade waits and blocks additions", async () => {
    asStaff(ownerToken);
    const branch = { name: "Dasmariñas", address: "9 Congressional Road, Dasmariñas", phone: "(046) 400 0301", openingHours: DEFAULT_OPENING_HOURS };
    const second = await api("/branches", Branch, send("POST", branch)); // Mid allows 3
    asOperator();
    const id = created.overview.account.id;
    await expect(api(`/operator/accounts/${id}/tier`, AccountOverview, send("PUT", { tier: "small" }))).rejects.toMatchObject({ status: 409, message: expect.stringContaining("2 open branches") });
    asStaff(ownerToken);
    await api(`/branches/${second.id}/archive`, Branch, send("POST"));
    asOperator();
    const waiting = await api(`/operator/accounts/${id}/tier`, AccountOverview, send("PUT", { tier: "small" }));
    expect(waiting.account.tier).toBe("mid"); // billing #27: a downgrade waits for the next due date
    asStaff(ownerToken);
    // B12 E13: while it waits, an addition is checked against the smaller plan.
    await expect(api("/branches", Branch, send("POST", { ...branch, name: "Imus" }))).rejects.toMatchObject({ status: 409, message: limitMessage("small", "branches") });
    // Bring the date to today; subscriptions.test.ts walks the calendar itself.
    platform.subscriptions.find((s) => s.clinicId === id)!.downgrade!.on = today();
    expect(await api("/clinic/usage", ClinicUsage)).toMatchObject({ tier: "small", branches: { inUse: 1, limit: 1 } });
    // Logins are still under Small's 5, so adding staff still works.
    const open = (await api("/branches", z.array(Branch))).filter((b) => !b.archived);
    await api("/staff", z.unknown(), send("POST", { fullName: "Lia Santos", email: "lia@tala.demo", role: "front_desk", branchIds: [open[0]!.id] }));
    // And no cross-branch views on Small (decision #6).
    expect(await status(api(`/reports/finance?branch=all`, z.unknown()))).toBe(403);
  });

  it("suspension ends live staff sessions, and reactivation restores them", async () => {
    asOperator();
    await api(`/operator/accounts/${created.overview.account.id}/suspend`, AccountOverview, send("POST"));
    asStaff(ownerToken);
    expect(await status(api("/clinic", ClinicContext))).toBe(401); // decision #41: the very next request
    cookies();
    expect(await status(api("/auth/login", Session, send("POST", { email: "owner@tala.demo", password: EXAMPLE_NEW })))).toBe(403);
    asOperator();
    const back = await api(`/operator/accounts/${created.overview.account.id}/reactivate`, AccountOverview, send("POST"));
    expect(back.usage.branches).toBe(1); // nothing was lost (#26): the one open branch (the second was archived for the downgrade)
    asStaff(ownerToken);
    expect(await status(api("/clinic", ClinicContext))).toBe(200);
  });

  it("transfers ownership only to an active staff login, and the old Owner keeps their other role", async () => {
    const id = created.overview.account.id;
    asOperator();
    const candidates = await api(`/operator/accounts/${id}/staff`, z.array(OwnerCandidate));
    const lia = candidates.find((c) => c.email === "lia@tala.demo")!;
    expect(candidates.map((c) => c.email)).not.toContain("owner@tala.demo");
    expect(await status(api(`/operator/accounts/${id}/owner`, AccountOverview, send("POST", { staffId: "staff_villanueva" })))).toBe(400); // another account's
    platform.tenants[id]!.staff.find((s) => s.id === lia.staffId)!.deactivatedAt = new Date().toISOString();
    expect(await status(api(`/operator/accounts/${id}/owner`, AccountOverview, send("POST", { staffId: lia.staffId })))).toBe(400);
    delete platform.tenants[id]!.staff.find((s) => s.id === lia.staffId)!.deactivatedAt;

    const after = await api(`/operator/accounts/${id}/owner`, AccountOverview, send("POST", { staffId: lia.staffId }));
    expect(after.owner).toMatchObject({ email: "lia@tala.demo" });
    expect(platform.tenants[id]!.staff.filter((s) => s.isOwner)).toHaveLength(1);

    asStaff(ownerToken); // Dr. Ramos, still signed in
    expect((await api("/auth/me", SessionUser)).roles).toEqual(["dentist"]);
    expect(await status(api("/clinic/usage", ClinicUsage))).toBe(403); // clinic.manage went with ownership
    expect(await status(api("/clinic", ClinicContext))).toBe(200); // still works there
  });
});

describe("audit findings: duplicate names and a stranded old Owner", () => {
  it("treats inner spaces as one clinic name", async () => {
    asOperator();
    const twin = { ...TALA, account: { ...TALA.account, name: "Bulilit  Smiles   Pediatric Dental" }, owner: { ...TALA.owner, email: "twin@bulilit.demo" } };
    expect(await status(api("/operator/accounts", CreateAccountResult, multipart(twin)))).toBe(409);
    // Billing #10: a contact email in use is refused too, and so is a waiting sign-up's name.
    const sameEmail = { ...TALA, account: { ...TALA.account, name: "Brand New Dental", contactEmail: "HELLO@ngiti.demo" } };
    expect(await status(api("/operator/accounts", CreateAccountResult, multipart(sameEmail)))).toBe(409);
    const waitingName = { ...TALA, account: { ...TALA.account, name: "hagikgik kids  dental", contactEmail: "x@hagikgik2.demo" } };
    expect(await status(api("/operator/accounts", CreateAccountResult, multipart(waitingName)))).toBe(409);
  });

  it("gives an old Owner whose branches were all archived every open branch, so the app still opens for them", async () => {
    asOperator();
    const made = await api("/operator/accounts", CreateAccountResult, multipart({ ...TALA, account: { ...TALA.account, name: "Bituin Dental", contactEmail: "hello@bituin.demo" }, owner: { ...TALA.owner, email: "owner@bituin.demo" } }));
    const id = made.overview.account.id;
    const tenant = platform.tenants[id]!;
    const first = tenant.branches[0]!;
    // The Owner opened a second branch and archived the first: allowed, since an Owner works everywhere.
    tenant.branches.push({ ...first, id: `${first.id}_2`, name: "Second", archived: false });
    first.archived = true;
    tenant.staff.push({ id: `${id}_heir`, clinicId: id, fullName: "Heir Apparent", role: "admin", branchIds: [`${first.id}_2`] });
    const oldOwner = tenant.staff.find((s) => s.isOwner)!;
    tenant.staffCredentials.find((c) => c.staffId === oldOwner.id)!.mustChange = false;
    tenant.acknowledgements.push(...staffAcknowledged(id, [oldOwner])); // privacy #21: as if they had read it

    await api(`/operator/accounts/${id}/owner`, AccountOverview, send("POST", { staffId: `${id}_heir` }));
    expect(oldOwner.branchIds).toEqual([`${first.id}_2`]);
    asStaff(`demo.${id}.${oldOwner.id}`);
    expect(await status(api("/clinic", ClinicContext))).toBe(200);
  });
});
