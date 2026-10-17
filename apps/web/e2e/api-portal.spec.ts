import { expect as baseExpect, test, type Browser, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B11: parent portal accounts against apps/api in `hybrid`. Skipped unless E2E_API=1. Start-up (B11 plan Step 9.2), fresh database:
 *   CREATE DATABASE pedia_dental_e2e_b11; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4150 DEMO_LOGINS=true COOKIE_SECURE=false WEB_URL=http://localhost:3190 pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=hybrid API_PROXY_TARGET=http://localhost:4150 pnpm exec next dev --port 3190
 * The API's worker sends the texts (log driver); DEMO_LOGINS lets /auth/demo-texts show their links. Re-runnable on one
 * database: each run registers its own child on its own number. 5 sign-ins a run.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a hybrid web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const CHILD = `Portal${RUN}`;
const MOTHER = `Rosa ${CHILD}`;
const MOBILE = `0917${String(Date.now()).slice(-7)}`; // this run's own number: one number, one sign-in (decision 14)
/** Obviously fake test passwords (8+ characters, the staff rule). */
const [FIRST, SECOND] = [`EXAMPLE-${RUN}-1`, `EXAMPLE-${RUN}-2`];
const NOTICE_HEADING = "Bulilit Smiles Pediatric Dental's privacy notice";
let childId = "";

/** Answered by apps/api: Nest stamps `x-request-id`. MSW's passthrough also reports fromServiceWorker(), so not that. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}
/** The newest link the demo "texted" this run's mother, once the API's worker has sent it. */
async function textedLink(page: Page, purpose: "invite" | "reset", after = new Set<string>()) {
  let link = "";
  await expect
    .poll(async () => {
      const { texts } = (await (await page.request.get("/api/auth/demo-texts")).json()) as { texts: { name: string; purpose: string; link: string }[] };
      link = texts.find((t) => t.name === MOTHER && t.purpose === purpose && !after.has(t.link))?.link ?? "";
      return link;
    }, { timeout: 30_000 })
    .not.toBe("");
  return link;
}
/** The parent's own browser: a second context, with the project's address and clock zone. */
const parentPage = async (browser: Browser) =>
  (await browser.newContext({ baseURL: test.info().project.use.baseURL, timezoneId: "Asia/Manila", locale: "en-PH" })).newPage();

test("front desk invites a guardian from the child's Overview, and the status shows it (decisions 2, 17)", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const guardian = { id: `g_${CHILD}`, fullName: MOTHER, relationship: "Mother", phone: MOBILE, isPrimary: true };
  const res = await page.request.post("/api/patients", {
    data: {
      firstName: CHILD, lastName: "Family", birthDate: "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" }, privacyConsent: { guardianId: guardian.id, photos: true, reminders: false, confirmed: true },
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  childId = ((await res.json()) as { id: string }).id;

  await viaApi(page, /^\/api\/patients\/[^/]+\/portal-access$/, "GET", 200, () => page.goto(`/patients/${childId}`));
  await expect(page.getByText("Portal: not invited")).toBeVisible();
  await viaApi(page, /\/portal-invite$/, "POST", 200, () => page.getByRole("button", { name: "Invite to portal" }).click());
  await expect(page.getByText(`Invite sent to ${MOBILE.slice(0, 4)} ••• ${MOBILE.slice(-4)}`)).toBeVisible();
  await expect(page.getByText(/^Portal: invited on /)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resend invite" })).toBeVisible();
});

test("the invited parent opens the texted link, sets a password, reads the notice and sees only their child (CHUNKS B11 done-when)", async ({ page, browser }) => {
  await signInAs(page, USERS.frontdesk);
  const link = await textedLink(page, "invite");
  const parent = await parentPage(browser);
  await viaApi(parent, /^\/api\/auth\/password-link$/, "POST", 200, () => parent.goto(link));
  await expect(parent.getByRole("heading", { name: "Welcome, Rosa" })).toBeVisible();
  expect(new URL(parent.url()).hash).toBe(""); // the token is dropped from the address bar once read
  await parent.getByLabel("New password").fill(FIRST);
  await viaApi(parent, /^\/api\/auth\/password-link\/accept$/, "POST", 200, () => parent.getByRole("button", { name: "Save and sign in" }).click());
  await expect(parent.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible({ timeout: 30_000 });
  await parent.getByRole("button", { name: "I've read this" }).click();
  await expect(parent.getByRole("heading", { name: "Hello, Rosa" })).toBeVisible({ timeout: 30_000 });
  await expect(parent.getByText(CHILD).first()).toBeVisible();

  // Another family's child, straight at the API: 403 from apps/api.
  const seeded = (await (await page.request.get("/api/patients")).json()) as { id: string }[];
  const other = await parent.request.get(`/api/patients/${seeded.find((p) => p.id !== childId)!.id}`);
  expect([other.status(), !!other.headers()["x-request-id"], await other.text()]).toEqual([403, true, "This isn't one of your children's records"]);
  // The link worked once.
  expect((await parent.request.post("/api/auth/password-link", { data: { token: link.split("#t=")[1] } })).status()).toBe(410);
  await parent.context().close();
});

test("the parent signs in with their mobile number, forgets the password and resets it by text (decisions 4, 6)", async ({ page, browser }) => {
  const parent = await parentPage(browser);
  await parent.goto("/login");
  const form = parent.getByRole("region", { name: "Sign in" });
  await form.getByLabel("Mobile number or email").fill(MOBILE.replace(/^0/, "+63 "));
  await form.getByLabel("Password", { exact: true }).fill(FIRST);
  await viaApi(parent, /^\/api\/auth\/login$/, "POST", 200, () => form.getByRole("button", { name: "Sign in" }).click());
  await expect(parent.getByRole("heading", { name: "Hello, Rosa" })).toBeVisible({ timeout: 30_000 });
  await parent.context().clearCookies();

  await parent.goto("/forgot-password");
  await parent.getByLabel("Mobile number or email").fill(MOBILE);
  await viaApi(parent, /^\/api\/auth\/password-reset$/, "POST", 202, () => parent.getByRole("button", { name: "Text me a link" }).click());
  await expect(parent.getByText("If that number has a portal account, we've texted a link. It works for 30 minutes.")).toBeVisible();

  await signInAs(page, USERS.frontdesk);
  await parent.goto(await textedLink(page, "reset"));
  await expect(parent.getByRole("heading", { name: "Choose a new password" })).toBeVisible();
  await parent.getByLabel("New password").fill(SECOND);
  await viaApi(parent, /^\/api\/auth\/password-link\/accept$/, "POST", 200, () => parent.getByRole("button", { name: "Save and sign in" }).click());
  await expect(parent.getByRole("heading", { name: "Hello, Rosa" })).toBeVisible({ timeout: 30_000 });
  await parent.context().close();
});

test("front desk turns the parent's access off: their next request is signed out (decision 18)", async ({ page, browser }) => {
  const parent = await parentPage(browser);
  const signedIn = await parent.request.post("/api/auth/login", { data: { email: MOBILE, password: SECOND } });
  expect(signedIn.status()).toBe(200);
  expect((await parent.request.get("/api/auth/me")).status()).toBe(200);

  await signInAs(page, USERS.frontdesk);
  await viaApi(page, /^\/api\/patients\/[^/]+\/portal-access$/, "GET", 200, () => page.goto(`/patients/${childId}`));
  await page.getByRole("button", { name: "Turn off access" }).click();
  const dialog = page.getByRole("dialog", { name: `Turn off ${MOTHER}'s portal access?` });
  await viaApi(page, /\/portal-off$/, "POST", 200, () => dialog.getByRole("button", { name: "Turn off access" }).click());
  await expect(page.getByText(/^Portal: turned off on /)).toBeVisible();
  expect((await parent.request.get("/api/auth/me")).status()).toBe(401);
  await parent.context().close();
});
