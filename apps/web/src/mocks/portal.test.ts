import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { setupServer } from "msw/node";
import { z } from "zod";
import { DemoTexts, LoginResult, Message, PasswordLink, Patient, PortalAccess, Session, IDEMPOTENCY_HEADER, type RegisterPatientInput } from "@pedia/shared";
import { DEMO_PASSWORD } from "@pedia/seed";
import { api } from "@/lib/api-client";
import { db } from "./db";
import { handlers } from "./handlers";

// B11: the portal's staff routes, the signed-out link routes and parents' passwords. The cases share one seeded db in order.
const server = setupServer(...handlers);
const FRONT_DESK = "demo.clinic_demo.staff_cruz";
const signIn = (token: string | null) => vi.stubGlobal("document", { cookie: token ? `pd_session=${token}` : "" });
beforeAll(() => {
  signIn(FRONT_DESK);
  server.listen({ onUnhandledFrame: "error" });
});
afterAll(() => {
  server.close();
  vi.unstubAllGlobals();
});
const post = (body: unknown = {}) => ({ method: "POST", body: JSON.stringify(body), headers: { [IDEMPOTENCY_HEADER]: crypto.randomUUID() } });

/** A new child with two guardians: a mother on `phone` (reminders `reminders`) and a father on a landline. */
async function family(name: string, phone: string, reminders = true) {
  const input: RegisterPatientInput = {
    firstName: name, lastName: "Portal", birthDate: "2019-03-14", sex: "female", address: "",
    guardians: [
      { id: `g_m_${name}`, fullName: `Rosa ${name}`, relationship: "Mother", phone, isPrimary: true },
      { id: `g_f_${name}`, fullName: `Jun ${name}`, relationship: "Father", phone: "(046) 471 2580", isPrimary: false },
    ],
    emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
    privacyConsent: { guardianId: `g_m_${name}`, photos: true, reminders, confirmed: true },
  };
  return api("/patients", Patient, post(input));
}
const access = (id: string) => api(`/patients/${id}/portal-access`, z.array(PortalAccess));
const invite = (id: string, g: string) => api(`/patients/${id}/guardians/${g}/portal-invite`, PortalAccess, post());
/** Obviously fake test passwords (8+ characters, the staff rule). */
const pw = (n: number) => `fake-pw-${n}-EXAMPLE`;
const tokenOf = async (name: string) => (await api("/auth/demo-texts", DemoTexts)).texts.find((t) => t.name === name)!.link.split("#t=")[1]!;
const login = (email: string, secret: string) => api("/auth/login", LoginResult, post({ email, password: secret }));
const accept = (token: string, secret: string) => api("/auth/password-link/accept", Session, post({ token, password: secret }));
const reset = (value: string) => api("/auth/password-reset", z.object({}), post({ login: value }));
const sibling = () => db.patients.find((p) => p.id === "patient_sibling")!;

describe("portal invitations (B11)", () => {
  it("shows a new family as not invited, the landline as blocked, and a seeded parent as active (decisions 1, 13, 17)", async () => {
    const kid = await family("Ana", "09170000001");
    const [mother, father] = await access(kid.id);
    expect(mother).toEqual({ guardianId: "g_m_Ana", state: "not_invited" });
    expect(father).toMatchObject({ state: "not_invited", blocked: "Add a mobile number for Jun Ana to invite them" });
    expect((await access(sibling().id))[0]).toMatchObject({ state: "active" });
  });

  it("invites by text even when the family declined reminders, with the link kept out of the log (decisions 3, 20, E4)", async () => {
    const kid = await family("Bo", "09170000002", false);
    const before = Date.now();
    const status = await invite(kid.id, "g_m_Bo");
    expect(status.state).toBe("invited");
    expect(Date.parse(status.inviteExpiresAt!) - before).toBeGreaterThanOrEqual(72 * 3_600_000 - 1000);
    const [text] = await api(`/messages?patientId=${kid.id}`, z.array(Message));
    expect(text).toMatchObject({ kind: "portal_invite", to: "09170000002", status: "queued" });
    expect(text!.body).toContain("[link]");
  });

  it("cancels the older link and text on a resend (decision 5)", async () => {
    const kid = await family("Cy", "09170000003");
    await invite(kid.id, "g_m_Cy");
    await invite(kid.id, "g_m_Cy");
    expect((await api("/auth/demo-texts", DemoTexts)).texts.filter((t) => t.name === "Rosa Cy")).toHaveLength(1);
    expect((await api(`/messages?patientId=${kid.id}`, z.array(Message))).map((m) => m.status).sort()).toEqual(["cancelled", "queued"]);
  });

  it("refuses a second guardian on a number another parent uses, and a parent already active (decision 14)", async () => {
    const one = await family("Di", "09170000004");
    const two = await family("Ed", "0917 000 0004");
    await invite(one.id, "g_m_Di");
    await expect(invite(two.id, "g_m_Ed")).rejects.toMatchObject({ status: 409, message: expect.stringContaining("already signs in to the portal as Rosa Di") });
    expect((await access(two.id))[0]!.blocked).toContain("Rosa Di");
    await expect(invite(sibling().id, sibling().guardians[0]!.id)).rejects.toMatchObject({ status: 409 });
  });

  it("turns access off and can invite again (decision 18)", async () => {
    const kid = await family("Fe", "09170000005");
    await invite(kid.id, "g_m_Fe");
    const off = await api(`/patients/${kid.id}/guardians/g_m_Fe/portal-off`, PortalAccess, post());
    expect(off).toMatchObject({ state: "off" });
    await expect(api(`/patients/${kid.id}/guardians/g_m_Fe/portal-off`, PortalAccess, post())).rejects.toMatchObject({ status: 409 });
    expect((await invite(kid.id, "g_m_Fe")).state).toBe("invited");
  });

  it("stops a link already texted to the old number when staff change the number (decision 15, B11 audit)", async () => {
    const kid = await family("Hu", "09170000007");
    await invite(kid.id, "g_m_Hu");
    expect((await api("/auth/demo-texts", DemoTexts)).texts.some((t) => t.name === "Rosa Hu")).toBe(true);
    await api(`/patients/${kid.id}`, Patient, { ...post({ phone: "09170000008", nickname: "", tags: [], alerts: [] }), method: "PATCH" });
    expect((await api("/auth/demo-texts", DemoTexts)).texts.some((t) => t.name === "Rosa Hu")).toBe(false);
    expect((await access(kid.id))[0]).toMatchObject({ state: "invited" });
  });

  it("is front desk's, the Owner's and admins': a dentist and a parent get 403 (decision 16)", async () => {
    const kid = await family("Gi", "09170000006");
    for (const token of ["demo.clinic_demo.staff_reyes", `demo.clinic_demo.guardian.${sibling().guardians[0]!.id}`]) {
      signIn(token);
      await expect(access(kid.id)).rejects.toMatchObject({ status: 403 });
      await expect(invite(kid.id, "g_m_Gi")).rejects.toMatchObject({ status: 403 });
    }
    signIn(FRONT_DESK);
  });
});

describe("sign-in by mobile or email (decision 4)", () => {
  it("signs a seeded parent in by their number, in any common form, on the demo password (decision 13)", async () => {
    signIn(null);
    const g = sibling().guardians[0]!;
    const r = await login(g.phone.replace(/^0/, "+63 "), DEMO_PASSWORD);
    expect("user" in r && r.user.guardianId).toBe(g.id);
    expect("user" in (await login("parent@gmail.com", DEMO_PASSWORD))).toBe(true);
  });
  it("refuses a wrong password", async () => {
    await expect(login("09999999999", pw(0))).rejects.toMatchObject({ status: 401 });
  });
});

describe("an invited parent's first sign-in (CHUNKS B11 done-when)", () => {
  it("checks the link, sets a password, signs in with the notice step waiting, and the link works once (decisions 5, 22)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Ha", "09170000011");
    await invite(kid.id, "g_m_Ha");
    const token = await tokenOf("Rosa Ha");
    signIn(null);
    expect(await api("/auth/password-link", PasswordLink, post({ token }))).toEqual({ purpose: "invite", name: "Rosa Ha", clinicName: expect.any(String), login: "0917 ••• 0011" });
    expect((await accept(token, pw(1))).user).toMatchObject({ role: "parent", mustAcknowledge: "notice" });
    await expect(accept(token, pw(2))).rejects.toMatchObject({ status: 410 });
    expect("user" in (await login("0917 000 0011", pw(1)))).toBe(true);
    await expect(login("0917 000 0011", DEMO_PASSWORD)).rejects.toMatchObject({ status: 401 });
  });
  it("refuses an expired invite (decision 5)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Io", "09170000012");
    await invite(kid.id, "g_m_Io");
    const token = await tokenOf("Rosa Io");
    db.portalAccounts.find((a) => a.guardianId === "g_m_Io")!.links.at(-1)!.expiresAt = new Date(Date.now() - 1000).toISOString();
    await expect(api("/auth/password-link", PasswordLink, post({ token }))).rejects.toMatchObject({ status: 410 });
  });
  it("gives a parent sharing another login's email a number-only sign-in (decision 14)", async () => {
    signIn(FRONT_DESK);
    const kid = await family("Jo", "09170000013");
    db.patients.find((p) => p.id === kid.id)!.guardians[0]!.email = "parent@gmail.com"; // the seeded sibling family's address
    await invite(kid.id, "g_m_Jo");
    expect((await accept(await tokenOf("Rosa Jo"), pw(3))).user.email).toBe("");
  });
});

describe("forgot password (decisions 6, 19)", () => {
  it("answers 202 for an unknown number and texts a known one; the link resets the password once", async () => {
    signIn(null);
    const before = db.messages.length;
    await reset("09175550000");
    expect(db.messages.length).toBe(before); // nothing to send, and nothing said
    await reset("0917 000 0011"); // Rosa Ha, active since the invite case
    expect(db.messages.at(-1)).toMatchObject({ kind: "password_reset", to: "09170000011", status: "queued" });
    const token = await tokenOf("Rosa Ha");
    expect((await api("/auth/password-link", PasswordLink, post({ token }))).purpose).toBe("reset");
    await accept(token, pw(4));
    expect("user" in (await login("09170000011", pw(4)))).toBe(true);
  });
  it("allows 3 texts per number per hour, for unknown numbers too", async () => {
    for (let i = 0; i < 3; i++) await reset("09175550001");
    await expect(reset("09175550001")).rejects.toMatchObject({ status: 429 });
  });
});

describe("a parent's own password (decision 7)", () => {
  it("keeps a seeded parent on the demo password, and lets a parent with their own change it", async () => {
    signIn(`demo.clinic_demo.guardian.${sibling().guardians[0]!.id}`);
    await expect(api("/auth/password", Session, post({ current: DEMO_PASSWORD, next: pw(5) }))).rejects.toMatchObject({ status: 403 });
    signIn("demo.clinic_demo.guardian.g_m_Ha");
    await api("/auth/password", Session, post({ current: pw(4), next: pw(6) }));
    expect("user" in (await login("09170000011", pw(6)))).toBe(true);
  });
});
