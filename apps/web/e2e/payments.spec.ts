import { expect, test, type Page } from "@playwright/test";
import { USERS, signIn, signInOperator } from "./support/users";

/*
 * B12: paying Primolar by QR (decisions 5–8, 21–25). The operator adds the QR, clinics and sign-ups pay and send a
 * receipt, the operator confirms or rejects it in Payments to check. UI only, on MSW.
 */
test.describe.configure({ timeout: 180_000 });
const SLOW = { timeout: 30_000 };

// A 1x1 PNG, as a screenshot the person picks from their phone.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });
const HAGIKGIK = { name: "Hagikgik Kids Dental", reference: "PRM-HGK2-7QXM" };
const IPIN_RECEIPT = "GC 5012 3344 7781"; // seeded, waiting in Payments to check

const nav = (page: Page) => page.getByRole("navigation", { name: "Console" });
const paymentsLink = (page: Page) => nav(page).getByRole("link", { name: /^Payments to check/ });

async function openConsole(page: Page) {
  await signInOperator(page);
  await expect(page.getByRole("heading", { name: "Clinic accounts", level: 1 })).toBeVisible(SLOW);
}

async function addQr(page: Page) {
  await nav(page).getByRole("link", { name: "Price list" }).click();
  const card = page.getByRole("form", { name: "Payment QR" });
  await card.getByLabel("QR image").setInputFiles(png("qr.png"));
  await card.getByLabel(/Text under the QR/).fill("GCash: Primolar Inc. 0917 000 0000");
  await card.getByRole("button", { name: "Save payment QR" }).click();
  await expect(page.getByText("Payment QR saved")).toBeVisible();
  await expect(page.getByRole("img", { name: "Primolar's payment QR code" })).toBeVisible();
}

async function signOutOperator(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/operator\/login/);
}

/** The Manila date `days` from now, for the demo clock (mocks/clock.ts). */
const manilaDay = (days: number) => new Date(Date.now() + days * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

test("operator adds the QR, then confirms Ipin's receipt from Payments to check, and the badge clears", async ({ page }) => {
  await openConsole(page);
  await expect(paymentsLink(page)).toHaveText(/Payments to check\s*1 waiting/);
  await addQr(page);

  await paymentsLink(page).click();
  await expect(page.getByRole("heading", { name: "Payments to check", level: 1 })).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: IPIN_RECEIPT });
  await expect(row.getByRole("link", { name: "Ipin Kids Dental", exact: true })).toBeVisible();
  await expect(row.getByRole("img", { name: `Receipt ${IPIN_RECEIPT} from Ipin Kids Dental` })).toBeVisible();
  await row.getByRole("button", { name: "Confirm" }).click();
  const dialog = page.getByRole("dialog", { name: "Confirm Ipin Kids Dental's payment" });
  await expect(dialog.getByText(/Confirm only if the receipt shows the full ₱/)).toBeVisible();
  await dialog.getByRole("button", { name: /^Confirm ₱/ }).click();
  await expect(page.getByText("Payment from Ipin Kids Dental confirmed")).toBeVisible();
  await expect(page.getByText("No payments to check")).toBeVisible();
  await expect(paymentsLink(page)).toHaveText("Payments to check");

  await nav(page).getByRole("link", { name: "Clinic accounts" }).click();
  await page.getByRole("link", { name: "Ipin Kids Dental", exact: true }).click();
  await expect(page.getByText(`ref ${IPIN_RECEIPT}`)).toBeVisible(SLOW);
  await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
});

test("a rejected receipt shows the Owner the reason, and they send a new one from Settings → Plan", async ({ page }) => {
  await openConsole(page);
  await addQr(page);
  await paymentsLink(page).click();
  await page.getByRole("listitem").filter({ hasText: IPIN_RECEIPT }).getByRole("button", { name: "Reject" }).click();
  const dialog = page.getByRole("dialog", { name: `Reject receipt ${IPIN_RECEIPT}?` });
  await dialog.getByLabel("Reason for the clinic").fill("The amount is ₱100 short");
  await dialog.getByRole("button", { name: "Reject receipt" }).click();
  await expect(page.getByText("No payments to check")).toBeVisible();
  await signOutOperator(page);

  await signIn(page, USERS.ipinOwner);
  await page.getByRole("link", { name: "Settings" }).first().click(SLOW);
  await page.getByRole("tab", { name: "Plan" }).click();
  const panel = page.getByRole("tabpanel", { name: "Plan" });
  await expect(panel.getByRole("alert").filter({ hasText: "Not accepted: The amount is ₱100 short. Send a new receipt." })).toBeVisible(SLOW);
  await expect(panel.getByRole("img", { name: "Primolar's payment QR code" })).toBeVisible();
  const form = panel.getByRole("form", { name: "Send your receipt" });
  await form.getByRole("button", { name: "Send receipt" }).click();
  await expect(form.getByText("Attach a screenshot of your receipt")).toBeVisible();
  await expect(form.getByText("Enter the reference number on your receipt")).toBeVisible();
  await form.getByLabel("Receipt screenshot").setInputFiles(png("receipt.png"));
  await form.getByLabel("Reference number").fill("GC 9999 0000 1111");
  await form.getByRole("button", { name: "Send receipt" }).click();
  await expect(panel.getByText(/Primolar is checking your receipt \(ref GC 9999 0000 1111\)/)).toBeVisible();
  await expect(panel.getByRole("form", { name: "Send your receipt" })).toHaveCount(0);
});

test("a sign-up pays by QR from its status page, and the operator sees the receipt waiting", async ({ page }) => {
  await page.goto(`/get-started/${HAGIKGIK.reference}`);
  await expect(page.getByText("Primolar will send you payment details.")).toBeVisible(SLOW);
  await expect(page.getByRole("form", { name: "Send your receipt" })).toHaveCount(0);

  await openConsole(page);
  await addQr(page);
  await signOutOperator(page);

  await page.goto(`/get-started/${HAGIKGIK.reference}`);
  await expect(page.getByRole("img", { name: "Primolar's payment QR code" })).toBeVisible(SLOW);
  await expect(page.getByText("GCash: Primolar Inc. 0917 000 0000")).toBeVisible();
  const form = page.getByRole("form", { name: "Send your receipt" });
  await form.getByLabel("Receipt screenshot").setInputFiles(png("receipt.png"));
  await form.getByLabel("Reference number").fill("BPI-7781");
  await form.getByRole("button", { name: "Send receipt" }).click();
  await expect(page.getByText(/Primolar is checking your receipt \(ref BPI-7781\)/)).toBeVisible();

  await openConsole(page);
  await expect(paymentsLink(page)).toHaveText(/2 waiting/);
  await nav(page).getByRole("link", { name: "Sign-ups" }).click();
  await page.getByRole("link", { name: HAGIKGIK.name }).click();
  await expect(page.getByText(/A payment receipt is waiting \(ref BPI-7781\)/)).toBeVisible(SLOW);
});

test("Bulilit's Owner sees storage and this month's texts on the plan", async ({ page }) => {
  await signIn(page, USERS.owner);
  await page.getByRole("link", { name: "Settings" }).first().click(SLOW);
  await page.getByRole("tab", { name: "Plan" }).click();
  const panel = page.getByRole("tabpanel", { name: "Plan" });
  await expect(panel.getByText("Storage", { exact: true })).toBeVisible(SLOW);
  await expect(panel.getByText(/ of 10 GB$/)).toBeVisible();
  await expect(panel.getByText(/^Texts in \w+$/)).toBeVisible();
  await expect(panel.getByText(/ of 1000$/)).toBeVisible();
});

test("the Owner of a clinic paused for non-payment signs in to pay, and only that (decision 25)", async ({ page }) => {
  // Ten days on, Ipin (3 days overdue in the seed) is past its 7 days of grace and paused.
  await page.addInitScript((day) => window.localStorage.setItem("pedia-dental:demo-today", day), manilaDay(10));
  await signIn(page, USERS.ipinOwner);
  await expect(page.getByRole("heading", { name: "Your clinic is paused", level: 1 })).toBeVisible(SLOW);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await expect(page.getByText(/Primolar is checking your receipt \(ref GC 5012 3344 7781\)/)).toBeVisible();

  await page.goto("/patients");
  await expect(page.getByRole("heading", { name: "Your clinic is paused", level: 1 })).toBeVisible(SLOW);
});
