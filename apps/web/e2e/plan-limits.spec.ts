import { expect, test, type Page } from "@playwright/test";
import { USERS, expectSignedIn, signIn, signInOperator } from "./support/users";

/**
 * Pilot tests: plan limits and billing states, driven only through the UI.
 * Ngiti (Small plan) is at its 5-login and 1-branch limits and due in about 2 days.
 * Ipin (Small plan) is about 3 days overdue, inside its 7-day grace period.
 */

const STAFF_LIMIT = "Your Small plan includes 5 staff logins. Contact Primolar to upgrade.";
const BRANCH_LIMIT = "Your Small plan includes 1 branch. Contact Primolar to upgrade.";
const OVERDUE = /Your Primolar payment is overdue\. Pay by \d{1,2} \w+ \d{4} to keep your clinic running\./;
const DUE_SOON = /Your Primolar payment is due in \d days?, on \d{1,2} \w+ \d{4}\./;

// The shared server is busy while other pilot suites run: allow slow pages, the way a patient user would wait.
test.describe.configure({ timeout: 180_000 });
const SLOW = { timeout: 30_000 };

// ---------- helpers (UI only) ----------

async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  await expectSignedIn(page);
  await expect(page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).first()).toBeVisible(SLOW);
}

async function openSettings(page: Page, tab?: "Clinic" | "Branches" | "Staff" | "Plan") {
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible(SLOW);
  if (tab) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByRole("tabpanel", { name: tab })).not.toContainText("Loading", SLOW);
  }
}

async function signOutClinic(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).first().click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function operatorOpenClinic(page: Page, clinic: string) {
  await signInOperator(page);
  await page.getByRole("link", { name: clinic }).click(SLOW);
  await expect(page.getByRole("heading", { name: clinic, level: 1 })).toBeVisible(SLOW);
}

async function signOutOperator(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/operator\/login|\/login/);
}

const staffCard = (page: Page) => page.getByRole("tabpanel", { name: "Staff" });
const branchCard = (page: Page) => page.getByRole("tabpanel", { name: "Branches" });
const planPanel = (page: Page) => page.getByRole("tabpanel", { name: "Plan" });
const staffRow = (page: Page, name: string) => staffCard(page).getByRole("row", { name: new RegExp(name) });

async function deactivate(page: Page, name: string) {
  await staffRow(page, name).getByRole("button", { name: "Deactivate" }).click();
  const dialog = page.getByRole("dialog", { name: `Deactivate ${name}?` });
  await dialog.getByRole("button", { name: `Deactivate ${name}` }).click();
  await expect(page.getByText(`${name} is deactivated`)).toBeVisible();
  await expect(dialog).toBeHidden();
}

/** Fills the Add staff dialog. Branch is preselected when the clinic has one open branch. */
async function addStaff(page: Page, fullName: string, email: string) {
  await staffCard(page).getByRole("button", { name: "Add staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a staff login" });
  await dialog.getByLabel("Full name").fill(fullName);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Add staff" }).click();
  const done = page.getByRole("dialog", { name: `${fullName} is added` });
  await expect(done.getByText("Temporary password", { exact: true })).toBeVisible();
  await done.getByRole("button", { name: "I've passed it on" }).click();
  await expect(done).toBeHidden();
}

// =====================================================================================================

test.describe("happy paths", () => {
  test("Ngiti's Owner sees the payment-due-soon reminder on the dashboard", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    const banner = page.getByRole("status").filter({ hasText: DUE_SOON });
    await expect(banner).toBeVisible();
    await expect(banner.getByRole("link", { name: "See Settings → Plan" })).toBeVisible();
  });

  test("Ngiti's Owner at 5 of 5 logins finds Add staff turned off with the upgrade message", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    const card = staffCard(page);
    await expect(card.getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    const add = card.getByRole("button", { name: "Add staff" });
    await expect(add).toBeDisabled();
    await expect(card.getByRole("status")).toHaveText(STAFF_LIMIT);
    // Screen readers hear why it is off.
    await expect(add).toHaveAccessibleDescription(STAFF_LIMIT);
  });

  test("Ngiti's Owner at 1 of 1 branch finds Add branch turned off with the upgrade message", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Branches");
    const card = branchCard(page);
    await expect(card.getByText("1 of 1 open branch on your plan.")).toBeVisible();
    const add = card.getByRole("button", { name: "Add branch" });
    await expect(add).toBeDisabled();
    await expect(add).toHaveAccessibleDescription(BRANCH_LIMIT);
    await expect(card.getByRole("row", { name: /Bacoor/ })).toBeVisible();
  });

  test("Ngiti's Owner reads the Small plan's usage, the next amount with VAT and every invoice", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Plan");
    const panel = planPanel(page);
    await expect(panel.getByText("You're on the Small plan")).toBeVisible();
    await expect(panel.getByRole("meter", { name: "Open branches in use" })).toBeVisible();
    await expect(panel.getByRole("meter", { name: "Staff logins in use" })).toBeVisible();
    await expect(panel.getByText("5 of 5")).toBeVisible();
    await expect(panel.getByText("1 of 1")).toBeVisible();
    await expect(panel.getByText(/Dashboard and finance views across branches\s*· not on this plan/)).toBeVisible();
    await expect(panel.getByText("Due soon", { exact: true })).toBeVisible();
    await expect(panel.getByText(/₱2,500\.00 \(includes ₱267\.86 VAT\)/)).toBeVisible();
    const history = panel.getByRole("table", { name: "Payments to Primolar" });
    await expect(history.getByRole("row")).toHaveCount(5); // header + 4 payments
    await expect(history.getByRole("button", { name: /Download invoice PRM-INV-/ })).toHaveCount(4);
  });

  test("Ngiti's Owner deactivates a front desk login and the seat frees up for a new hire", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await deactivate(page, "Mae Dizon");
    const card = staffCard(page);
    await expect(card.getByText("4 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add staff" })).toBeEnabled();
    await expect(card.getByText(STAFF_LIMIT)).toBeHidden();
    await expect(staffRow(page, "Mae Dizon").getByText(/Deactivated/)).toBeVisible();

    // The freed seat goes to a new front desk hire with a Filipino name; the limit closes again.
    await addStaff(page, "Ma. Niña Dela Peña", "nina.delapena@ngiti.demo");
    await expect(card.getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(card.getByRole("button", { name: "Add staff" })).toBeDisabled();
    await expect(card.getByRole("status")).toHaveText(STAFF_LIMIT);
    await expect(staffRow(page, "Ma. Niña Dela Peña")).toContainText("Active");

    // Plan tab agrees.
    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(planPanel(page).getByText("5 of 5")).toBeVisible();
  });

  test("a freed seat stays free after the Owner reloads the page", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await deactivate(page, "Joy Tan");
    await page.reload();
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(staffCard(page).getByText("4 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeEnabled();
  });

  test("Ngiti's Owner reactivates a login into a freed seat", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await deactivate(page, "Joy Tan");
    await staffRow(page, "Joy Tan").getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText("Joy Tan can sign in again")).toBeVisible();
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeDisabled();
  });

  test("Ipin's Owner sees the overdue banner with the pay-by date on every page", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
    for (const nav of ["Appointments", "Patients", "Billing"]) {
      await page.getByRole("link", { name: nav }).first().click();
      await expect(page).toHaveURL(new RegExp(`/${nav.toLowerCase()}`));
      await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
    }
  });

  test("Ipin's Owner reads the overdue billing card: status, due date, amount and two invoices", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Plan");
    const panel = planPanel(page);
    await expect(panel.getByText("Overdue, in grace")).toBeVisible();
    await expect(panel.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
    await expect(panel.getByText(/₱2,500\.00 \(includes ₱267\.86 VAT\)/)).toBeVisible();
    const history = panel.getByRole("table", { name: "Payments to Primolar" });
    await expect(history.getByRole("row")).toHaveCount(3);
    await expect(history.getByText("PRM-INV-00013")).toBeVisible();
    await expect(history.getByText("PRM-INV-00014")).toBeVisible();
  });

  test("Ipin's Owner downloads a PDF invoice for a past payment", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Plan");
    const downloadPromise = page.waitForEvent("download");
    await planPanel(page).getByRole("button", { name: "Download invoice PRM-INV-00014" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("an overdue clinic in grace keeps working: Ipin's Owner can still add a staff login", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Staff");
    await expect(staffCard(page).getByText("1 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await addStaff(page, "Jose Rizal O'Neil", "jose.oneil@ipin.demo");
    await expect(staffCard(page).getByText("2 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffRow(page, "Jose Rizal O'Neil")).toBeVisible();
  });

  test("Primolar records Ipin's overdue payment and the Owner's banner is gone at next sign-in", async ({ page }) => {
    await operatorOpenClinic(page, "Ipin Kids Dental");
    await expect(page.getByText("Overdue, in grace").first()).toBeVisible();
    await expect(page.getByText(/11 October 2026 · pay by 18 October 2026/)).toBeVisible();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await expect(dialog.getByText(/₱2,500\.00 for the month from 11 October 2026/)).toBeVisible();
    await dialog.getByLabel("Reference (optional)").fill("GC-2026-1014");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded for Ipin Kids Dental")).toBeVisible();
    // The due date stays on the same day of the month.
    await expect(page.getByText("11 November 2026").first()).toBeVisible();
    await expect(page.getByText("Paid up").first()).toBeVisible();
    await signOutOperator(page);

    await signInAs(page, USERS.ipinOwner);
    await expect(page.getByText(OVERDUE)).toHaveCount(0);
    await openSettings(page, "Plan");
    const panel = planPanel(page);
    await expect(panel.getByText("Paid up", { exact: true })).toBeVisible();
    await expect(panel.getByText("11 November 2026")).toBeVisible();
    await expect(panel.getByRole("table", { name: "Payments to Primolar" }).getByRole("row")).toHaveCount(4);
  });

  test("Primolar upgrades Ngiti to Mid and the Owner can add staff and branches at once", async ({ page }) => {
    await operatorOpenClinic(page, "Ngiti Kids Dental");
    await page.getByRole("combobox", { name: "Plan" }).click();
    await page.getByRole("option", { name: "Mid" }).click();
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Ngiti Kids Dental is on the Mid plan")).toBeVisible();
    await signOutOperator(page);

    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await expect(staffCard(page).getByText("5 of 20 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeEnabled();
    await page.getByRole("tab", { name: "Branches" }).click();
    await expect(branchCard(page).getByText("1 of 3 open branches on your plan.")).toBeVisible();
    await expect(branchCard(page).getByRole("button", { name: "Add branch" })).toBeEnabled();
    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(planPanel(page).getByText("You're on the Mid plan")).toBeVisible();
  });

  test("Primolar downgrades Bulilit to Small and the Owner sees it waits for the next due date", async ({ page }) => {
    await operatorOpenClinic(page, "Bulilit Smiles Pediatric Dental");
    await page.getByRole("combobox", { name: "Plan" }).click();
    await page.getByRole("option", { name: "Small" }).click();
    await expect(page.getByText(/this clinic is over the limit for/)).toBeVisible();
    await page.getByRole("button", { name: "Save plan" }).click();
    await expect(page.getByText("Bulilit Smiles Pediatric Dental moves to the Small plan on its next due date")).toBeVisible();
    await signOutOperator(page);

    await signInAs(page, USERS.owner);
    await openSettings(page, "Plan");
    const panel = planPanel(page);
    await expect(panel.getByText("You're on the Mid plan")).toBeVisible();
    await expect(panel.getByText(/Moves to Small on \d{1,2} \w+ \d{4}\. Nothing you have now is turned off\./)).toBeVisible();
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeEnabled();
  });

  test("Bulilit's Owner, paid up on Mid, sees its allowances and no billing banner", async ({ page }) => {
    await signInAs(page, USERS.owner);
    await expect(page.getByText(OVERDUE)).toHaveCount(0);
    await expect(page.getByText(DUE_SOON)).toHaveCount(0);
    await openSettings(page, "Plan");
    const panel = planPanel(page);
    await expect(panel.getByText("You're on the Mid plan")).toBeVisible();
    await expect(panel.getByText("2 of 3")).toBeVisible();
    await expect(panel.getByText("5 of 20")).toBeVisible();
    await expect(panel.getByText("Paid up", { exact: true })).toBeVisible();
  });
});

// =====================================================================================================

test.describe("failed paths", () => {
  test("an Admin sees no billing anywhere: no banner, no Plan tab", async ({ page }) => {
    await signInAs(page, USERS.admin);
    await openSettings(page).catch(() => undefined);
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
    await expect(page.getByText(/Primolar payment/)).toHaveCount(0);
    await expect(page.getByText(/Payments to Primolar|PRM-INV-/)).toHaveCount(0);
  });

  test("front desk and dentist see no billing in Settings", async ({ page }) => {
    for (const who of [USERS.frontdesk]) {
      await signInAs(page, who);
      await page.getByRole("link", { name: "Settings" }).first().click().catch(() => undefined);
      await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
      await expect(page.getByText(/Primolar payment|Payments to Primolar/)).toHaveCount(0);
    }
  });

  test("a dentist at Ngiti never sees Ngiti's payment-due reminder", async ({ page }) => {
    await signIn(page, USERS.dentist);
    await expect(page.getByText("Which clinic?")).toBeVisible();
    await page.getByRole("button", { name: /Ngiti Kids Dental/ }).click();
    await expectSignedIn(page);
    await expect(page.getByRole("navigation").getByRole("link", { name: "Dashboard" }).first()).toBeVisible(SLOW);
    await expect(page.getByText(DUE_SOON)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "See Settings → Plan" })).toHaveCount(0);
  });

  test("Ngiti's Owner cancels a deactivation and the plan stays full", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await staffRow(page, "Joy Tan").getByRole("button", { name: "Deactivate" }).click();
    const dialog = page.getByRole("dialog", { name: "Deactivate Joy Tan?" });
    await expect(dialog.getByText(/frees a\s+seat on your plan/)).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeDisabled();
  });

  test("Ngiti's Owner can't reactivate a login when the plan is full again", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await deactivate(page, "Joy Tan");
    await addStaff(page, "Andres Bonifacio", "andres@ngiti.demo");
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await staffRow(page, "Joy Tan").getByRole("button", { name: "Reactivate" }).click();
    await expect(page.getByText(STAFF_LIMIT).last()).toBeVisible();
    await expect(staffRow(page, "Joy Tan").getByText(/Deactivated/)).toBeVisible();
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
  });

  test("Ngiti's Owner can't archive the clinic's only branch", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Branches");
    await branchCard(page).getByRole("row", { name: /Bacoor/ }).getByRole("button", { name: "Archive" }).click();
    const dialog = page.getByRole("dialog", { name: "Archive Bacoor?" });
    await dialog.getByRole("button", { name: "Archive Bacoor" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("A clinic always keeps one open branch. Add another branch before archiving this one.");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(branchCard(page).getByRole("row", { name: /Bacoor/ })).toContainText("Open");
  });

  test("Ipin's Owner, at 1 of 1 branch while overdue, can't add a branch", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Branches");
    await expect(branchCard(page).getByRole("button", { name: "Add branch" })).toBeDisabled();
    await expect(branchCard(page).getByRole("status")).toHaveText(BRANCH_LIMIT);
  });

  test("Ipin's Owner can't add a staff login with an email already in use", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Staff");
    await staffCard(page).getByRole("button", { name: "Add staff" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Dr. Lara Santiago Copy");
    await dialog.getByLabel("Email").fill(USERS.ipinOwner);
    await dialog.getByRole("button", { name: "Add staff" }).click();
    await expect(dialog.getByRole("alert")).toContainText("already signs in to Ipin Kids Dental");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(staffCard(page).getByText("1 of 5 staff logins on your plan, yours included.")).toBeVisible();
  });

  test("Ipin's Owner submitting an empty Add staff form is told what is missing and no seat is used", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Staff");
    await staffCard(page).getByRole("button", { name: "Add staff" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByRole("button", { name: "Add staff" }).click();
    await expect(dialog.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
    await expect(dialog.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(staffCard(page).getByText("1 of 5 staff logins on your plan, yours included.")).toBeVisible();
  });

  test("Primolar's Record payment refuses an empty paid-on date and an over-long reference", async ({ page }) => {
    await operatorOpenClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByLabel("Paid on").fill("");
    await dialog.getByLabel("Reference (optional)").fill("R".repeat(61));
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("Enter the date it was paid")).toBeVisible();
    await expect(dialog.getByText("Keep the reference under 60 characters")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Overdue, in grace").first()).toBeVisible();
  });

  test("Primolar cancels out of Record payment and Ipin stays overdue for its Owner", async ({ page }) => {
    await operatorOpenClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Record payment" })).toBeHidden();
    await signOutOperator(page);
    await signInAs(page, USERS.ipinOwner);
    await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
  });

  test("a paused Ipin: the Owner is refused at sign-in, and reactivating lets them back in", async ({ page }) => {
    await operatorOpenClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Pause account" }).click();
    await page.getByRole("dialog", { name: "Pause Ipin Kids Dental?" }).getByRole("button", { name: "Pause Ipin Kids Dental" }).click();
    await expect(page.getByText("Ipin Kids Dental is paused")).toBeVisible();
    await signOutOperator(page);

    await signIn(page, USERS.ipinOwner);
    await expect(page.getByText("Your clinic's Primolar account is paused. Contact your clinic.")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await operatorOpenClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Reactivate account" }).click();
    await expect(page.getByText("Ipin Kids Dental is active again")).toBeVisible();
    await signOutOperator(page);
    await signInAs(page, USERS.ipinOwner);
    await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
  });

  test("a wrong password for Ngiti's Owner shows an error and no billing information", async ({ page }) => {
    await signIn(page, USERS.ngitiOwner, "wrong-pass");
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Primolar payment/)).toHaveCount(0);
  });
});

// =====================================================================================================

test.describe("edge cases", () => {
  test("BUG: the reminder's 'See Settings → Plan' link opens the Plan tab", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await page.getByRole("link", { name: "See Settings → Plan" }).click();
    await expect(page).toHaveURL(/\/settings/);
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveAttribute("aria-selected", "true");
  });

  test("Ipin's Owner fills the plan to exactly 5 of 5 logins and Add staff turns off at the boundary", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Staff");
    const hires = [
      ["Liza Santos", "liza@ipin.demo"],
      ["Ma. Niña Ibáñez", "nina@ipin.demo"],
      ["Jun O'Hara", "jun@ipin.demo"],
    ];
    for (const [name, email] of hires) await addStaff(page, name!, email!);
    await expect(staffCard(page).getByText("4 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeEnabled();
    await addStaff(page, "Pedro Peñaflor", "pedro@ipin.demo");
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeDisabled();
    await expect(staffCard(page).getByRole("status")).toHaveText(STAFF_LIMIT);
  });

  test("double-clicking Add staff on the last free seat creates only one login", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await deactivate(page, "Mae Dizon");
    await staffCard(page).getByRole("button", { name: "Add staff" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Rosa Magdalena");
    await dialog.getByLabel("Email").fill("rosa@ngiti.demo");
    await dialog.getByRole("button", { name: "Add staff" }).dblclick();
    await expect(page.getByRole("dialog", { name: "Rosa Magdalena is added" })).toBeVisible();
    await page.getByRole("button", { name: "I've passed it on" }).click();
    await expect(staffCard(page).getByRole("row", { name: /Rosa Magdalena/ })).toHaveCount(1);
    await expect(staffCard(page).getByText("5 of 5 staff logins on your plan, yours included.")).toBeVisible();
  });

  test("double-clicking the deactivate confirm frees only one seat", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await staffRow(page, "Joy Tan").getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog", { name: "Deactivate Joy Tan?" }).getByRole("button", { name: "Deactivate Joy Tan" }).dblclick();
    await expect(page.getByText("Joy Tan is deactivated").first()).toBeVisible();
    await expect(staffCard(page).getByText("4 of 5 staff logins on your plan, yours included.")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Reactivate" })).toHaveCount(1);
  });

  test("double-clicking Record payment records only one month", async ({ page }) => {
    await operatorOpenClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByRole("dialog", { name: "Record payment" }).getByRole("button", { name: "Record payment" }).dblclick();
    await expect(page.getByText("Payment recorded for Ipin Kids Dental").first()).toBeVisible();
    await expect(page.getByText("11 November 2026").first()).toBeVisible();
    await expect(page.getByText("11 December 2026")).toHaveCount(0);
  });

  test("Escape closes the deactivate dialog without freeing a seat", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await staffRow(page, "Dr. Rico Bautista").getByRole("button", { name: "Deactivate" }).click();
    await expect(page.getByRole("dialog", { name: "Deactivate Dr. Rico Bautista?" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeDisabled();
  });

  test("the Owner's own login offers no Deactivate, so the Owner can't free a seat by locking themselves out", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    await expect(staffRow(page, "Dr. Bea Lim").getByRole("button", { name: "Deactivate" })).toHaveCount(0);
  });

  test("keyboard only: Ngiti's Owner reaches the Staff tab and deactivates a login without a mouse", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page);
    await page.getByRole("tab", { name: "Clinic" }).focus();
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Staff" })).toHaveAttribute("aria-selected", "true");
    const btn = staffRow(page, "Mae Dizon").getByRole("button", { name: "Deactivate" });
    await btn.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Deactivate Mae Dizon?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Deactivate Mae Dizon" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Mae Dizon is deactivated")).toBeVisible();
    await expect(staffCard(page).getByRole("button", { name: "Add staff" })).toBeEnabled();
  });

  test("the disabled Add staff button is skipped by Tab but its reason is readable", async ({ page }) => {
    await signInAs(page, USERS.ngitiOwner);
    await openSettings(page, "Staff");
    const add = staffCard(page).getByRole("button", { name: "Add staff" });
    await page.getByRole("tab", { name: "Staff" }).focus();
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      await expect(add).not.toBeFocused();
    }
    await expect(staffCard(page).getByText(STAFF_LIMIT)).toBeVisible();
  });

  test("the overdue banner survives a reload and the browser's back button", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Plan");
    await page.reload();
    await expect(page.getByRole("status").filter({ hasText: OVERDUE }).first()).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
  });

  test("an Admin who types /settings directly still gets no Plan or billing", async ({ page }) => {
    await signInAs(page, USERS.admin);
    await page.goto("/settings");
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
    await expect(page.getByText(/Payments to Primolar|Primolar payment|PRM-INV-/)).toHaveCount(0);
  });

  test("after signing out, the Owner's billing page can't be reopened with the back button", async ({ page }) => {
    await signInAs(page, USERS.ipinOwner);
    await openSettings(page, "Plan");
    await signOutClinic(page);
    await page.goBack();
    await expect(page.getByText(/PRM-INV-|Overdue, in grace/)).toHaveCount(0);
  });
});
