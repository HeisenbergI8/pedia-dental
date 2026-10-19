import { expect as baseExpect, devices, test, type Locator, type Page, type Response } from "@playwright/test";
import { addDays, format, isSunday } from "date-fns";
import { USERS, signIn, signInOperator } from "./support/users";

/**
 * B13c1: DEMO_SCRIPT.md, end to end, with mocks off. B13's "Done when" runs this against the deployed demo
 * (E2E_BASE_URL=https://<demo web>), right after a reset. Locally, on a fresh database:
 *   CREATE DATABASE pedia_dental_e2e_demo; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4160 DEMO_LOGINS=true COOKIE_SECURE=false STORAGE_DIR=… STORAGE_LINK_SECRET=… pnpm dev:api
 *   NEXT_DIST_DIR=.next-demo NEXT_PUBLIC_API_MOCKING=disabled API_PROXY_TARGET=http://localhost:4160 pnpm exec next dev --port 3200
 * 13 sign-ins: within the API's 20 per 5 minutes. Not re-runnable without a reset (it records consent, a sign-up
 * and payments), which matches how the demo is used: `pnpm --filter api db:demo-reset` first.
 * Each test is one section of DEMO_SCRIPT.md; its locators are the pilot specs' for the same screen.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a disabled web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36).toUpperCase();
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const IMUS_ADDRESS = "12 Nueno Avenue, Imus, Cavite";
const NOTICE_HEADING = "Bulilit Smiles Pediatric Dental's privacy notice";
const STAFF_LIMIT = "Your Small plan includes 5 staff logins. Contact Primolar to upgrade.";
const OVERDUE = /Your Primolar payment is overdue\. Pay by \d{1,2} \w+ \d{4} to keep your clinic running\./;
const BULILIT_COLOUR = "#b0245e";
/** A day well ahead and never a Sunday, so the booking and its clash meet nothing the seed booked. */
const DAY = (() => {
  let d = addDays(new Date(), 60);
  while (isSunday(d)) d = addDays(d, 1);
  return format(d, "yyyy-MM-dd");
})();

/** Answered by apps/api: Nest stamps `x-request-id`. With mocks off nothing else could answer, and this proves it. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
/** Waits for the request `act` causes, then proves the API answered it with `status`. */
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);
const accountMenu = (page: Page) => page.getByRole("button", { name: /Account menu/ }).first();

/** Signs in through the form; the sign-in itself is the API's. The dentist picks Bulilit on the chooser. */
async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await viaApi(page, /^\/api\/auth\/login$/, "POST", 200, () => signIn(page, email));
  if (email === USERS.dentist) {
    await page.getByRole("region", { name: "Which clinic?" }).getByRole("button", { name: "Bulilit Smiles Pediatric Dental" }).click();
  }
  if (email !== USERS.parent) await expect(accountMenu(page)).toBeVisible({ timeout: 45_000 });
}
async function openConsole(page: Page) {
  await page.context().clearCookies();
  const accounts = loads(page, /^\/api\/operator\/accounts$/);
  await signInOperator(page);
  await expect(page.getByRole("heading", { name: "Clinic accounts", level: 1 })).toBeVisible({ timeout: 45_000 });
  expect(await fromApi(await accounts)).toBe(true);
}
const accountsTable = (page: Page) => page.getByRole("table", { name: "Clinic accounts" });
const rowOf = (page: Page, clinic: string) => accountsTable(page).getByRole("row").filter({ has: page.getByRole("link", { name: clinic, exact: true }) });
async function openClinic(page: Page, clinic: string) {
  await accountsTable(page).getByRole("link", { name: clinic, exact: true }).click();
  await expect(page.getByRole("heading", { name: clinic, level: 1 })).toBeVisible();
}
/** Opens the patient through the "Find a patient" search, the way staff jump to a child. */
async function findPatient(page: Page, query: string, linkName: RegExp) {
  await page.getByRole("button", { name: /Find a patient/ }).click();
  const dialog = page.getByRole("dialog", { name: "Find a patient" });
  await dialog.getByLabel("Search patients").fill(query);
  await dialog.getByRole("list", { name: "Matching patients" }).getByRole("link", { name: linkName }).first().click();
  await expect(dialog).toBeHidden();
}
async function choose(page: Page, combobox: string | RegExp, option: string | RegExp, scope: Locator = page.locator("body")) {
  await scope.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).click();
}
const tooth = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Tooth ${n}:`) });

// ---------- 0. The sign-in page ----------

test("0 · the sign-in page lists the demo logins from the API, with no service worker", async ({ page }) => {
  const demo = loads(page, /^\/api\/auth\/demo-accounts$/);
  await page.goto("/login");
  const res = await demo;
  expect([res.status(), await fromApi(res)]).toEqual([200, true]);
  const logins = page.getByRole("region", { name: "Demo logins" });
  await expect(logins).toBeVisible({ timeout: 30_000 });
  await expect(logins.getByText(USERS.owner, { exact: true })).toBeVisible();
  // Mocks off: no MSW worker controls the page, and none is registered.
  expect(await page.evaluate(() => navigator.serviceWorker.controller)).toBeNull();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});

// ---------- 1. The front desk's morning ----------

test("1 · the front desk's morning: Today, a booking, a refused double-booking, a payment and its Imus receipt", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  await viaApi(page, /^\/api\/reports\/today$/, "GET", 200, () => page.goto("/dashboard"));
  await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Liza/ })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Today at a glance" }).getByRole("link", { name: /waiting/ })).toBeVisible();

  const book = async (query: string, option: RegExp, dentist: string) => {
    await page.getByRole("button", { name: "New appointment" }).click();
    const dialog = page.getByRole("dialog", { name: "New appointment" });
    await dialog.getByRole("combobox", { name: "Patient" }).fill(query);
    await page.getByRole("option", { name: option }).first().click();
    await dialog.getByRole("radiogroup", { name: "What for" }).getByRole("radio", { name: "Oral examination" }).click();
    await dialog.getByRole("radiogroup", { name: "Dentist" }).getByRole("radio", { name: dentist }).click();
    const custom = dialog.getByRole("button", { name: "Pick another date or time" });
    if (await custom.isVisible()) await custom.click();
    await dialog.getByLabel("Date", { exact: true }).fill(DAY);
    await dialog.getByLabel("Start", { exact: true }).fill("17:00");
    await dialog.getByRole("combobox", { name: "Chair" }).click();
    await page.getByRole("option", { name: "Chair 3", exact: true }).click();
    return dialog;
  };
  await page.goto(`/appointments?date=${DAY}`);
  let dialog = await book("Gerlach", /Gerlach, Savanna/, "Dr. Miguel Santos");
  await viaApi(page, /^\/api\/appointments$/, "POST", 201, () => dialog.getByRole("button", { name: /^Book / }).click());
  await expect(toast(page, "Appointment booked")).toBeVisible();
  await expect(dialog).toBeHidden();
  dialog = await book("Langworth", /Langworth, Calista/, "Dr. Ana Reyes");
  await viaApi(page, /^\/api\/appointments$/, "POST", 409, () => dialog.getByRole("button", { name: /^Book / }).click());
  await expect(toast(page, "Chair 3 is already booked at 5:00 PM")).toBeVisible();
  await expect(dialog).toBeVisible(); // the form stays open to fix it
  await page.keyboard.press("Escape");

  await findPatient(page, "Balistreri", /Balistreri, Damien/);
  await viaApi(page, /^\/api\/patients\/[^/]+\/invoices$/, "GET", 200, () => page.getByRole("tab", { name: "Billing" }).click());
  const statement = page.getByRole("tabpanel");
  await statement.getByRole("button", { name: "Record payment" }).first().click();
  const pay = page.getByRole("dialog", { name: "Record a payment" });
  await pay.getByLabel("Amount received (₱)").fill("100");
  const paid = await viaApi(page, /^\/api\/invoices\/[^/]+\/payments$/, "POST", 201, () => pay.getByRole("button", { name: "Record payment" }).click());
  const receiptNo = ((await paid.json()) as { receiptNo: string }).receiptNo;
  await expect(toast(page, `Payment recorded · receipt ${receiptNo}`)).toBeVisible();
  await statement.getByRole("link", { name: `Receipt ${receiptNo}` }).click();
  await expect(page).toHaveURL(/\/receipts\//, { timeout: 30_000 });
  await expect(page.getByText(IMUS_ADDRESS)).toBeVisible();
  await expect(page.getByText("₱100.00").first()).toBeVisible();
});

// ---------- 2. The dentist in the chair ----------

test("2 · the dentist picks Bulilit, sees the allergy banner, records caries on 74-O and signs a note", async ({ page }) => {
  await signInAs(page, USERS.dentist);
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Patients" }).click();
  await page.getByRole("searchbox", { name: "Search patients" }).fill("Avery Toy");
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await viaApi(page, /^\/api\/patients\/[^/]+$/, "GET", 200, () => page.getByRole("link", { name: "Toy, Avery" }).click());
  await expect(page.getByRole("heading", { name: "Avery Toy", level: 1 })).toBeVisible();
  for (const tab of ["Overview", "Chart", "Notes"]) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("region", { name: "Medical alerts" }).getByText("Allergy: Penicillin")).toBeVisible();
  }

  await page.getByRole("tab", { name: "Chart" }).click();
  await viaApi(page, /^\/api\/patients\/[^/]+\/visits$/, "POST", 201, () => page.getByRole("button", { name: "Start visit as Ana Reyes" }).click());
  await expect(page.getByText("Visit in progress")).toBeVisible();
  await tooth(page, 74).focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: /^Tooth 74 ·/ });
  await expect(panel.getByRole("combobox", { name: "Condition" })).toHaveText(/Caries/);
  await panel.getByRole("checkbox", { name: "Occlusal (O)" }).check();
  await viaApi(page, /^\/api\/patients\/[^/]+\/chart$/, "POST", 201, () => panel.getByRole("button", { name: "Save finding" }).click());
  await expect(panel.getByText("Caries · O")).toBeVisible(); // the tooth's history
  await page.keyboard.press("Escape");
  await expect(tooth(page, 74)).toHaveAccessibleName("Tooth 74: O caries");

  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await choose(page, "Template", "Follow-up visit", dialog);
  await choose(page, "Healing", "Satisfactory", dialog);
  await viaApi(page, /^\/api\/patients\/[^/]+\/notes$/, "POST", 201, () => dialog.getByRole("button", { name: "Save draft" }).click());
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "Edit or sign" }).click();
  const edit = page.getByRole("dialog", { name: /^Edit Follow-up visit/ });
  const signed = loads(page, /^\/api\/notes\/[^/]+\/sign$/, "POST");
  await viaApi(page, /^\/api\/notes\/[^/]+$/, "PUT", 200, () => edit.getByRole("button", { name: "Save and sign" }).click());
  const sign = await signed;
  expect([sign.status(), await fromApi(sign)]).toEqual([200, true]);
  const note = page.getByRole("article").filter({ hasText: "Follow-up visit" });
  await expect(note.getByText("Signed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit or sign" })).toHaveCount(0); // read-only once signed
  const noteId = ((await sign.json()) as { id: string }).id;
  expect((await page.request.put(`/api/notes/${noteId}`, { data: { values: { healing: "Delayed" }, behavior: [] } })).status()).toBe(409);
  await viaApi(page, /^\/api\/visits\/[^/]+\/complete$/, "POST", 200, () => page.getByRole("button", { name: "Finish visit" }).click());
});

// ---------- 3. The parent at home, on a phone ----------

test("3 · the parent, on a phone: the privacy notice first, two children, a confirmed visit, and the consent switches", async ({ browser }) => {
  const context = await browser.newContext({ ...devices["Pixel 7"], baseURL: test.info().project.use.baseURL, timezoneId: "Asia/Manila", locale: "en-PH" });
  const page = await context.newPage();
  await signInAs(page, USERS.parent);
  await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Your consents on record" })).toBeVisible();
  await viaApi(page, /^\/api\/auth\/acknowledgement$/, "POST", 200, () => page.getByRole("button", { name: "I've read this" }).click());
  await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Powered by Primolar")).toBeVisible();

  const children = page.getByRole("group", { name: "Whose records to show" });
  await expect(children.getByRole("button")).toHaveText(["Mazie", "Mika"]);
  await children.getByRole("button", { name: "Mika" }).click();
  await expect(children.getByRole("button", { name: "Mika" })).toHaveAttribute("aria-pressed", "true");
  const nextVisit = page.locator("section").filter({ has: page.getByRole("heading", { name: "Next visit" }) });
  await viaApi(page, /^\/api\/appointments\/[^/]+\/status$/, "POST", 200, () => nextVisit.getByRole("button", { name: "Confirm visit" }).click());
  await expect(nextVisit.getByText("Confirmed")).toBeVisible();

  const reminders = page.getByRole("checkbox", { name: "Reminder messages allowed" });
  await expect(reminders).toBeChecked();
  await viaApi(page, /^\/api\/patients\/[^/]+\/privacy-choices$/, "POST", 200, () => reminders.click());
  await expect(reminders).not.toBeChecked();
  await viaApi(page, /^\/api\/patients\/[^/]+\/privacy-choices$/, "POST", 200, () => reminders.click());
  await expect(reminders).toBeChecked();
  await context.close();
});

// ---------- 4. The Owner runs the clinic ----------

test("4 · the Owner shows all branches, is refused #e07a48 and offered #b04f18, and reads 2 of 3 branches", async ({ page }) => {
  await signInAs(page, USERS.owner);
  await page.goto("/dashboard");
  const showing = page.getByRole("combobox", { name: "Showing" }).first();
  await showing.click();
  await viaApi(page, /^\/api\/reports\/today$/, "GET", 200, () => page.getByRole("option", { name: "All branches" }).click());
  await expect(showing).toHaveText("All branches");

  await viaApi(page, /^\/api\/clinic$/, "GET", 200, () => page.goto("/settings"));
  try {
    const colour = page.getByLabel("Brand colour", { exact: true });
    await colour.fill("#e07a48");
    await expect(page.getByRole("alert").filter({ hasText: "too light for text and buttons" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save look" })).toBeDisabled();
    await page.getByRole("button", { name: "Use #b04f18" }).click();
    await expect(colour).toHaveValue("#b04f18");
    await viaApi(page, /^\/api\/clinic\/branding$/, "PUT", 200, () => page.getByRole("button", { name: "Save look" }).click());
    await expect(page.getByText("Your clinic's look is saved").first()).toBeVisible();
  } finally {
    await page.request.put("/api/clinic/branding", { data: { brandColor: BULILIT_COLOUR, headingFont: null } }); // the seed's look, for the rest of the run
  }

  await viaApi(page, /^\/api\/clinic\/usage$/, "GET", 200, () => page.goto("/settings?tab=plan"));
  const plan = page.getByRole("tabpanel", { name: "Plan" });
  await expect(plan.getByText("You're on the Mid plan")).toBeVisible();
  await expect(plan.getByText("2 of 3")).toBeVisible();
  await expect(plan.getByText("5 of 20")).toBeVisible();
});

// ---------- 5. A small clinic at its limit ----------

test("5 · Ngiti at 5 of 5: Add staff is off, with the Small plan's sentence", async ({ page }) => {
  await signInAs(page, USERS.ngitiOwner);
  await viaApi(page, /^\/api\/clinic\/usage$/, "GET", 200, () => page.goto("/settings?tab=staff"));
  const card = page.getByRole("tabpanel", { name: "Staff" });
  await expect(card.getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
  const add = card.getByRole("button", { name: "Add staff" });
  await expect(add).toBeDisabled();
  await expect(card.getByRole("status")).toHaveText(STAFF_LIMIT);
  await expect(add).toHaveAccessibleDescription(STAFF_LIMIT);
});

// ---------- 6. Primolar's console ----------

test("6 · the console lists every clinic with its counts, and pauses and reactivates Ipin", async ({ page }) => {
  await openConsole(page);
  const table = accountsTable(page);
  for (const header of ["Clinic", "Status", "Plan", "Owner", "Branches", "Staff logins", "Patients"]) {
    await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
  }
  const bulilit = rowOf(page, "Bulilit Smiles Pediatric Dental");
  await expect(bulilit).toContainText("Mid");
  await expect(bulilit).toContainText(/\d+ of 3/);
  await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("5 of 5");
  await expect(rowOf(page, "Ipin Kids Dental")).toContainText("Dr. Lara Santiago");

  await openClinic(page, "Ipin Kids Dental");
  await page.getByRole("button", { name: "Pause account" }).click();
  const confirm = page.getByRole("dialog", { name: "Pause Ipin Kids Dental?" });
  await expect(confirm).toContainText("Parents keep read-only access");
  await viaApi(page, /^\/api\/operator\/accounts\/[^/]+\/suspend$/, "POST", 200, () => confirm.getByRole("button", { name: "Pause Ipin Kids Dental" }).click());
  await expect(page.getByText("Ipin Kids Dental is paused")).toBeVisible();
  await viaApi(page, /^\/api\/operator\/accounts\/[^/]+\/reactivate$/, "POST", 200, () => page.getByRole("button", { name: "Reactivate account" }).click());
  await expect(page.getByText("Ipin Kids Dental is active again")).toBeVisible();
});

// ---------- 7. A new clinic joins ----------

test("7 · a new clinic signs up (refused without the box, PRM- with it, a duplicate refused), is approved, and its Owner signs in", async ({ page }) => {
  const c = { name: `Ngiping Demo ${RUN} Dental`, contactEmail: `hello.${RUN.toLowerCase()}@masaya.ph`, owner: "Dr. Ma. Niña O'Brien", ownerEmail: `nina.${RUN.toLowerCase()}@masaya.ph` };
  const field = (label: string) => page.locator("main form").first().getByLabel(label, { exact: true });
  const terms = page.getByRole("checkbox", { name: /I'm authorised to act for this clinic/ });
  const send = page.getByRole("button", { name: /^(Send sign-up|Sending)$/ });
  const openForm = async (name: string, email: string, ownerEmail: string) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Get started with Primolar" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
    await expect(send).toBeVisible(); // the prices have loaded, so the form is on screen
    await field("Clinic name").fill(name);
    await field("Contact email").fill(email);
    await field("TIN").fill("123456789");
    await field("Branch name").fill("Las Piñas");
    await field("Address").fill("12 Alabang–Zapote Road, Las Piñas");
    await field("Phone").fill("0917 123 4567");
    await field("Full name").fill(c.owner);
    await field("Email").fill(ownerEmail);
  };
  await page.context().clearCookies();
  await openForm(c.name, c.contactEmail, c.ownerEmail);
  const sent: string[] = [];
  page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/signups" && sent.push(r.url()));
  await expect(terms).not.toBeChecked();
  await send.click();
  await expect(page.getByText("Tick the box to accept the Terms of Service and the Data Processing Agreement")).toBeVisible();
  await expect(page).toHaveURL(/\/get-started$/);
  expect(sent).toEqual([]); // refused before anything reaches the API
  await terms.check();
  await viaApi(page, /^\/api\/signups$/, "POST", 201, () => send.click());
  await expect(page).toHaveURL(/\/get-started\/PRM-[A-Z0-9]{4}-[A-Z0-9]{4}$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: `Thank you. ${c.name} is signed up` })).toBeVisible();
  await expect(page.getByText(/^Your reference:/)).toContainText(/PRM-[A-Z0-9]{4}-[A-Z0-9]{4}/);

  await openForm(`  ${c.name.toLowerCase().replace(/ /g, "   ")} `, `again.${RUN.toLowerCase()}@masaya.ph`, `again.${RUN.toLowerCase()}@masaya.ph`);
  await terms.check();
  await viaApi(page, /^\/api\/signups$/, "POST", 409, () => send.click());
  await expect(field("Clinic name")).toHaveAttribute("aria-invalid", "true");
  await expect(field("Clinic name")).toHaveAccessibleDescription(/already on Primolar or waiting to join/);
  await expect(page).toHaveURL(/\/get-started$/);

  await openConsole(page);
  await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Sign-ups" }).click();
  await page.getByRole("link", { name: c.name, exact: true }).click();
  await expect(page.getByRole("heading", { name: c.name, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  await viaApi(page, /^\/api\/operator\/signups\/[^/]+\/payment$/, "POST", 200, () =>
    page.getByRole("dialog", { name: "Record payment" }).getByRole("button", { name: "Record payment" }).click());
  await expect(page.getByText("Payment recorded")).toBeVisible();
  await viaApi(page, /^\/api\/operator\/signups\/[^/]+\/approve$/, "POST", 201, () => page.getByRole("button", { name: "Approve and create clinic" }).click());
  const created = page.getByRole("dialog", { name: `${c.name} is on Primolar` });
  await expect(created.getByText(c.ownerEmail)).toBeVisible();
  const password = (await created.locator("dt:has-text('Temporary password') + dd").innerText()).trim();
  expect(password.length).toBeGreaterThan(5);
  await created.getByRole("button", { name: "I've passed it on" }).click();

  // The temporary password signs in; the Owner chooses their own and passes the first-sign-in notices.
  await page.context().clearCookies();
  await viaApi(page, /^\/api\/auth\/login$/, "POST", 200, () => signIn(page, c.ownerEmail, password));
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Temporary password").fill(password);
  await page.getByLabel("New password").fill(`EXAMPLE-${RUN}-1`);
  await viaApi(page, /^\/api\/auth\/password$/, "POST", 200, () => page.getByRole("button", { name: "Save and continue" }).click());
  for (let i = 0; i < 5; i++) {
    const ack = page.getByRole("main").getByRole("button", { name: /^(I understand|Continue|Accept|I agree|Got it|I've read this)/ });
    const shell = page.getByRole("button", { name: /Account menu$/ }).first();
    await expect(ack.or(shell).first()).toBeVisible({ timeout: 30_000 });
    if (await shell.isVisible()) break;
    const box = page.getByRole("main").getByRole("checkbox").first();
    if (await box.isVisible().catch(() => false)) await box.check();
    await ack.first().click({ timeout: 5_000 }).catch(() => undefined);
  }
  await expect(accountMenu(page)).toBeVisible();
  await expect(page.getByText(c.name, { exact: true }).first()).toBeVisible(); // the default look: the name where a logo goes
});

// ---------- 8. Monthly billing ----------

test("8 · Ipin's Owner sees the overdue banner, the admin sees no billing, and the console records the month", async ({ page }) => {
  await signInAs(page, USERS.ipinOwner);
  await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
  await viaApi(page, /^\/api\/clinic\/subscription$/, "GET", 200, () => page.goto("/settings?tab=plan"));
  const panel = page.getByRole("tabpanel", { name: "Plan" });
  await expect(panel.getByText("Overdue, in grace")).toBeVisible();
  await expect(panel.getByText(/₱[\d,]+\.\d\d \(includes ₱[\d,]+\.\d\d VAT\)/).first()).toBeVisible();
  await expect(panel.getByRole("table", { name: "Payments to Primolar" })).toBeVisible();

  await signInAs(page, USERS.admin);
  await viaApi(page, /^\/api\/clinic$/, "GET", 200, () => page.goto("/settings"));
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
  await expect(page.getByText(/Primolar payment/)).toHaveCount(0);
  await expect(page.getByText(/Payments to Primolar|PRM-INV-/)).toHaveCount(0);

  await openConsole(page);
  await openClinic(page, "Ipin Kids Dental");
  await expect(page.getByText("Overdue, in grace").first()).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  const dialog = page.getByRole("dialog", { name: "Record payment" });
  await dialog.getByLabel("Reference (optional)").fill(`GC-${RUN}`);
  await viaApi(page, /^\/api\/operator\/accounts\/[^/]+\/subscription\/payments$/, "POST", 201, () => dialog.getByRole("button", { name: "Record payment" }).click());
  await expect(page.getByText("Payment recorded for Ipin Kids Dental")).toBeVisible();
  await expect(page.getByText("Paid up").first()).toBeVisible();
});

// ---------- 9. Children's records and the Data Privacy Act ----------

test("9 · privacy: registration asks for consent, Calista has none recorded, and Coby's photo is refused while an X-ray uploads and opens", async ({ page, context }) => {
  await signInAs(page, USERS.frontdesk);
  await page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name: "Patients", exact: true }).click();
  await page.getByRole("link", { name: "New patient" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New patient" })).toBeVisible();
  const child = `Dpa${RUN}`;
  await page.getByLabel("First name").fill(child);
  await page.getByLabel("Last name").fill("Dela Cruz");
  await page.getByLabel("Date of birth").fill("2019-03-02");
  await page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: "Male", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Relationship" }).getByRole("radio", { name: "Mother" }).click();
  await page.getByLabel("Full name").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Maria Dela Cruz");
  await page.getByLabel("Mobile number").fill(`917${String(Date.now() % 10_000_000).padStart(7, "0")}`);
  await page.getByRole("radiogroup", { name: "Allergies" }).getByRole("radio", { name: "None known" }).click();
  await page.getByRole("radiogroup", { name: "Conditions or medications" }).getByRole("radio", { name: "None known" }).click();
  await page.locator("form").getByRole("button", { name: "Save patient", exact: true }).click();
  const consent = page.getByRole("dialog", { name: "Parent's consent" });
  await expect(consent).toBeVisible(); // nothing is saved before the consent step
  await expect(consent.getByRole("checkbox", { name: /Clinical photos/ })).not.toBeChecked();
  await expect(consent.getByRole("checkbox", { name: /Reminder messages/ })).not.toBeChecked();
  await expect(consent.getByRole("combobox", { name: "Who consented" })).toContainText("Maria Dela Cruz (Mother)");
  await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
  await viaApi(page, /^\/api\/patients$/, "POST", 201, () => consent.getByRole("button", { name: "Save patient" }).click());
  await expect(page.getByRole("heading", { level: 1, name: `${child} Dela Cruz` })).toBeVisible();

  await findPatient(page, "Calista", /Langworth, Calista/);
  await expect(page.getByText(/Consent not recorded/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Record privacy consent" })).toBeVisible();

  await signInAs(page, USERS.owner);
  await findPatient(page, "Coby", /Medhurst, Coby/);
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "GET", 200, () => page.getByRole("tab", { name: "Photos" }).click());
  await page.getByRole("button", { name: "Add photo" }).click();
  const dialog = page.getByRole("dialog", { name: "Add photo" });
  const chooser = page.waitForEvent("filechooser");
  await dialog.getByRole("button", { name: "Choose file" }).click();
  await (await chooser).setFiles({ name: "xray.png", mimeType: "image/png", buffer: PNG });
  await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "POST", 409, () => dialog.getByRole("button", { name: "Save photo" }).click());
  await expect(toast(page, /family declined clinical photos/)).toBeVisible();
  await expect(dialog).toBeVisible();
  await choose(page, "Type", "X-ray", dialog);
  const saved = await viaApi(page, /^\/api\/patients\/[^/]+\/photos$/, "POST", 201, () => dialog.getByRole("button", { name: "Save photo" }).click());
  await expect(toast(page, "Photo saved")).toBeVisible();
  const photoId = ((await saved.json()) as { id: string }).id;

  // It opens: on the page, and in its own tab through the API's 302 to a short-lived link (the storage driver's).
  const img = page.locator(`img[src$="/photos/${photoId}/file"]`).first();
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1);
  const [tab] = await Promise.all([context.waitForEvent("page"), page.locator("a").filter({ has: img }).click()]);
  await tab.waitForLoadState();
  // The 302's link: the local-disk driver's /api/files/<token> through Next's proxy, or on the deployed demo (S3) a
  // presigned link to the bucket. Either way a short-lived, signed link, not the API's own route.
  const opened = new URL(tab.url());
  if (opened.hostname.endsWith(".amazonaws.com")) expect(opened.searchParams.get("X-Amz-Signature")).toBeTruthy();
  else expect(opened.pathname).toMatch(/^\/api\/files\/[\w-]+$/);
  expect(await tab.evaluate(() => document.contentType)).toMatch(/^image\/(png|jpeg)$/); // the dialog may re-encode it
  await tab.close();
});
