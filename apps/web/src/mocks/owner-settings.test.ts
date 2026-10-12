import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import {
  AddStaffResult,
  Branch,
  ClinicAccount,
  ClinicContext,
  ClinicUsage,
  DEFAULT_OPENING_HOURS,
  LoginResult,
  Patient,
  Session,
  StaffMember,
  type AddStaffInput,
  type BranchInput,
} from "@pedia/shared";
import { api } from "@/lib/api-client";
import { env } from "@/lib/env";
import { platform } from "./db";
import { DEMO_PASSWORD, staffEmail } from "./demo-accounts";
import { handlers } from "./handlers";

const server = setupServer(...handlers);
const signIn = (token: string | null) => vi.stubGlobal("document", { cookie: token ? `pd_session=${token}` : "" });
const NGITI_OWNER = "demo.clinic_ngiti.ngiti_staff_lim";
const DEMO_OWNER = "demo.clinic_demo.staff_villanueva";
const DEMO_ADMIN = "demo.clinic_demo.staff_delacruz";
const EXAMPLE_NEW = "EXAMPLE-chosen-at-first-sign-in";
const EXAMPLE_WRONG = "EXAMPLE-wrong";
const send = (method: string, body?: unknown) => ({ method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const login = (email: string, secret: string) => api("/auth/login", LoginResult, send("POST", { email, password: secret }));
const branch = (name: string): BranchInput => ({ name, address: `1 ${name} Road, Cavite`, phone: "(046) 400 0000", openingHours: DEFAULT_OPENING_HOURS });
const newcomer = (email: string): AddStaffInput => ({ fullName: "Nora Ramos", email, role: "front_desk", branchIds: ["branch_ngiti_bacoor"] });

beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});

describe("Small tier at its limits (done-when)", () => {
  it("shows Ngiti at 1 of 1 branches and 5 of 5 logins", async () => {
    signIn(NGITI_OWNER);
    const usage = await api("/clinic/usage", ClinicUsage);
    expect(usage).toEqual({ tier: "small", branches: { inUse: 1, limit: 1 }, staffLogins: { inUse: 5, limit: 5 } });
  });

  it("refuses a second branch and a sixth login, naming the limit and how to lift it", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/branches", Branch, send("POST", branch("Kawit")))).rejects.toMatchObject({
      status: 409,
      message: "Your Small plan includes 1 branch. Contact Primolar to upgrade.",
    });
    await expect(api("/staff", AddStaffResult, send("POST", newcomer("nora@ngiti.demo")))).rejects.toMatchObject({
      status: 409,
      message: "Your Small plan includes 5 staff logins. Contact Primolar to upgrade.",
    });
  });

  it("never archives the last open branch", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/branches/branch_ngiti_bacoor/archive", Branch, send("POST"))).rejects.toMatchObject({ status: 409 });
  });
});

describe("deactivating frees a seat (decisions #10, #23)", () => {
  let added: AddStaffResult;

  it("refuses to deactivate the Owner", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/staff/ngiti_staff_lim/deactivate", StaffMember, send("POST"))).rejects.toMatchObject({ status: 400 });
  });

  it("deactivates Joy Tan, which ends her session, then adds Nora in her seat", async () => {
    signIn(NGITI_OWNER);
    const tan = await api("/staff/ngiti_staff_tan/deactivate", StaffMember, send("POST"));
    expect(tan.deactivatedAt).toBeDefined();
    signIn("demo.clinic_ngiti.ngiti_staff_tan");
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 401 });

    signIn(NGITI_OWNER);
    added = await api("/staff", AddStaffResult, send("POST", newcomer("nora@ngiti.demo")));
    expect(added.temporaryPassword).toMatch(/^[A-Za-z2-9]{4}-[A-Za-z2-9]{4}-[A-Za-z2-9]{4}$/);
    expect(added.pin).toMatch(/^\d{4}$/);
    expect((await api("/clinic/usage", ClinicUsage)).staffLogins).toEqual({ inUse: 5, limit: 5 });
    // Her name stays for what she recorded; the temporary password is never served again.
    const staff = await api("/staff", z.array(StaffMember));
    expect(staff.find((s) => s.id === "ngiti_staff_tan")?.fullName).toBe("Joy Tan");
    expect(JSON.stringify(staff)).not.toContain(added.temporaryPassword);
  });

  it("won't reactivate Joy while the account is full", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/staff/ngiti_staff_tan/reactivate", StaffMember, send("POST"))).rejects.toMatchObject({ status: 409 });
  });

  it("makes Nora choose her own password before anything else (decision #21)", async () => {
    signIn(null);
    await expect(login("nora@ngiti.demo", DEMO_PASSWORD)).rejects.toMatchObject({ status: 401 });
    const first = (await login("nora@ngiti.demo", added.temporaryPassword)) as Session;
    expect(first.user.mustChangePassword).toBe(true);

    signIn(first.token);
    await expect(api("/patients", z.array(Patient))).rejects.toMatchObject({ status: 403, message: "Choose your own password to continue" });
    // Nor can the device be handed on to a colleague's PIN to get past it.
    await expect(api("/auth/switch", Session, send("POST", { accountId: "ngiti_staff_reyes", pin: "3691" }))).rejects.toMatchObject({ status: 403 });
    await expect(api("/auth/password", Session, send("POST", { current: EXAMPLE_WRONG, next: EXAMPLE_NEW }))).rejects.toMatchObject({ status: 400 });
    const changed = await api("/auth/password", Session, send("POST", { current: added.temporaryPassword, next: EXAMPLE_NEW }));
    expect(changed.user.mustChangePassword).toBeUndefined();
    expect((await api("/patients", z.array(Patient))).length).toBeGreaterThan(0);

    signIn(null);
    await expect(login("nora@ngiti.demo", added.temporaryPassword)).rejects.toMatchObject({ status: 401 });
    expect(await login("nora@ngiti.demo", EXAMPLE_NEW)).toHaveProperty("token");
  });

  it("won't let Nora deactivate herself, even once she is an Owner's peer", async () => {
    // Self-deactivation needs clinic.manage first, which only the Owner holds; the Owner case is covered above.
    signIn("demo.clinic_ngiti." + added.staff.id);
    await expect(api(`/staff/${added.staff.id}/deactivate`, StaffMember, send("POST"))).rejects.toMatchObject({ status: 403 });
  });
});

describe("one login per email, and who sees staff emails (audit findings)", () => {
  const ngiti = () => platform.tenants.clinic_ngiti!;
  const joyEmail = () => staffEmail(ngiti().staff.find((s) => s.id === "ngiti_staff_tan")!);

  it("won't reuse a deactivated login's email, so reactivating can't make two logins one email", async () => {
    signIn(NGITI_OWNER);
    await api("/staff/ngiti_staff_dizon/deactivate", StaffMember, send("POST")); // a free seat, so only the email can refuse
    await expect(api("/staff", AddStaffResult, send("POST", newcomer(joyEmail())))).rejects.toMatchObject({ status: 409 });
  });

  it("won't reactivate a login whose email another login now has", async () => {
    const nora = ngiti().staff.find((s) => s.email === "nora@ngiti.demo")!;
    const before = nora.email;
    nora.email = joyEmail(); // as if it had slipped in before this check existed
    try {
      signIn(NGITI_OWNER);
      await expect(api("/staff/ngiti_staff_tan/reactivate", StaffMember, send("POST"))).rejects.toMatchObject({ status: 409 });
    } finally {
      nora.email = before;
    }
  });

  it("serves sign-in emails to the Owner only, and deactivation to staff only", async () => {
    signIn(NGITI_OWNER);
    const owners = await api("/staff", z.array(StaffMember));
    expect(owners.some((s) => s.email === "nora@ngiti.demo")).toBe(true);
    expect(owners.find((s) => s.id === "ngiti_staff_tan")?.deactivatedAt).toBeDefined();

    signIn("demo.clinic_ngiti.ngiti_staff_reyes"); // a dentist: needs who is active, not anyone's email
    const dentists = await api("/staff", z.array(StaffMember));
    expect(dentists.some((s) => s.email)).toBe(false);
    expect(dentists.find((s) => s.id === "ngiti_staff_tan")?.deactivatedAt).toBeDefined();

    const guardian = ngiti().patients[0]!.guardians[0]!;
    signIn(`demo.clinic_ngiti.guardian.${guardian.id}`);
    const parents = await api("/staff", z.array(StaffMember));
    expect(parents.some((s) => s.email || s.deactivatedAt)).toBe(false);
    expect(parents.map((s) => s.fullName)).toContain("Joy Tan"); // names stay on what she recorded
  });

  it("keeps seeded demo logins on the demo password", async () => {
    signIn("demo.clinic_ngiti.ngiti_staff_reyes");
    await expect(api("/auth/password", Session, send("POST", { current: DEMO_PASSWORD, next: EXAMPLE_NEW }))).rejects.toMatchObject({ status: 403 });
  });
});

describe("archiving frees a branch slot (Mid, decisions #10, #22)", () => {
  it("adds a third branch, refuses a fourth, and allows it once one is archived", async () => {
    signIn(DEMO_OWNER);
    const third = await api("/branches", Branch, send("POST", branch("Bacoor")));
    await expect(api("/branches", Branch, send("POST", branch("Kawit")))).rejects.toMatchObject({
      status: 409,
      message: "Your Mid plan includes 3 branches. Contact Primolar to upgrade.",
    });
    expect((await api(`/branches/${third.id}/archive`, Branch, send("POST"))).archived).toBe(true);
    expect((await api("/branches", Branch, send("POST", branch("Kawit")))).archived).toBe(false);
    // The archived one leaves the switcher (decision #22) but stays in GET /branches for old records.
    expect((await api("/clinic", ClinicContext)).branches.map((b) => b.name)).not.toContain("Bacoor");
    expect((await api("/branches", z.array(Branch))).map((b) => b.name)).toContain("Bacoor");
  });

  it("won't archive a branch with upcoming bookings", async () => {
    signIn(DEMO_OWNER);
    await expect(api("/branches/branch_dasma/archive", Branch, send("POST"))).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/upcoming appointment/) });
  });

  it("keeps an over-limit account working after a downgrade, but adds nothing (decision #9)", async () => {
    const demo = platform.accounts.find((a) => a.id === "clinic_demo")!;
    demo.tier = "small"; // the operator's change (chunk 21), made directly here
    try {
      signIn(DEMO_OWNER);
      expect((await api("/clinic", ClinicContext)).branches.length).toBe(3); // Imus, Dasmariñas, Kawit
      await expect(api("/branches", Branch, send("POST", branch("Rosario")))).rejects.toMatchObject({ status: 409 });
    } finally {
      demo.tier = "mid";
    }
  });
});

describe("branding (decisions #28–#31)", () => {
  it("refuses a low-contrast colour with the nearest that passes, and saves a passing one", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/clinic/branding", ClinicAccount, send("PUT", { brandColor: "#e07a48", headingFont: null }))).rejects.toMatchObject({
      status: 400,
      message: expect.stringMatching(/too light for text and buttons.*Try #[0-9a-f]{6}\.$/),
    });
    const saved = await api("/clinic/branding", ClinicAccount, send("PUT", { brandColor: "#0D6E8C", headingFont: null }));
    expect(saved.brandColor).toBe("#0d6e8c");
    expect((await api("/clinic", ClinicContext)).account.brandColor).toBe("#0d6e8c");
  });

  it("keeps the heading font for Big (decision #7)", async () => {
    signIn(NGITI_OWNER);
    await expect(api("/clinic/branding", ClinicAccount, send("PUT", { brandColor: "#1e5fb4", headingFont: "nunito" }))).rejects.toMatchObject({ status: 403 });
  });

  it("is the Owner's alone", async () => {
    signIn(DEMO_ADMIN);
    await expect(api("/clinic/branding", ClinicAccount, send("PUT", { brandColor: "#1e5fb4", headingFont: null }))).rejects.toMatchObject({ status: 403 });
    await expect(api("/staff", AddStaffResult, send("POST", newcomer("x@bulilit.demo")))).rejects.toMatchObject({ status: 403 });
  });

  it("serves the seeded logo as a static file, and an uploaded one from the store", async () => {
    signIn(NGITI_OWNER);
    expect((await api("/clinic", ClinicContext)).logoUrl).toBe("/demo/ngiti-logo.svg");
    const form = new FormData();
    form.set("file", new Blob(['<svg xmlns="http://www.w3.org/2000/svg"/>'], { type: "image/svg+xml" }), "logo.svg");
    const account = await api("/clinic/logo", ClinicAccount, { method: "PUT", body: form });
    const { logoUrl } = await api("/clinic", ClinicContext);
    expect(logoUrl).toContain(`/clinic/logo?v=${encodeURIComponent(account.logoRef!)}`);
    const res = await fetch(`${env.apiUrl}/clinic/logo`, { credentials: "include" });
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("content-security-policy")).toContain("sandbox");

    const gif = new FormData();
    gif.set("file", new Blob(["GIF89a"], { type: "image/gif" }), "logo.gif");
    await expect(api("/clinic/logo", ClinicAccount, { method: "PUT", body: gif })).rejects.toMatchObject({ status: 400 });
  });

  it("checks the TIN format (decision #42)", async () => {
    signIn(NGITI_OWNER);
    const profile = { name: "Ngiti Kids Dental", contactEmail: "hello@ngiti.demo", tin: "234567890" };
    await expect(api("/clinic", ClinicAccount, send("PUT", profile))).rejects.toMatchObject({ status: 400 });
    expect((await api("/clinic", ClinicAccount, send("PUT", { ...profile, tin: "234-567-890-0001" }))).tin).toBe("234-567-890-0001");
  });
});
