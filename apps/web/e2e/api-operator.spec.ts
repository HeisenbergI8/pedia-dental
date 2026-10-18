import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn, signInOperator } from "./support/users";

/**
 * B12: Primolar's console, sign-ups, the payment QR and receipts against apps/api in `hybrid`. Skipped unless E2E_API=1.
 * Start-up (B12 plan Step 9.2), on a fresh database with B12's rows:
 *   CREATE DATABASE pedia_dental_e2e_b12; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4150 DEMO_LOGINS=true COOKIE_SECURE=false STORAGE_DIR=… STORAGE_LINK_SECRET=… WEB_URL=http://localhost:3190 pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=hybrid API_PROXY_TARGET=http://localhost:4150 pnpm exec next dev --port 3190
 * Re-runnable on one database: each run signs up its own clinic name. Clear `RateLimitCounter` between specs (sign-ups
 * are 5 an hour per address; sign-ins 20 in 5 minutes). No test moves the clock.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a hybrid web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36).toUpperCase();
const CLINIC = { name: `Ngiting API ${RUN} Dental`, contactEmail: `hello.${RUN.toLowerCase()}@api.demo`, owner: `Dr. Api ${RUN}`, ownerEmail: `owner.${RUN.toLowerCase()}@api.demo` };
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
let reference = "";
let temporaryPassword = "";

/** Answered by apps/api: Nest stamps `x-request-id`. MSW's passthrough also reports fromServiceWorker(), so not that. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") => page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
const nav = (page: Page) => page.getByRole("navigation", { name: "Console" });
async function openConsole(page: Page) {
  await page.context().clearCookies();
  await signInOperator(page);
  await expect(page.getByRole("heading", { name: "Clinic accounts", level: 1 })).toBeVisible({ timeout: 45_000 });
}

test("the operator uploads Primolar's payment QR with its caption", async ({ page }) => {
  await openConsole(page);
  await nav(page).getByRole("link", { name: "Price list" }).click();
  const card = page.getByRole("form", { name: "Payment QR" });
  await card.getByLabel(/QR image|Replace QR/).setInputFiles(png("qr.png"));
  await card.getByLabel(/Text under the QR/).fill(`GCash: Primolar Inc. (run ${RUN})`);
  await viaApi(page, /^\/api\/operator\/payment-qr$/, "PUT", 200, () => card.getByRole("button", { name: "Save payment QR" }).click());
  await expect(page.getByRole("img", { name: "Primolar's payment QR code" })).toBeVisible();
});

test("a clinic signs up, sees the QR and its amount, and sends a receipt (decisions 5, 7)", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/get-started");
  await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
  const form = page.locator("main form").first();
  const fill = (label: string, value: string) => form.getByLabel(label, { exact: true }).fill(value);
  await fill("Clinic name", CLINIC.name);
  await fill("Contact email", CLINIC.contactEmail);
  await fill("TIN", "123456789");
  await fill("Branch name", "Las Piñas");
  await fill("Address", "12 Alabang–Zapote Road, Las Piñas");
  await fill("Phone", "0917 123 4567");
  await fill("Full name", CLINIC.owner);
  await fill("Email", CLINIC.ownerEmail);
  await page.getByRole("checkbox", { name: /I'm authorised to act for this clinic/ }).check();
  await viaApi(page, /^\/api\/signups$/, "POST", 201, () => page.getByRole("button", { name: "Send sign-up" }).click());
  await expect(page).toHaveURL(/\/get-started\/PRM-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  reference = new URL(page.url()).pathname.split("/").pop()!;

  await expect(page.getByRole("img", { name: "Primolar's payment QR code" })).toBeVisible();
  await expect(page.getByText(`GCash: Primolar Inc. (run ${RUN})`)).toBeVisible();
  const receipt = page.getByRole("form", { name: "Send your receipt" });
  await receipt.getByLabel("Receipt screenshot").setInputFiles(png("receipt.png"));
  await receipt.getByLabel("Reference number").fill(`GC-${RUN}`);
  await viaApi(page, /\/receipts$/, "POST", 201, () => receipt.getByRole("button", { name: "Send receipt" }).click());
  await expect(page.getByText(new RegExp(`Primolar is checking your receipt \\(ref GC-${RUN}\\)`))).toBeVisible();
});

test("the operator confirms the receipt from Payments to check, approves, and reads the Owner's password", async ({ page }) => {
  await openConsole(page);
  await nav(page).getByRole("link", { name: /^Payments to check/ }).click(); // the menu's count already loaded the list
  const row = page.getByRole("listitem").filter({ hasText: `GC-${RUN}` });
  await expect(row.getByText(`sign-up ${reference}`)).toBeVisible();
  await row.getByRole("button", { name: "Confirm" }).click();
  const dialog = page.getByRole("dialog", { name: `Confirm ${CLINIC.name}'s payment` });
  await viaApi(page, /\/confirm$/, "POST", 200, () => dialog.getByRole("button", { name: /^Confirm ₱/ }).click());

  await nav(page).getByRole("link", { name: "Sign-ups" }).click();
  await page.getByRole("link", { name: CLINIC.name, exact: true }).click();
  await expect(page.getByRole("heading", { name: CLINIC.name })).toBeVisible();
  await viaApi(page, /\/approve$/, "POST", 201, () => page.getByRole("button", { name: "Approve and create clinic" }).click());
  const created = page.getByRole("dialog", { name: `${CLINIC.name} is on Primolar` });
  temporaryPassword = (await created.locator("dt:has-text('Temporary password') + dd").innerText()).trim();
  expect(temporaryPassword.length).toBeGreaterThan(5);
  await created.getByRole("button", { name: "I've passed it on" }).click();
});

test("the new Owner signs in, chooses a password, and sees Storage and Texts on Settings → Plan", async ({ page }) => {
  await page.context().clearCookies();
  await signIn(page, CLINIC.ownerEmail, temporaryPassword);
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Temporary password").fill(temporaryPassword);
  await page.getByLabel("New password").fill(`EXAMPLE-${RUN}-1`);
  await page.getByRole("button", { name: "Save and continue" }).click();
  for (let i = 0; i < 5; i++) {
    const ack = page.getByRole("main").getByRole("button", { name: /^(I understand|Continue|Accept|I agree|Got it|I've read this)/ });
    const shell = page.getByRole("button", { name: /Account menu$/ }).first();
    await expect(ack.or(shell).first()).toBeVisible({ timeout: 30_000 });
    if (await shell.isVisible()) break;
    await ack.first().click({ timeout: 5_000 }).catch(() => undefined);
  }
  await viaApi(page, /^\/api\/clinic\/usage$/, "GET", 200, () => page.goto("/settings?tab=plan"));
  const panel = page.getByRole("tabpanel", { name: "Plan" });
  await expect(panel.getByText("Storage", { exact: true })).toBeVisible();
  await expect(panel.getByText(/^Texts in \w+$/)).toBeVisible();
  await expect(panel.getByText(/ of 2 GB$/)).toBeVisible();
});

test("Ngiti's Owner sends a receipt, the operator rejects it, the Owner reads why and sends another, which is confirmed (decision 21)", async ({ page, browser }) => {
  const owner = await browser.newPage({ baseURL: test.info().project.use.baseURL, timezoneId: "Asia/Manila", locale: "en-PH" });
  await signIn(owner, USERS.ngitiOwner);
  await expect(owner.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
  await viaApi(owner, /^\/api\/clinic\/subscription$/, "GET", 200, () => owner.goto("/settings?tab=plan"));
  const panel = owner.getByRole("tabpanel", { name: "Plan" });
  const send = async (ref: string) => {
    const form = panel.getByRole("form", { name: "Send your receipt" });
    await form.getByLabel("Receipt screenshot").setInputFiles(png("receipt.png"));
    await form.getByLabel("Reference number").fill(ref);
    await viaApi(owner, /^\/api\/clinic\/subscription\/receipts$/, "POST", 201, () => form.getByRole("button", { name: "Send receipt" }).click());
    await expect(panel.getByText(new RegExp(`Primolar is checking your receipt \\(ref ${ref}\\)`))).toBeVisible();
  };
  await send(`NG-${RUN}-1`);

  await openConsole(page);
  await nav(page).getByRole("link", { name: /^Payments to check/ }).click();
  await page.getByRole("listitem").filter({ hasText: `NG-${RUN}-1` }).getByRole("button", { name: "Reject" }).click();
  const reject = page.getByRole("dialog", { name: `Reject receipt NG-${RUN}-1?` });
  await reject.getByLabel("Reason for the clinic").fill("The screenshot doesn't show the amount");
  await viaApi(page, /\/reject$/, "POST", 200, () => reject.getByRole("button", { name: "Reject receipt" }).click());

  await owner.reload();
  await expect(panel.getByRole("alert").filter({ hasText: "Not accepted: The screenshot doesn't show the amount. Send a new receipt." })).toBeVisible();
  await send(`NG-${RUN}-2`);

  await page.reload();
  await page.getByRole("listitem").filter({ hasText: `NG-${RUN}-2` }).getByRole("button", { name: "Confirm" }).click();
  await viaApi(page, /\/confirm$/, "POST", 200, () => page.getByRole("dialog").getByRole("button", { name: /^Confirm ₱/ }).click());
  await owner.reload();
  await expect(panel.getByText(`ref NG-${RUN}-2`)).toBeVisible();
  await expect(panel.getByText("Confirmed", { exact: true }).first()).toBeVisible();
  await owner.close();
});
