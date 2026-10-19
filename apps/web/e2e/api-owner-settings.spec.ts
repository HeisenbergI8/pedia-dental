import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B3: the Owner's Settings against apps/api (the web in `disabled` since B13c1) (profile, look, logo, usage, branches, staff, reference data);
 * the privacy notice and the subscription stay on MSW. Skipped unless E2E_API=1. Start-up commands: the B3 plan,
 * Step 11.1. Re-runnable against one database: every change carries a run stamp or is undone.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ timeout: 120_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const STAFF_LIMIT = "Your Small plan includes 5 staff logins. Contact Primolar to upgrade.";
const BRANCH_LIMIT = "Your Small plan includes 1 branch. Contact Primolar to upgrade.";
const BULILIT = { name: "Bulilit Smiles Pediatric Dental", contactEmail: "hello@bulilitsmiles.demo", tin: "123-456-789-000", brandColor: "#b0245e" };

async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}

/** Settings on a tab, waiting for the response that tab loads from `path`. The tab lives in the URL (?tab=). */
async function openTab(page: Page, tab: "clinic" | "branches" | "staff" | "plan" | "reference", path: string): Promise<Response> {
  const loaded = page.waitForResponse((r) => new URL(r.url()).pathname === `/api${path}` && r.request().method() === "GET");
  await page.goto(tab === "clinic" ? "/settings" : `/settings?tab=${tab}`);
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({ timeout: 30_000 });
  return loaded;
}

const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();
/**
 * Answered by apps/api, not MSW: Nest stamps every response with `x-request-id`; a mocked one never has it. (MSW passes a
 * request through by fetching it from its worker, so `fromServiceWorker()` is true either way.)
 */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const staffRow = (page: Page, name: string) => page.getByRole("table", { name: "Staff logins" }).getByRole("row").filter({ hasText: name });
const branchRow = (page: Page, name: string) => page.getByRole("table", { name: "Branches" }).getByRole("row").filter({ hasText: name });

test("Settings reads B3's routes and, since B12, the subscription from the API", async ({ page }) => {
  await signInAs(page, USERS.owner);
  expect(await fromApi(await openTab(page, "reference", "/procedures"))).toBe(true);
  await expect(page.getByText("Oral examination").first()).toBeVisible();
  const usage = openTab(page, "plan", "/clinic/usage");
  const subscription = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/clinic/subscription");
  expect([await fromApi(await usage), await fromApi(await subscription)]).toEqual([true, true]);
});

test("Ngiti's Owner at 1 of 1 and 5 of 5: Add is off, and the API refuses on its own", async ({ page }) => {
  await signInAs(page, USERS.ngitiOwner);
  await openTab(page, "staff", "/clinic/usage");
  await expect(page.getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add staff" })).toBeDisabled();
  const staff = await page.request.post("/api/staff", { data: { fullName: "Nora Ramos", email: `nora.${RUN}@ngiti.demo`, role: "front_desk", branchIds: ["branch_ngiti_bacoor"] } });
  expect([staff.status(), await staff.text()]).toEqual([409, STAFF_LIMIT]);
  const branch = await page.request.post("/api/branches", { data: { name: "Kawit", address: "1 Kawit Road, Cavite", phone: "(046) 400 0000", openingHours: { opensAt: 480, closesAt: 1080, closedWeekdays: [0] } } });
  expect([branch.status(), await branch.text()]).toEqual([409, BRANCH_LIMIT]);
});

test("the Owner's clinic details live in MySQL: a fresh browser sees them", async ({ page, browser }) => {
  await signInAs(page, USERS.owner);
  await openTab(page, "clinic", "/clinic");
  const name = `Bulilit Smiles ng Imus (B3 ${RUN})`;
  try {
    await page.getByLabel("Clinic name").fill(name);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(toast(page, "Clinic details saved")).toBeVisible();

    const fresh = await (await browser.newContext()).newPage(); // empty localStorage: MSW's copy is the seed again
    await signInAs(fresh, USERS.owner);
    await openTab(fresh, "clinic", "/clinic");
    await expect(fresh.getByLabel("Clinic name")).toHaveValue(name);
    await fresh.context().close();
  } finally {
    await page.request.put("/api/clinic", { data: { name: BULILIT.name, contactEmail: BULILIT.contactEmail, tin: BULILIT.tin } });
  }
});

test("a too-light colour is refused by the API as well as the form; a passing one and a font are kept", async ({ page }) => {
  await signInAs(page, USERS.owner);
  await openTab(page, "clinic", "/clinic");
  try {
    const refused = await page.request.put("/api/clinic/branding", { data: { brandColor: "#e07a48", headingFont: null } });
    expect(refused.status()).toBe(400);
    expect(await refused.text()).toMatch(/too light for text and buttons.*Try #[0-9a-f]{6}\.$/);

    const colour = page.getByLabel("Brand colour", { exact: true });
    await colour.fill("#e07a48");
    await page.getByRole("button", { name: /^Use #[0-9a-f]{6}$/ }).click();
    const suggested = await colour.inputValue();
    await page.getByRole("combobox", { name: "Heading font" }).click();
    await page.getByRole("option", { name: "Fredoka", exact: true }).click();
    await page.getByRole("button", { name: "Save look" }).click();
    await expect(toast(page, "Your clinic's look is saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Brand colour", { exact: true })).toHaveValue(suggested);
    await expect(page.getByRole("combobox", { name: "Heading font" })).toHaveText("Fredoka");
  } finally {
    await page.request.put("/api/clinic/branding", { data: { brandColor: BULILIT.brandColor, headingFont: null } });
  }
});

test("the Owner uploads a PNG logo the API serves with a sandbox CSP, then removes it", async ({ page }) => {
  await signInAs(page, USERS.owner);
  await openTab(page, "clinic", "/clinic");
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Replace logo|Upload logo/ }).click();
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
  await (await chooser).setFiles({ name: `logo-${RUN}.png`, mimeType: "image/png", buffer: png });
  await expect(toast(page, "Logo updated")).toBeVisible();

  const logo = await page.request.get("/api/clinic/logo");
  expect([logo.status(), logo.headers()["content-type"]]).toEqual([200, "image/png"]);
  expect(logo.headers()["content-security-policy"]).toContain("sandbox");

  await page.getByRole("button", { name: "Remove logo" }).click();
  await expect(toast(page, "Logo removed")).toBeVisible();
  await page.reload();
  await expect(page.getByText("No logo yet: your clinic's name shows instead.")).toBeVisible();
  expect((await page.request.get("/api/clinic/logo")).status()).toBe(404);
});

test("the Owner adds a branch, sees 3 of 3, and archives it to free the slot", async ({ page }) => {
  await signInAs(page, USERS.owner);
  await openTab(page, "branches", "/branches");
  await expect(page.getByText(/^2 of 3 open branches/)).toBeVisible();
  const name = `Bacoor ${RUN}`;
  await page.getByRole("button", { name: "Add branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a branch" });
  await dialog.getByLabel("Branch name").fill(name);
  await dialog.getByLabel("Address").fill("88 Molino Road, Bacoor, Cavite");
  await dialog.getByLabel("Phone").fill("(046) 434 9900");
  await dialog.getByRole("button", { name: "Add branch" }).click();
  await expect(toast(page, `${name} added`)).toBeVisible();
  await expect(page.getByText(/^3 of 3 open branches/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add branch" })).toBeDisabled();

  await branchRow(page, name).getByRole("button", { name: "Archive" }).click();
  await page.getByRole("dialog", { name: `Archive ${name}?` }).getByRole("button", { name: `Archive ${name}` }).click();
  await expect(toast(page, `${name} archived`)).toBeVisible();
  await page.reload();
  await expect(branchRow(page, name)).toContainText("Archived");
  await expect(page.getByText(/^2 of 3 open branches/)).toBeVisible();
});

test("the Owner adds a staff login whose password works only on the API, then deactivates it", async ({ page, playwright, baseURL }) => {
  await signInAs(page, USERS.owner);
  await openTab(page, "staff", "/clinic/usage");
  const fullName = `Jose Mercado ${RUN}`;
  const email = `jose.${RUN}@bulilitsmiles.ph`;
  await page.getByRole("button", { name: "Add staff" }).click();
  const form = page.getByRole("dialog", { name: "Add a staff login" });
  await form.getByLabel("Full name").fill(fullName);
  await form.getByLabel("Email").fill(email);
  await form.getByRole("checkbox", { name: "Imus" }).check();
  await form.getByRole("button", { name: "Add staff" }).click();
  const done = page.getByRole("dialog", { name: `${fullName} is added` });
  await expect(done.getByText("It is shown only once.")).toBeVisible();
  const password = (await done.locator("dt", { hasText: /^Temporary password$/ }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
  await done.getByRole("button", { name: "I've passed it on" }).click();
  await expect(staffRow(page, fullName)).toContainText("Active");

  // The new login exists only in MySQL: it signs in on the API and must choose its own password first (decision #21).
  // Its MSW screens would answer 401 in hybrid (CONVENTIONS), so this stays at the API.
  const api = await playwright.request.newContext({ baseURL });
  const first = await api.post("/api/auth/login", { data: { email, password } });
  expect(first.status()).toBe(200);
  expect((await first.json()).user.mustChangePassword).toBe(true);
  await api.dispose();

  await staffRow(page, fullName).getByRole("button", { name: "Deactivate" }).click();
  await page.getByRole("dialog", { name: `Deactivate ${fullName}?` }).getByRole("button", { name: `Deactivate ${fullName}` }).click();
  await expect(toast(page, `${fullName} is deactivated`)).toBeVisible();
  await page.reload();
  await expect(staffRow(page, fullName)).toContainText("Deactivated");
});
