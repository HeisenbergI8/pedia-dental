import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, signIn, pinSeededDay } from "./support/users";

/*
 * Pilot tests for the Owner of a Mid-plan clinic: Dr. Paolo Villanueva at Bulilit Smiles (Imus and Dasmariñas).
 * Everything goes through the screen the way the Owner would use it: the sidebar, the Settings tabs, dialogs and
 * forms. Each test starts from fresh demo data (a new browser context).
 */

// The pilot runs beside other agents' suites on one machine, so screens can be slow: wait like a patient person would.
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 120_000 });

// ---------- helpers (UI only) ----------

async function signInAsOwner(page: Page) {
  await signIn(page, USERS.owner);
  await expect(page.getByRole("button", { name: /Dr\. Paolo Villanueva, Owner\. Account menu/ })).toBeVisible({ timeout: 45_000 });
}

const NAV_PATH: Record<string, RegExp> = { Settings: /\/settings/, Dashboard: /\/dashboard/, Billing: /\/billing/ };

/** Clicks a sidebar link and waits for the page; clicks again if the first click landed before the page was ready. */
async function goToNav(page: Page, name: string) {
  const link = page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });
  await expect(async () => {
    await link.click();
    await expect(page).toHaveURL(NAV_PATH[name]!, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
}

async function openSettings(page: Page, tab?: "Clinic" | "Branches" | "Staff" | "Plan" | "Procedures and chairs") {
  await goToNav(page, "Settings");
  // Generous: a page that wasn't prefetched yet can sit on "Opening" for ~13 s (see the BUG: back-button test)
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({ timeout: 30_000 });
  if (tab) {
    await page.getByRole("tab", { name: tab }).click();
    await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
  }
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out?" });
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Signs in from the sign-in page already on screen (no navigation), like a person on the same device. */
async function signInHere(page: Page, email: string, password: string) {
  const form = page.getByRole("region", { name: "Sign in" });
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

const toast = (page: Page, text: string | RegExp) => page.getByText(text).first();

/** The value shown under a label in a <dl> (a finance tile, the billing summary). */
const valueOf = (scope: Locator, label: string) => scope.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd[1]");

async function pickOption(page: Page, combobox: Locator, option: string) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

type NewStaff = { name: string; email: string; role?: "Admin" | "Dentist" | "Front desk"; branches?: string[] };

async function openAddStaff(page: Page) {
  await page.getByRole("button", { name: "Add staff" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a staff login" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Fills the Add staff form and sends it. Returns the dialog (now showing the result or an error). */
async function addStaff(page: Page, s: NewStaff) {
  const dialog = await openAddStaff(page);
  await dialog.getByLabel("Full name").fill(s.name);
  await dialog.getByLabel("Email").fill(s.email);
  if (s.role && s.role !== "Front desk") await pickOption(page, dialog.getByRole("combobox", { name: "Role" }), s.role);
  for (const b of s.branches ?? ["Imus"]) await dialog.getByRole("checkbox", { name: b }).check();
  await dialog.getByRole("button", { name: "Add staff" }).click();
  return dialog;
}

/** Reads the one-time temporary password off the "is added" dialog. */
async function readTemporaryPassword(page: Page, fullName: string) {
  const done = page.getByRole("dialog", { name: `${fullName} is added` });
  await expect(done).toBeVisible();
  await expect(done.getByText("It is shown only once.")).toBeVisible();
  const password = (await valueOf(done, "Temporary password").innerText()).trim();
  expect(password.length).toBeGreaterThanOrEqual(8);
  return { dialog: done, password };
}

const staffRow = (page: Page, name: string) => page.getByRole("table", { name: "Staff logins" }).getByRole("row").filter({ hasText: name });
const branchRow = (page: Page, name: string) => page.getByRole("table", { name: "Branches" }).getByRole("row").filter({ hasText: name });

type NewBranch = { name: string; address: string; phone: string; opens?: string; closes?: string };

async function addBranch(page: Page, b: NewBranch) {
  await page.getByRole("button", { name: "Add branch" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a branch" });
  await dialog.getByLabel("Branch name").fill(b.name);
  await dialog.getByLabel("Address").fill(b.address);
  await dialog.getByLabel("Phone").fill(b.phone);
  if (b.opens) await dialog.getByLabel("Opens").fill(b.opens);
  if (b.closes) await dialog.getByLabel("Closes").fill(b.closes);
  await dialog.getByRole("button", { name: "Add branch" }).click();
  return dialog;
}

const BACOOR: NewBranch = { name: "Bacoor", address: "88 Molino Road, Bacoor, Cavite", phone: "(046) 434 9900", opens: "09:00", closes: "18:00" };

/** A tiny valid PNG (1×1), as a file a person would pick. */
const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

async function chooseLogo(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Replace logo|Upload logo/ }).click();
  await (await chooser).setFiles(file);
}

// ---------- tests ----------

test.describe("happy paths", () => {
  test("owner signs in and lands on the dashboard in Bulilit's look", async ({ page }) => {
    await signInAsOwner(page);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Paolo/ })).toBeVisible();
    await expect(page.getByRole("img", { name: "Bulilit Smiles Pediatric Dental" }).first()).toBeVisible();
    await expect(page.getByText("Powered by Primolar")).toBeVisible();
    // The Owner sees the money on the dashboard
    await expect(page.getByRole("region", { name: "Finance" })).toBeVisible();
  });

  test("owner switches the dashboard between Imus, Dasmariñas and all branches", async ({ page }) => {
    await pinSeededDay(page);
    await signInAsOwner(page);
    const showing = page.getByRole("combobox", { name: "Showing" });
    await expect(showing).toHaveText("Imus");
    const finance = page.getByRole("region", { name: "Finance" });
    const glance = page.getByRole("navigation", { name: "Today at a glance" });

    const imusOutstanding = (await valueOf(finance, "Outstanding").innerText()).trim();
    await expect(glance.getByRole("link", { name: /^7 appointments,/ })).toBeVisible();

    await showing.click();
    await expect(page.getByRole("option")).toHaveText(["All branches", "Imus", "Dasmariñas"]);
    await page.getByRole("option", { name: "Dasmariñas" }).click();
    await expect(showing).toHaveText("Dasmariñas");
    // Dasmariñas has no billing in the demo
    await expect(valueOf(finance, "Outstanding")).toHaveText("₱0.00");

    await pickOption(page, showing, "All branches");
    await expect(showing).toHaveText("All branches");
    // All branches = Imus + Dasmariñas (which adds nothing)
    await expect(valueOf(finance, "Outstanding")).toHaveText(imusOutstanding);
    await expect(glance.getByRole("link", { name: /^7 appointments,/ })).toBeVisible();
  });

  test("owner filters the day's collections on Billing by branch", async ({ page }) => {
    await signInAsOwner(page);
    await goToNav(page, "Billing");
    const showing = page.getByRole("combobox", { name: "Showing" });
    await expect(showing).toBeVisible();
    await pickOption(page, showing, "All branches");
    await expect(showing).toHaveText("All branches");
    await pickOption(page, showing, "Dasmariñas");
    await expect(showing).toHaveText("Dasmariñas");
    await expect(page.getByText(/Nothing collected on/)).toBeVisible();
  });

  test("owner renames the clinic with a Filipino name and it sticks after a reload", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const name = "Bulilit Smiles ng Dasmariñas & Imus (Dr. O'Neil-Peña)";
    await page.getByLabel("Clinic name").fill(name);
    await page.getByLabel("Contact email").fill("hello@bulilitsmiles.ph");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(toast(page, "Clinic details saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Clinic name")).toHaveValue(name);
    await expect(page.getByLabel("Contact email")).toHaveValue("hello@bulilitsmiles.ph");
    // The logo / name in the sidebar now carries the new name
    await expect(page.getByRole("complementary").getByRole("img", { name })).toBeVisible();
  });

  test("owner types a TIN as plain digits and Primolar adds the dashes", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const tin = page.getByLabel("TIN");
    await tin.fill("");
    await tin.pressSequentially("987654321");
    await expect(tin).toHaveValue("987-654-321");
    await tin.pressSequentially("00012");
    await expect(tin).toHaveValue("987-654-321-00012");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(toast(page, "Clinic details saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("TIN")).toHaveValue("987-654-321-00012");
  });

  test("owner tries a light brand colour, takes the suggested darker one and saves the look", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const colour = page.getByLabel("Brand colour", { exact: true });
    await colour.fill("#e07a48");
    await expect(page.getByRole("alert").filter({ hasText: "too light for text and buttons" })).toBeVisible();
    const save = page.getByRole("button", { name: "Save look" });
    await expect(save).toBeDisabled();

    await page.getByRole("button", { name: /^Use #[0-9a-f]{6}$/ }).click();
    const suggested = await colour.inputValue();
    expect(suggested).toMatch(/^#[0-9a-f]{6}$/);
    expect(suggested).not.toBe("#e07a48");
    await expect(page.getByLabel("Preview")).toBeVisible();
    await expect(save).toBeEnabled();
    await save.click();
    await expect(toast(page, "Your clinic's look is saved")).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Brand colour", { exact: true })).toHaveValue(suggested);
    await expect(page.getByRole("button", { name: "Save look" })).toBeDisabled();
  });

  test("owner picks a heading font and it is kept", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const font = page.getByRole("combobox", { name: "Heading font" });
    await expect(font).toHaveText("Primolar default");
    await pickOption(page, font, "Fredoka");
    await page.getByRole("button", { name: "Save look" }).click();
    await expect(toast(page, "Your clinic's look is saved")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("combobox", { name: "Heading font" })).toHaveText("Fredoka");
  });

  test("owner replaces the logo with a PNG, then removes it", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await chooseLogo(page, { name: "bulilit-new.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(toast(page, "Logo updated")).toBeVisible();

    await page.getByRole("button", { name: "Remove logo" }).click();
    await expect(toast(page, "Logo removed")).toBeVisible();
    await expect(page.getByText("No logo yet: your clinic's name shows instead.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Upload logo" })).toBeVisible();

    await page.reload();
    await expect(page.getByText("No logo yet: your clinic's name shows instead.")).toBeVisible();
  });

  test("owner publishes a new version of the privacy notice and parents can read it on the public page", async ({ page, context }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await expect(page.getByText(/^Version 1, saved/)).toBeVisible();
    const save = page.getByRole("button", { name: "Save new version" });
    await expect(save).toBeDisabled();

    await page.getByLabel("Privacy contact", { exact: true }).fill("Ma. Niña Dela Peña");
    await page.getByLabel("Privacy contact's email").fill("privacy@bulilitsmiles.ph");
    const body = page.getByLabel("Notice to parents");
    await body.fill("We keep your child's records safe.\n\nAsk our privacy contact anything.");
    await save.click();
    await expect(toast(page, "Saved as version 2. Parents read it at their next portal visit.")).toBeVisible();
    await expect(page.getByText(/^Version 2, saved .* by Dr\. Paolo Villanueva/)).toBeVisible();

    const popupPromise = context.waitForEvent("page");
    await page.getByRole("link", { name: "See the public page" }).click();
    const notice = await popupPromise;
    await expect(notice.getByRole("heading", { level: 1, name: "Bulilit Smiles Pediatric Dental privacy notice" })).toBeVisible();
    await expect(notice.getByText("We keep your child's records safe.")).toBeVisible();
    await expect(notice.getByText("Ma. Niña Dela Peña")).toBeVisible();
    await expect(notice.getByRole("link", { name: "privacy@bulilitsmiles.ph" })).toBeVisible();
  });

  test("owner adds a third branch and the plan shows 3 of 3", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await expect(page.getByText("2 of 3 open branches on your plan. Archived branches don't count.")).toBeVisible();
    const dialog = await addBranch(page, BACOOR);
    await expect(dialog).toBeHidden();
    await expect(toast(page, "Bacoor added")).toBeVisible();
    await expect(branchRow(page, "Bacoor")).toContainText("88 Molino Road, Bacoor, Cavite");
    await expect(branchRow(page, "Bacoor")).toContainText("9:00 AM–6:00 PM");
    await expect(page.getByText("3 of 3 open branches on your plan.", { exact: false })).toBeVisible();

    await page.getByRole("tab", { name: "Plan" }).click();
    const plan = page.getByRole("tabpanel", { name: "Plan" });
    await expect(plan.getByText("3 of 3")).toBeVisible();

    // The new branch is in the branch switcher too
    await page.reload();
    await page.getByRole("combobox", { name: "Branch" }).click();
    await expect(page.getByRole("option", { name: "Bacoor" })).toBeVisible();
  });

  test("owner edits a branch's phone and closing time", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await branchRow(page, "Dasmariñas").getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit Dasmariñas" });
    await expect(dialog.getByLabel("Branch name")).toHaveValue("Dasmariñas");
    await dialog.getByLabel("Phone").fill("0917 555 0123");
    await dialog.getByLabel("Closes").fill("19:30");
    await dialog.getByRole("checkbox", { name: "Sat" }).check();
    await dialog.getByRole("button", { name: "Save branch" }).click();
    await expect(toast(page, "Dasmariñas saved")).toBeVisible();
    await expect(branchRow(page, "Dasmariñas")).toContainText("0917 555 0123");
    await expect(branchRow(page, "Dasmariñas")).toContainText("9:00 AM–7:30 PM, closed Sun, Sat");
    await page.reload();
    await page.getByRole("tab", { name: "Branches" }).click();
    await expect(branchRow(page, "Dasmariñas")).toContainText("0917 555 0123");
  });

  test("owner archives a branch, which frees a slot, then reopens it", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await addBranch(page, BACOOR);
    await expect(toast(page, "Bacoor added")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add branch" })).toBeDisabled();

    await branchRow(page, "Bacoor").getByRole("button", { name: "Archive" }).click();
    const confirm = page.getByRole("dialog", { name: "Archive Bacoor?" });
    await confirm.getByRole("button", { name: "Archive Bacoor" }).click();
    await expect(toast(page, "Bacoor archived")).toBeVisible();
    await expect(branchRow(page, "Bacoor")).toContainText("Archived");
    await expect(page.getByText(/^2 of 3 open branches/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Add branch" })).toBeEnabled();

    await branchRow(page, "Bacoor").getByRole("button", { name: "Reopen" }).click();
    await expect(toast(page, "Bacoor is open again")).toBeVisible();
    await expect(branchRow(page, "Bacoor")).toContainText("Open");
    await expect(page.getByText(/^3 of 3 open branches/)).toBeVisible();
  });

  test("owner adds a front desk login and sees the temporary password once", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await expect(page.getByText("5 of 20 staff logins on your plan, yours included.", { exact: false })).toBeVisible();
    await addStaff(page, { name: "Jose Rizal Mercado", email: "jose.mercado@bulilitsmiles.ph", branches: ["Dasmariñas"] });
    const { dialog } = await readTemporaryPassword(page, "Jose Rizal Mercado");
    await expect(valueOf(dialog, "Email")).toHaveText("jose.mercado@bulilitsmiles.ph");
    await expect(valueOf(dialog, "Switch-user PIN")).toHaveText(/^\d{4}$/);
    // No close (X) button while the password shows: "I've passed it on" is the way out
    await expect(dialog.getByRole("button", { name: "Close" })).toHaveCount(0);
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    await expect(dialog).toBeHidden();

    const row = staffRow(page, "Jose Rizal Mercado");
    await expect(row).toContainText("jose.mercado@bulilitsmiles.ph");
    await expect(row).toContainText("Active");
    await expect(row).toContainText("Front desk");
    await expect(row).toContainText("Dasmariñas");
    await expect(page.getByText(/^6 of 20 staff logins/)).toBeVisible();
    // The password is nowhere on the page any more
    await expect(page.getByText("Temporary password")).toHaveCount(0);

    await page.getByRole("tab", { name: "Plan" }).click();
    await expect(page.getByRole("tabpanel", { name: "Plan" }).getByText("6 of 20")).toBeVisible();
  });

  test("a new staff login signs in with the temporary password, chooses their own, and reads the confidentiality notice", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Niña Bautista", email: "nina.bautista@bulilitsmiles.ph", role: "Dentist", branches: ["Imus"] });
    const { dialog, password } = await readTemporaryPassword(page, "Niña Bautista");
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);

    await signInHere(page, "nina.bautista@bulilitsmiles.ph", password);
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
    await expect(page.getByText(/Hi Niña Bautista/)).toBeVisible();
    await page.getByLabel("Temporary password").fill(password);
    await page.getByLabel("New password").fill("NinaSecure2026");
    await page.getByRole("button", { name: "Save and continue" }).click();

    await expect(page.getByText("Patient records are confidential; every access is logged.")).toBeVisible();
    await page.getByRole("button", { name: "I understand" }).click();
    await expect(page.getByRole("button", { name: /Niña Bautista, Dentist\. Account menu/ })).toBeVisible();

    // The temporary password no longer opens the login; the chosen one does, with no more first-time screens
    await signOut(page);
    await signInHere(page, "nina.bautista@bulilitsmiles.ph", password);
    await expect(page.getByRole("region", { name: "Sign in" }).getByRole("alert")).toHaveText("That email and password don't match a demo account");
    await signInHere(page, "nina.bautista@bulilitsmiles.ph", "NinaSecure2026");
    await expect(page.getByRole("button", { name: /Niña Bautista, Dentist\. Account menu/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "I understand" })).toHaveCount(0);
  });

  test("BUG: a new staff login is told \"Password saved. Welcome!\" after choosing their password", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Lapu Lapu", email: "lapu@bulilitsmiles.ph" });
    const { dialog, password } = await readTemporaryPassword(page, "Lapu Lapu");
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);
    await signInHere(page, "lapu@bulilitsmiles.ph", password);
    await page.getByLabel("Temporary password").fill(password);
    await page.getByLabel("New password").fill("LapuMactan1521");
    await page.getByRole("button", { name: "Save and continue" }).click();
    // The screen moves on to the confidentiality notice, but the confirmation the code promises never appears
    await expect(page.getByRole("button", { name: "I understand" })).toBeVisible();
    await expect(page.getByText("Password saved. Welcome!")).toBeVisible();
  });

  test("owner deactivates a front desk login, which frees a seat, and reactivates it", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await staffRow(page, "Liza Cruz").getByRole("button", { name: "Deactivate" }).click();
    const confirm = page.getByRole("dialog", { name: "Deactivate Liza Cruz?" });
    await expect(confirm).toContainText("frees a seat on your plan");
    await confirm.getByRole("button", { name: "Deactivate Liza Cruz" }).click();
    await expect(toast(page, "Liza Cruz is deactivated")).toBeVisible();
    await expect(staffRow(page, "Liza Cruz")).toContainText("Deactivated");
    await expect(page.getByText(/^4 of 20 staff logins/)).toBeVisible();

    await page.reload();
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(staffRow(page, "Liza Cruz")).toContainText("Deactivated");

    await staffRow(page, "Liza Cruz").getByRole("button", { name: "Reactivate" }).click();
    await expect(toast(page, "Liza Cruz can sign in again")).toBeVisible();
    await expect(staffRow(page, "Liza Cruz")).toContainText("Active");
    await expect(page.getByText(/^5 of 20 staff logins/)).toBeVisible();
  });

  test("a deactivated front desk can no longer sign in, and can again once reactivated", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await staffRow(page, "Liza Cruz").getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Deactivate Liza Cruz" }).click();
    await expect(toast(page, "Liza Cruz is deactivated")).toBeVisible();
    await signOut(page);

    await signInHere(page, USERS.frontdesk, DEMO_PASSWORD);
    await expect(page.getByRole("region", { name: "Sign in" }).getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await signInHere(page, USERS.owner, DEMO_PASSWORD);
    await expect(page.getByRole("button", { name: /Account menu/ })).toBeVisible({ timeout: 45_000 });
    await openSettings(page, "Staff");
    await staffRow(page, "Liza Cruz").getByRole("button", { name: "Reactivate" }).click();
    await expect(toast(page, "Liza Cruz can sign in again")).toBeVisible();
    await signOut(page);
    await signInHere(page, USERS.frontdesk, DEMO_PASSWORD);
    await expect(page.getByRole("button", { name: /Liza Cruz, Front desk\. Account menu/ })).toBeVisible();
  });

  test("owner reviews the plan and billing: status, next due amount with VAT, and every payment", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Plan");
    const plan = page.getByRole("tabpanel", { name: "Plan" });
    await expect(plan.getByRole("heading", { name: "You're on the Mid plan" })).toBeVisible();
    await expect(plan.getByText("2 of 3")).toBeVisible();
    await expect(plan.getByText("5 of 20")).toBeVisible();
    await expect(plan.getByText("Dashboard and finance views across branches · included")).toBeVisible();
    await expect(valueOf(plan, "Status")).toHaveText("Paid up");
    await expect(valueOf(plan, "Amount")).toContainText(/₱[\d,]+\.\d\d \(includes ₱[\d,]+\.\d\d VAT\)/);
    const payments = plan.getByRole("table", { name: "Payments to Primolar" });
    await expect(payments.getByRole("row")).not.toHaveCount(1);
    await expect(payments.getByRole("button", { name: /Download invoice PRM-INV-/ }).first()).toBeVisible();
  });

  test("owner downloads a PDF invoice for a payment to Primolar", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Plan");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download invoice PRM-INV-00008" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("Primolar's Terms, Privacy Policy and Data Processing Agreement are marked as templates pending legal review", async ({ page, context }) => {
    await page.goto("/login");
    await page.getByRole("navigation", { name: "Privacy and terms" }).getByRole("link", { name: "Terms" }).click();
    await expect(page).toHaveURL(/\/legal\/terms/);
    await expect(page.getByRole("heading", { level: 1, name: "Terms of Service" })).toBeVisible();
    await expect(page.getByText("Template, pending legal review")).toBeVisible();

    await page.getByRole("navigation", { name: "Privacy and terms" }).getByRole("link", { name: "Privacy" }).click();
    await expect(page).toHaveURL(/\/legal\/privacy/);
    await expect(page.getByRole("heading", { level: 1, name: "Primolar Privacy Policy" })).toBeVisible();
    await expect(page.getByText("Template, pending legal review")).toBeVisible();

    // The DPA is linked from the Get started form's agreement
    await page.goto("/get-started");
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: "Data Processing Agreement" }).click();
    const dpa = await popup;
    await expect(dpa.getByRole("heading", { level: 1, name: "Data Processing Agreement" })).toBeVisible();
    await expect(dpa.getByText("Template, pending legal review")).toBeVisible();
  });
});

test.describe("failed paths", () => {
  test("owner mistypes the password and is told plainly, without a hint which part was wrong", async ({ page }) => {
    await signIn(page, USERS.owner, "pass1234");
    const form = page.getByRole("region", { name: "Sign in" });
    await expect(form.getByRole("alert")).toHaveText("That email and password don't match a demo account");
    await expect(page).toHaveURL(/\/login/);
    await signInHere(page, "owner@gmail.co", DEMO_PASSWORD);
    await expect(form.getByRole("alert")).toHaveText("That email and password don't match a demo account");
  });

  test("owner clears the clinic details and gets a message for each field, and nothing is saved", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await page.getByLabel("Clinic name").fill("   ");
    await page.getByLabel("Contact email").fill("hello@bulilit");
    await page.getByLabel("TIN").fill("1234");
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(page.getByText("Enter the clinic's name")).toBeVisible();
    await expect(page.getByText("Enter the clinic's email address, like hello@clinic.ph")).toBeVisible();
    await expect(page.getByText("Enter the TIN like 123-456-789, with the branch code after it if there is one")).toBeVisible();
    await expect(page.getByLabel("Clinic name")).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Clinic details saved")).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Clinic name")).toHaveValue("Bulilit Smiles Pediatric Dental");
    await expect(page.getByLabel("TIN")).toHaveValue("123-456-789-000");
  });

  test("owner types a colour that isn't a hex code and can't save the look", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const colour = page.getByLabel("Brand colour", { exact: true });
    for (const bad of ["raspberry", "#12345", "#zzzzzz", ""]) {
      await colour.fill(bad);
      await expect(page.getByRole("alert").filter({ hasText: "Enter a colour as # and six letters or digits" })).toBeVisible();
      await expect(colour).toHaveAttribute("aria-invalid", "true");
      await expect(page.getByRole("button", { name: "Save look" })).toBeDisabled();
    }
  });

  test("owner tries a white brand colour and Primolar refuses it with a darker suggestion", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await page.getByLabel("Brand colour", { exact: true }).fill("#ffffff");
    await expect(page.getByRole("alert").filter({ hasText: /too light for text and buttons: 1\.0:1/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Use #/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save look" })).toBeDisabled();
  });

  test("owner picks a logo that is the wrong type or too big and is told why", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await chooseLogo(page, { name: "logo.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") });
    await expect(page.getByRole("alert").filter({ hasText: "Choose a PNG, JPG or SVG file" })).toBeVisible();

    await chooseLogo(page, { name: "huge-logo.png", mimeType: "image/png", buffer: Buffer.alloc(1024 * 1024 + 1, 1) });
    await expect(page.getByRole("alert").filter({ hasText: "Logos must be 1 MB or smaller" })).toBeVisible();
    await expect(page.getByText("Logo updated")).toHaveCount(0);
  });

  test("owner sends the Add staff form empty and sees what is missing", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const dialog = await openAddStaff(page);
    await dialog.getByRole("button", { name: "Add staff" }).click();
    await expect(dialog.getByText("Enter their full name")).toBeVisible();
    await expect(dialog.getByText("Enter their email address, like name@example.com")).toBeVisible();
    await expect(dialog.getByText("Choose at least one branch")).toBeVisible();

    await dialog.getByLabel("Email").fill("not-an-email");
    await dialog.getByRole("button", { name: "Add staff" }).click();
    await expect(dialog.getByText("Enter their email address, like name@example.com")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("owner can't add a login with an email that already signs in, even typed in capitals", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const dialog = await addStaff(page, { name: "Liza Cruz Two", email: "frontdesk@gmail.com" });
    await expect(dialog.getByRole("alert")).toHaveText("frontdesk@gmail.com already signs in to Bulilit Smiles Pediatric Dental");

    await dialog.getByLabel("Email").fill("  FrontDesk@Gmail.COM ");
    await dialog.getByRole("button", { name: "Add staff" }).click();
    await expect(dialog.getByRole("alert")).toContainText("already signs in to Bulilit Smiles Pediatric Dental");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText(/^5 of 20 staff logins/)).toBeVisible();
  });

  test("owner can't reuse the email of a login that was added earlier", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Pedro Penduko", email: "pedro@bulilitsmiles.ph" });
    const { dialog } = await readTemporaryPassword(page, "Pedro Penduko");
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    const again = await addStaff(page, { name: "Pedro Penduko Jr.", email: "pedro@bulilitsmiles.ph" });
    await expect(again.getByRole("alert")).toHaveText("pedro@bulilitsmiles.ph already signs in to Bulilit Smiles Pediatric Dental");
  });

  test("owner cancels Add staff halfway and no login is created", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const dialog = await openAddStaff(page);
    await dialog.getByLabel("Full name").fill("Half Filled");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(staffRow(page, "Half Filled")).toHaveCount(0);
    await expect(page.getByText(/^5 of 20 staff logins/)).toBeVisible();
  });

  test("owner cancels a deactivation and the login stays active", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await staffRow(page, "Dr. Miguel Santos").getByRole("button", { name: "Deactivate" }).click();
    await page.getByRole("dialog", { name: "Deactivate Dr. Miguel Santos?" }).getByRole("button", { name: "Cancel" }).click();
    await expect(staffRow(page, "Dr. Miguel Santos")).toContainText("Active");
    await expect(page.getByText(/^5 of 20 staff logins/)).toBeVisible();
  });

  test("the Owner's own login offers no Deactivate", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const me = staffRow(page, "Dr. Paolo Villanueva");
    await expect(me).toContainText("Owner + Dentist");
    await expect(me).toContainText("Every branch");
    await expect(me.getByRole("button")).toHaveCount(0);
  });

  test("owner leaves the new branch form empty or closes before opening and is stopped", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await page.getByRole("button", { name: "Add branch" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a branch" });
    await dialog.getByRole("button", { name: "Add branch" }).click();
    await expect(dialog.getByText("Enter the branch name")).toBeVisible();
    await expect(dialog.getByText("Enter the branch address")).toBeVisible();
    await expect(dialog.getByText("Enter the branch phone number")).toBeVisible();

    await dialog.getByLabel("Branch name").fill("Silang");
    await dialog.getByLabel("Address").fill("1 J.P. Rizal St, Silang");
    await dialog.getByLabel("Phone").fill("(046) 123 4567");
    await dialog.getByLabel("Opens").fill("17:00");
    await dialog.getByLabel("Closes").fill("08:00");
    await dialog.getByRole("button", { name: "Add branch" }).click();
    await expect(dialog.getByText("Closing time must be after opening time")).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(branchRow(page, "Silang")).toHaveCount(0);
    await expect(page.getByText(/^2 of 3 open branches/)).toBeVisible();
  });

  test("at 3 of 3 branches Add branch is off and says to contact Primolar", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await addBranch(page, BACOOR);
    await expect(toast(page, "Bacoor added")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add branch" })).toBeDisabled();
    await expect(page.getByRole("status").filter({ hasText: "Your Mid plan includes 3 branches. Contact Primolar to upgrade." })).toBeVisible();
  });

  test("owner can't archive Imus while staff work only there, and is told who", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await branchRow(page, "Imus").getByRole("button", { name: "Archive" }).click();
    const dialog = page.getByRole("dialog", { name: "Archive Imus?" });
    await dialog.getByRole("button", { name: "Archive Imus" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Liza Cruz");
    await expect(dialog.getByRole("alert")).toContainText("only at Imus");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(branchRow(page, "Imus")).toContainText("Open");
  });

  test("owner can't save an empty privacy notice or a bad contact email", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await page.getByLabel("Notice to parents").fill("");
    await page.getByLabel("Privacy contact", { exact: true }).fill("");
    await page.getByLabel("Privacy contact's email").fill("privacy at clinic");
    await page.getByRole("button", { name: "Save new version" }).click();
    await expect(page.getByText("Write the notice, or start from Primolar's template")).toBeVisible();
    await expect(page.getByText("Name the clinic's privacy contact")).toBeVisible();
    await expect(page.getByText("Enter the privacy contact's email, like privacy@clinic.ph")).toBeVisible();
    await page.reload();
    await expect(page.getByText(/^Version 1, saved/)).toBeVisible();
  });

  test("an admin who types the Settings address sees no plan, billing or staff management", async ({ page }) => {
    await signIn(page, USERS.admin);
    await expect(page.getByRole("button", { name: /Account menu/ })).toBeVisible({ timeout: 45_000 });
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await expect(page.getByText("Read-only in this prototype.", { exact: false })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add staff" })).toHaveCount(0);
    await expect(page.getByText("Payment history")).toHaveCount(0);
  });

  test("new staff can't keep the temporary password or choose one under 8 characters", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Rosa Magsaysay", email: "rosa@bulilitsmiles.ph" });
    const { dialog, password } = await readTemporaryPassword(page, "Rosa Magsaysay");
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);

    await signInHere(page, "rosa@bulilitsmiles.ph", password);
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
    await page.getByLabel("Temporary password").fill(password);
    await page.getByLabel("New password").fill("short");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();
    await page.getByLabel("New password").fill(password);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Choose a new password, not the one you use now")).toBeVisible();
    await page.getByLabel("Temporary password").fill("wrong-temp-pass");
    await page.getByLabel("New password").fill("RosaChoice2026");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("That isn't your current password")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();
  });
});

test.describe("edge cases", () => {
  test("double-clicking Add staff creates only one login", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const dialog = await openAddStaff(page);
    await dialog.getByLabel("Full name").fill("Andres Bonifacio");
    await dialog.getByLabel("Email").fill("andres@bulilitsmiles.ph");
    await dialog.getByRole("checkbox", { name: "Imus" }).check();
    await dialog.getByRole("button", { name: "Add staff" }).dblclick();
    const { dialog: done } = await readTemporaryPassword(page, "Andres Bonifacio");
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(staffRow(page, "Andres Bonifacio")).toHaveCount(1);
    await expect(page.getByText(/^6 of 20 staff logins/)).toBeVisible();
  });

  test("Escape can't dismiss the one-time password, but does close an empty Add staff form", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const empty = await openAddStaff(page);
    await page.keyboard.press("Escape");
    await expect(empty).toBeHidden();

    await addStaff(page, { name: "Gabriela Silang", email: "gabriela@bulilitsmiles.ph" });
    const { dialog } = await readTemporaryPassword(page, "Gabriela Silang");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Temporary password", { exact: true })).toBeVisible();
  });

  test("reloading while the temporary password shows loses the password but keeps the login", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Apolinario Mabini", email: "pole@bulilitsmiles.ph" });
    await readTemporaryPassword(page, "Apolinario Mabini");
    await page.reload();
    await page.getByRole("tab", { name: "Staff" }).click();
    await expect(staffRow(page, "Apolinario Mabini")).toContainText("Active");
    await expect(page.getByText("Temporary password")).toHaveCount(0);
    await expect(page.getByText(/^6 of 20 staff logins/)).toBeVisible();
  });

  test("staff names with ñ, apostrophes and hyphens show exactly as typed", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const name = "Ma. Niña O'Brien-Dela Peña";
    await addStaff(page, { name, email: "nina.obrien@bulilitsmiles.ph", role: "Admin", branches: ["Imus", "Dasmariñas"] });
    const { dialog } = await readTemporaryPassword(page, name);
    await dialog.getByRole("button", { name: "I've passed it on" }).click();
    const row = staffRow(page, name);
    await expect(row.getByRole("cell").first()).toContainText(name);
    await expect(row).toContainText("Admin");
    await expect(row).toContainText("Imus, Dasmariñas");
  });

  test("an email typed with capitals and spaces is saved trimmed and lowercase", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await addStaff(page, { name: "Emilio Jacinto", email: "  Emilio.Jacinto@BulilitSmiles.PH " });
    const { dialog } = await readTemporaryPassword(page, "Emilio Jacinto");
    await expect(valueOf(dialog, "Email")).toHaveText("emilio.jacinto@bulilitsmiles.ph");
  });

  test("a dentist added with a PRC licence shows both roles", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    const dialog = await openAddStaff(page);
    await dialog.getByLabel("Full name").fill("Dr. Melchora Aquino");
    await dialog.getByLabel("Email").fill("melchora@bulilitsmiles.ph");
    await pickOption(page, dialog.getByRole("combobox", { name: "Role" }), "Dentist");
    await expect(dialog.getByLabel("PRC licence number")).toBeVisible();
    await dialog.getByLabel("PRC licence number").fill("0061234");
    await pickOption(page, dialog.getByRole("combobox", { name: /Also works as/ }), "Admin");
    await dialog.getByRole("checkbox", { name: "Dasmariñas" }).check();
    await dialog.getByRole("button", { name: "Add staff" }).click();
    const { dialog: done } = await readTemporaryPassword(page, "Dr. Melchora Aquino");
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(staffRow(page, "Dr. Melchora Aquino")).toContainText("Admin + Dentist");
  });

  test("a very long clinic name is saved and shown in full", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const long = "Bulilit Smiles Pediatric Dental and Orthodontic Centre for Kids of Imus, Dasmariñas, Bacoor and the Whole of Cavite Province";
    await page.getByLabel("Clinic name").fill(long);
    await page.getByRole("button", { name: "Save details" }).click();
    await expect(toast(page, "Clinic details saved")).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Clinic name")).toHaveValue(long);
  });

  test("a privacy notice over 8,000 characters is refused", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await page.getByLabel("Notice to parents").fill("Ang inyong privacy ay mahalaga sa amin. ".repeat(205)); // 8,200 characters
    await page.getByRole("button", { name: "Save new version" }).click();
    await expect(page.getByText("Keep the notice under 8,000 characters")).toBeVisible();
  });

  test("Start from Primolar's template fills the notice with the clinic's name", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const body = page.getByLabel("Notice to parents");
    await body.fill("Draft");
    await page.getByRole("button", { name: "Start from Primolar's template" }).click();
    await expect(body).toHaveValue(/^Bulilit Smiles Pediatric Dental collects and uses personal information/);
    // Back to the notice in force (which is the template): nothing to save, so parents aren't asked to re-read it
    await expect(page.getByRole("button", { name: "Save new version" })).toBeDisabled();
  });

  test("re-typing the current colour in capitals doesn't count as a change", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    const colour = page.getByLabel("Brand colour", { exact: true });
    await expect(colour).toHaveValue("#b0245e");
    await colour.fill("#B0245E");
    await expect(page.getByRole("button", { name: "Save look" })).toBeDisabled();
  });

  test("owner updates the clinic details with the keyboard only", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Clinic");
    await page.getByLabel("Clinic name").focus();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.type("Bulilit Smiles Kids' Dental");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Contact email")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("TIN")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Save details" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toast(page, "Clinic details saved")).toBeVisible();
  });

  test("owner adds a staff login with the keyboard only", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await page.getByRole("button", { name: "Add staff" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await expect(dialog.getByLabel("Full name")).toBeFocused();
    await page.keyboard.type("Teodora Alonso");
    await page.keyboard.press("Tab");
    await page.keyboard.type("teodora@bulilitsmiles.ph");
    await page.keyboard.press("Tab"); // Role
    await expect(dialog.getByRole("combobox", { name: "Role" })).toBeFocused();
    await page.keyboard.press("Tab"); // Also works as
    await page.keyboard.press("Tab"); // Imus
    await expect(dialog.getByRole("checkbox", { name: "Imus" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(dialog.getByRole("checkbox", { name: "Imus" })).toBeChecked();
    await page.keyboard.press("Tab"); // Dasmariñas
    await page.keyboard.press("Tab"); // Cancel
    await page.keyboard.press("Tab"); // Add staff
    await expect(dialog.getByRole("button", { name: "Add staff" })).toBeFocused();
    await page.keyboard.press("Enter");
    await readTemporaryPassword(page, "Teodora Alonso");
  });

  test("BUG: the browser back button brings Settings back promptly, not after a long loading screen", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Staff");
    await goToNav(page, "Dashboard");
    await expect(page.getByRole("combobox", { name: "Showing" })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/settings/);
    // Every forward click shows its page in well under a second; going back sits on "Opening" for about 13 seconds
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({ timeout: 5_000 });
  });

  test("a branch with a Filipino name and a 24-hour day is saved", async ({ page }) => {
    await signInAsOwner(page);
    await openSettings(page, "Branches");
    await addBranch(page, { name: "Parañaque – Sto. Niño", address: "5 Doña Soledad Ave, Parañaque", phone: "+63 2 8123 4567", opens: "00:00", closes: "23:45" });
    await expect(toast(page, "Parañaque – Sto. Niño added")).toBeVisible();
    await expect(branchRow(page, "Parañaque – Sto. Niño")).toContainText("12:00 AM–11:45 PM");
  });
});
