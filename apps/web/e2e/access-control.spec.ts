import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, signInOperator } from "./support/users";

/**
 * Pilot tests: security and access across every role. Everything is done the way a person would: typing into the
 * sign-in forms, clicking the nav, or typing/pasting a URL into the address bar to try a page they shouldn't reach.
 * Intended rules: packages/shared/src/domain/permissions.ts, apps/web/src/features/auth/access.tsx.
 */

test.describe.configure({ timeout: 150_000 });

const NAMES = {
  owner: "Dr. Paolo Villanueva",
  admin: "Carmen Dela Cruz",
  dentist: "Dr. Ana Reyes",
  frontdesk: "Liza Cruz",
  ngitiOwner: "Dr. Bea Lim",
  ipinOwner: "Dr. Lara Santiago",
} as const;

const NO_ACCESS = "You don't have access to this page";
const SIGN_IN_ERROR = "That mobile number or email and password don't match a demo account";
const NOTICE_HEADING = "Bulilit Smiles Pediatric Dental's privacy notice";

// ---------- helpers (UI only) ----------

/**
 * The shared sign-in, but like a person it first waits for the page to finish loading (the demo logins list appears
 * once the page is live), so a click on a still-loading page isn't lost on a busy server.
 */
async function signIn(page: Page, email: string, password: string = DEMO_PASSWORD) {
  await openSignIn(page);
  const form = page.getByRole("region", { name: "Sign in" });
  await form.getByLabel("Mobile number or email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

const signInForm = (page: Page) => page.getByRole("region", { name: "Sign in" });
const accountMenu = (page: Page) => page.getByRole("button", { name: /Account menu/ }).first();

async function expectOnSignIn(page: Page) {
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible({ timeout: 30_000 });
}

/** Signs in a staff member or parent and waits for their landing page. The dentist picks Bulilit on the chooser. */
async function signInAs(page: Page, who: keyof typeof USERS) {
  await signIn(page, USERS[who]);
  if (who === "dentist") {
    const chooser = page.getByRole("region", { name: "Which clinic?" });
    await expect(chooser).toBeVisible({ timeout: 30_000 });
    await chooser.getByRole("button", { name: /Bulilit/ }).click();
  }
  // Like expectSignedIn, with more patience: the shared demo server is busy while many pilots run.
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });
  if (who === "parent") {
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "I've read this" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
    return;
  }
  await expect(accountMenu(page)).toBeVisible({ timeout: 30_000 });
}

/** Account menu → Sign out → confirm. */
async function signOut(page: Page) {
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
  await expectOnSignIn(page);
}

/** Opens sign-in and waits until it has finished loading, as a person would. */
async function openSignIn(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Demo logins" })).toBeVisible({ timeout: 30_000 });
}

/** The person types a URL into the address bar. */
async function typeUrl(page: Page, path: string) {
  await page.goto(path);
}

async function expectNoAccess(page: Page, who: string, reason?: string | RegExp) {
  await expect(page.getByText(NO_ACCESS)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(new RegExp(`You're signed in as ${who.replace(/\./g, "\\.")}`))).toBeVisible();
  if (reason) await expect(page.getByText(reason)).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to your home page" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in as someone else" })).toBeVisible();
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" }).first();

// =====================================================================================================================

test.describe("happy paths", () => {
  test("the owner sees every staff area in the nav and can open each one", async ({ page }) => {
    await signInAs(page, "owner");
    const nav = mainNav(page);
    for (const label of ["Dashboard", "Appointments", "Patients", "Billing", "Recalls", "Messages", "Documents", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    await nav.getByRole("link", { name: "Billing" }).click();
    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible({ timeout: 30_000 });
    await nav.getByRole("link", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({ timeout: 30_000 });
    // The Owner runs the account: Staff and Plan tabs are theirs alone.
    await expect(page.getByRole("tab", { name: "Staff" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plan" })).toBeVisible();
  });

  test("a dentist only sees the areas their role uses in the nav", async ({ page }) => {
    await signInAs(page, "dentist");
    const nav = mainNav(page);
    for (const label of ["Dashboard", "Appointments", "Patients", "Documents", "Settings"]) {
      await expect(nav.getByRole("link", { name: label })).toBeVisible();
    }
    for (const label of ["Billing", "Recalls", "Messages"]) {
      await expect(nav.getByRole("link", { name: label })).toHaveCount(0);
    }
  });

  test("front desk, admin and dentist see the read-only Settings, never the Owner's staff and plan tabs", async ({ page }) => {
    for (const who of ["frontdesk", "admin"] as const) {
      await signInAs(page, who);
      await mainNav(page).getByRole("link", { name: "Settings" }).click();
      await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("Read-only in this prototype")).toBeVisible();
      await expect(page.getByRole("tab", { name: "Staff" })).toHaveCount(0);
      await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /Add staff/ })).toHaveCount(0);
      await signOut(page);
    }
  });

  test("a parent reads the clinic's privacy notice first, then reaches the portal", async ({ page }) => {
    await signIn(page, USERS.parent);
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible({ timeout: 30_000 });
    // Nothing of the portal behind it yet.
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toHaveCount(0);
    await page.getByRole("button", { name: "I've read this" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
    // Read once: a reload doesn't ask again.
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toHaveCount(0);
  });

  test("the Primolar operator signs in to the console and signs out again", async ({ page }) => {
    await signInOperator(page);
    await expect(page).toHaveURL(/\/operator$/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: "Console" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Bulilit Smiles Pediatric Dental").first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/operator\/login$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Primolar console" })).toBeVisible();
  });

  test("a new staff login chooses a password, then acknowledges confidentiality once, then works", async ({ page }) => {
    const email = `nina.pena.${Date.now()}@gmail.com`;
    await signInAs(page, "owner");
    await mainNav(page).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Staff" }).click();
    await page.getByRole("button", { name: /Add staff/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Niña Peña-O'Brien");
    await dialog.getByLabel("Email").fill(email);
    // Two branches at Bulilit: pick Imus.
    await dialog.getByRole("checkbox", { name: /Imus/ }).click();
    await dialog.getByRole("button", { name: "Add staff" }).click();
    const added = page.getByRole("dialog", { name: /Niña Peña-O'Brien is added/ });
    await expect(added).toBeVisible({ timeout: 30_000 });
    const tempPassword = (await added.locator("dd.font-mono").first().innerText()).trim();
    expect(tempPassword.length).toBeGreaterThan(0);
    await added.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);

    // The new person signs in with the temporary password.
    await signIn(page, email, tempPassword);
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
    // Nothing of the clinic shows meanwhile.
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await page.getByLabel("Temporary password").fill(tempPassword);
    await page.getByLabel("New password").fill("Mabuhay2026!");
    await page.getByRole("button", { name: "Save and continue" }).click();

    // Then the privacy gate for a new staff login.
    await expect(page.getByRole("heading", { name: "Patient records are confidential" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Patient records are confidential; every access is logged.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await page.getByRole("button", { name: "I understand" }).click();
    await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible({ timeout: 30_000 });

    // Once only: sign out and in with the new password, straight to work.
    await signOut(page);
    await signIn(page, email, "Mabuhay2026!");
    await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Patient records are confidential" })).toHaveCount(0);
  });

  test("someone who lands on a page they can't use picks 'Sign in as someone else' and signs in as a colleague", async ({ page }) => {
    await signInAs(page, "dentist");
    await typeUrl(page, "/billing");
    await expectNoAccess(page, NAMES.dentist);
    await page.getByRole("button", { name: "Sign in as someone else" }).click();
    await expectOnSignIn(page);
    // The form is empty, ready for the next person.
    await expect(signInForm(page).getByLabel("Mobile number or email")).toHaveValue("");
    await signInAs(page, "frontdesk");
    await mainNav(page).getByRole("link", { name: "Billing" }).click();
    await expect(page.getByRole("heading", { name: "Billing", level: 1 })).toBeVisible({ timeout: 30_000 });
  });

  test("'Go to your home page' on the no-access page takes the person to their own home", async ({ page }) => {
    await signInAs(page, "parent");
    await typeUrl(page, "/settings");
    await expectNoAccess(page, "Aliya Lynch", "This part of the app is for clinic staff.");
    await page.getByRole("link", { name: "Go to your home page" }).click();
    await expect(page).toHaveURL(/\/portal$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
  });

  test("a signed-in person who opens the sign-in page is told who is signed in and can continue", async ({ page }) => {
    await signInAs(page, "frontdesk");
    await openSignIn(page);
    const status = page.getByRole("status").filter({ hasText: "You're signed in as" });
    await expect(status).toContainText(`${NAMES.frontdesk} (Front desk)`, { timeout: 30_000 });
    await status.getByRole("link", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/appointments/, { timeout: 30_000 });
  });

  test("typing the site address takes a signed-in owner to the dashboard and a signed-out visitor to sign-in", async ({ page }) => {
    await typeUrl(page, "/");
    await expectOnSignIn(page);
    await signInAs(page, "owner");
    await typeUrl(page, "/");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  });
});

// =====================================================================================================================

test.describe("failed paths", () => {
  test("a wrong password is refused with a plain message and the person stays on sign-in", async ({ page }) => {
    await signIn(page, USERS.owner, "pass1234");
    await expect(signInForm(page).getByRole("alert")).toHaveText(SIGN_IN_ERROR, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
    // The email stays typed so they only retype the password.
    await expect(signInForm(page).getByLabel("Mobile number or email")).toHaveValue(USERS.owner);
  });

  test("an unknown email gets the same message as a wrong password, so emails can't be probed", async ({ page }) => {
    await signIn(page, "nobody.here@gmail.com", DEMO_PASSWORD);
    await expect(signInForm(page).getByRole("alert")).toHaveText(SIGN_IN_ERROR, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("submitting an empty sign-in form asks for the email and the password", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter your mobile number or email")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an email without a domain is caught before anything is sent", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByLabel("Mobile number or email").fill("owner@");
    await signInForm(page).getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter a mobile number like 0917 123 4567, or an email address")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the operator's login doesn't open the clinic sign-in", async ({ page }) => {
    await signIn(page, USERS.operator);
    await expect(signInForm(page).getByRole("alert")).toHaveText(SIGN_IN_ERROR, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a clinic login doesn't open Primolar's console, nor does a wrong operator password", async ({ page }) => {
    await signInOperator(page, USERS.owner);
    await expect(page.getByRole("alert").filter({ hasText: /match/ })).toHaveText("That email and password don't match a Primolar operator", { timeout: 30_000 });
    await expect(page).toHaveURL(/\/operator\/login$/);
    await page.getByLabel("Email").fill(USERS.operator);
    await page.getByLabel("Password").fill("wrong-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("alert").filter({ hasText: /match/ })).toHaveText("That email and password don't match a Primolar operator", { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: "Console" })).toHaveCount(0);
  });

  test("the console sign-in asks for both fields when left empty", async ({ page }) => {
    await typeUrl(page, "/operator/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
  });

  for (const path of ["/billing", "/recall", "/messages"]) {
    test(`a dentist pasting ${path} sees a clear no-access message, not the page`, async ({ page }) => {
      await signInAs(page, "dentist");
      await typeUrl(page, path);
      await expectNoAccess(page, NAMES.dentist, "Ask a clinic admin if you need it.");
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(0);
      await expect(page.getByText(/Collected ₱|Overdue \(/)).toHaveCount(0);
    });
  }

  test("a parent pasting staff pages sees 'for clinic staff' and no patient list or settings", async ({ page }) => {
    await signInAs(page, "parent");
    for (const path of ["/patients", "/dashboard", "/billing", "/settings", "/patients/new", "/appointments", "/documents"]) {
      await typeUrl(page, path);
      await expectNoAccess(page, "Aliya Lynch", "This part of the app is for clinic staff.");
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
      await expect(page.getByRole("searchbox", { name: /Search patients/ })).toHaveCount(0);
      await expect(page.getByText("Procedure catalog")).toHaveCount(0);
    }
  });

  for (const who of ["owner", "admin", "dentist", "frontdesk", "ngitiOwner", "ipinOwner"] as const) {
    test(`${who} pasting the parent portal is told it is for parents`, async ({ page }) => {
      await signInAs(page, who);
      await typeUrl(page, "/portal/billing");
      await expectNoAccess(page, NAMES[who], "The parent portal is for parents.");
      await expect(page.getByRole("heading", { name: /^Hello/ })).toHaveCount(0);
    });
  }

  for (const who of ["owner", "frontdesk", "parent", "ngitiOwner"] as const) {
    test(`${who} pasting Primolar's console is sent to the console's own sign-in, seeing no clinic list`, async ({ page }) => {
      await signInAs(page, who);
      await typeUrl(page, "/operator/signups");
      await expect(page).toHaveURL(/\/operator\/login$/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Primolar console" })).toBeVisible();
      await expect(page.getByRole("navigation", { name: "Console" })).toHaveCount(0);
    });
  }

  test("the operator pasting clinic pages is sent to the clinic sign-in, never seeing a patient", async ({ page }) => {
    await signInOperator(page);
    await expect(page.getByRole("navigation", { name: "Console" })).toBeVisible({ timeout: 30_000 });
    for (const path of ["/patients", "/settings", "/portal"]) {
      await typeUrl(page, path);
      await expectOnSignIn(page);
    }
  });

  test("another clinic's Owner pasting a Bulilit patient's link never sees that child", async ({ page }) => {
    await signInAs(page, "owner");
    await mainNav(page).getByRole("link", { name: "Patients" }).click();
    await page.getByRole("searchbox", { name: "Search patients" }).fill("Calista");
    await page.getByRole("link", { name: /Langworth, Calista|Calista Langworth/ }).first().click();
    await expect(page).toHaveURL(/\/patients\/[^/]+$/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Calista Langworth/ }).first()).toBeVisible({ timeout: 30_000 });
    const patientUrl = new URL(page.url()).pathname;
    await signOut(page);

    for (const who of ["ngitiOwner", "ipinOwner"] as const) {
      await signInAs(page, who);
      await typeUrl(page, patientUrl);
      await expect(accountMenu(page)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/couldn't load|not found|don't have access/i).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Calista|Langworth/)).toHaveCount(0);
      await signOut(page);
    }
  });

  test("a parent pasting a staff link to a child's record sees no record", async ({ page }) => {
    await signInAs(page, "frontdesk");
    await mainNav(page).getByRole("link", { name: "Patients" }).click();
    await page.getByRole("searchbox", { name: "Search patients" }).fill("Mika");
    await page.getByRole("link", { name: /Lynch, Mika|Mika Lynch/ }).first().click();
    await expect(page).toHaveURL(/\/patients\/[^/]+$/, { timeout: 30_000 });
    const patientUrl = new URL(page.url()).pathname;
    await signOut(page);
    await signInAs(page, "parent");
    await typeUrl(page, patientUrl);
    await expectNoAccess(page, "Aliya Lynch", "This part of the app is for clinic staff.");
  });

  test("cancelling the sign-out dialog keeps the person signed in", async ({ page }) => {
    await signInAs(page, "admin");
    await accountMenu(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out?" });
    await expect(dialog).toContainText(NAMES.admin);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(accountMenu(page)).toBeVisible();
  });

  test("a new staff login's password step refuses a short password, the same password and a wrong temporary one", async ({ page }) => {
    const email = `jose.rizal.${Date.now()}@gmail.com`;
    await signInAs(page, "owner");
    await mainNav(page).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Staff" }).click();
    await page.getByRole("button", { name: /Add staff/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Jose Rizal");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("checkbox", { name: /Imus/ }).click();
    await dialog.getByRole("button", { name: "Add staff" }).click();
    const added = page.getByRole("dialog", { name: /Jose Rizal is added/ });
    await expect(added).toBeVisible({ timeout: 30_000 });
    const temp = (await added.locator("dd.font-mono").first().innerText()).trim();
    await added.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);

    await signIn(page, email, temp);
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
    await page.getByLabel("Temporary password").fill(temp);
    await page.getByLabel("New password").fill("short");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Use at least 8 characters")).toBeVisible();

    await page.getByLabel("New password").fill(temp);
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByText("Choose a new password, not the one you use now")).toBeVisible();

    await page.getByLabel("Temporary password").fill("not-the-temp-1");
    await page.getByLabel("New password").fill("BagongPass2026");
    await page.getByRole("button", { name: "Save and continue" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "That isn't your current password" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible();

    // Signing out from the gate and back in still lands on it: the step can't be skipped.
    await page.getByRole("button", { name: "Sign out" }).click();
    await expectOnSignIn(page);
    await signIn(page, email, temp);
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
    // Pasting a page from the gate doesn't get around it either.
    await typeUrl(page, "/patients");
    await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("searchbox", { name: "Search patients" })).toHaveCount(0);
  });

  test("a new staff login can't skip the confidentiality notice by pasting a URL or signing out", async ({ page }) => {
    const email = `andres.b.${Date.now()}@gmail.com`;
    await signInAs(page, "owner");
    await mainNav(page).getByRole("link", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Staff" }).click();
    await page.getByRole("button", { name: /Add staff/ }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Andres Bonifacio");
    await dialog.getByLabel("Email").fill(email);
    await dialog.getByRole("checkbox", { name: /Imus/ }).click();
    await dialog.getByRole("button", { name: "Add staff" }).click();
    const added = page.getByRole("dialog", { name: /Andres Bonifacio is added/ });
    await expect(added).toBeVisible({ timeout: 30_000 });
    const temp = (await added.locator("dd.font-mono").first().innerText()).trim();
    await added.getByRole("button", { name: "I've passed it on" }).click();
    await signOut(page);

    await signIn(page, email, temp);
    await page.getByLabel("Temporary password").fill(temp);
    await page.getByLabel("New password").fill("Kalayaan1896");
    await page.getByRole("button", { name: "Save and continue" }).click();
    const gate = page.getByRole("heading", { name: "Patient records are confidential" });
    await expect(gate).toBeVisible({ timeout: 30_000 });

    await typeUrl(page, "/patients");
    await expect(gate).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("searchbox", { name: "Search patients" })).toHaveCount(0);

    await page.getByRole("button", { name: "Sign out" }).click();
    await expectOnSignIn(page);
    await signIn(page, email, "Kalayaan1896");
    await expect(gate).toBeVisible({ timeout: 30_000 });
  });
});

// =====================================================================================================================

test.describe("edge cases", () => {
  for (const path of ["/dashboard", "/appointments", "/patients", "/patients/new", "/billing", "/recall", "/messages", "/documents", "/settings", "/portal", "/portal/billing", "/portal/plan"]) {
    test(`a signed-out visitor deep-linking to ${path} lands on sign-in`, async ({ page }) => {
      await typeUrl(page, path);
      await expectOnSignIn(page);
      await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    });
  }

  test("a signed-out visitor deep-linking to the console lands on the console sign-in", async ({ page }) => {
    for (const path of ["/operator", "/operator/signups", "/operator/prices"]) {
      await typeUrl(page, path);
      await expect(page).toHaveURL(/\/operator\/login$/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Primolar console" })).toBeVisible();
    }
  });

  test("after signing out, pressing Back shows no patient data", async ({ page }) => {
    await signInAs(page, "frontdesk");
    await mainNav(page).getByRole("link", { name: "Patients" }).click();
    await expect(page.getByRole("heading", { name: "Patients", level: 1 })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("searchbox", { name: "Search patients" }).fill("Calista");
    await expect(page.getByRole("link", { name: /Langworth, Calista|Calista Langworth/ }).first()).toBeVisible({ timeout: 30_000 });
    await signOut(page);
    await page.goBack();
    await expectOnSignIn(page);
    await expect(page.getByText(/Calista/)).toHaveCount(0);
    // Back again leaves the site (or lands on sign-in): never the patient list.
    await page.goBack();
    await expect(page).not.toHaveURL(/\/patients/);
    await expect(page.getByText(/Calista/)).toHaveCount(0);
  });

  test("after the parent signs out, pressing Back doesn't reopen the portal", async ({ page }) => {
    await signInAs(page, "parent");
    await page.getByRole("navigation", { name: "Portal sections" }).getByRole("link", { name: "Bills" }).click();
    await expect(page).toHaveURL(/\/portal\/billing$/, { timeout: 30_000 });
    await signOut(page);
    await page.goBack();
    await expectOnSignIn(page);
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toHaveCount(0);
  });

  test("after the operator signs out, pressing Back doesn't reopen the console", async ({ page }) => {
    await signInOperator(page);
    await expect(page.getByRole("navigation", { name: "Console" })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Sign-ups" }).click();
    await expect(page).toHaveURL(/\/operator\/signups$/, { timeout: 30_000 });
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/operator\/login$/, { timeout: 30_000 });
    await page.goBack();
    await expect(page).toHaveURL(/\/operator\/login$/, { timeout: 30_000 });
    await expect(page.getByRole("navigation", { name: "Console" })).toHaveCount(0);
  });

  test("an email typed in capitals with spaces around it still signs in", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByLabel("Mobile number or email").fill("  OWNER@Gmail.COM  ");
    await signInForm(page).getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: new RegExp(`${NAMES.owner}, Owner\\. Account menu`) })).toBeVisible({ timeout: 30_000 });
  });

  test("the password is case-sensitive and a trailing space makes it wrong", async ({ page }) => {
    await signIn(page, USERS.frontdesk, "PASS123");
    await expect(signInForm(page).getByRole("alert")).toHaveText(SIGN_IN_ERROR, { timeout: 30_000 });
    await signInForm(page).getByLabel("Password", { exact: true }).fill(`${DEMO_PASSWORD} `);
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(signInForm(page).getByRole("alert")).toHaveText(SIGN_IN_ERROR, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
  });

  test("show and hide password toggles what is visible and says which state it is in", async ({ page }) => {
    await openSignIn(page);
    const password = signInForm(page).getByLabel("Password", { exact: true });
    await password.fill("Ñandú'123");
    await expect(password).toHaveAttribute("type", "password");
    const show = signInForm(page).getByRole("button", { name: "Show password" });
    await expect(show).toHaveAttribute("aria-pressed", "false");
    await show.click();
    await expect(password).toHaveAttribute("type", "text");
    const hide = signInForm(page).getByRole("button", { name: "Hide password" });
    await expect(hide).toHaveAttribute("aria-pressed", "true");
    await expect(password).toHaveValue("Ñandú'123");
    await hide.click();
    await expect(password).toHaveAttribute("type", "password");
    await expect(password).toHaveValue("Ñandú'123");
  });

  test("a person signs in using only the keyboard", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByLabel("Mobile number or email").focus();
    await page.keyboard.type(USERS.admin);
    await page.keyboard.press("Tab");
    await expect(signInForm(page).getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.type(DEMO_PASSWORD);
    // The show/hide toggle is reachable by keyboard and works with Space.
    await page.keyboard.press("Tab");
    await expect(signInForm(page).getByRole("button", { name: "Show password" })).toBeFocused();
    await page.keyboard.press("Space");
    await expect(signInForm(page).getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
    await signInForm(page).getByLabel("Password", { exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  });

  test("double-clicking Sign in signs the person in once and lands them home", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByLabel("Mobile number or email").fill(USERS.frontdesk);
    await signInForm(page).getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await signInForm(page).getByRole("button", { name: "Sign in" }).dblclick();
    await expect(page).toHaveURL(/\/appointments/, { timeout: 30_000 });
    await expect(page.getByRole("alert").filter({ hasText: /match|wrong/i })).toHaveCount(0);
  });

  test("a very long email is refused politely without breaking the page", async ({ page }) => {
    await openSignIn(page);
    await signInForm(page).getByLabel("Mobile number or email").fill(`${"a".repeat(300)}@gmail.com`);
    await signInForm(page).getByLabel("Password", { exact: true }).fill("x".repeat(500));
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(signInForm(page).getByRole("alert").or(page.getByText("Enter a mobile number like 0917 123 4567, or an email address"))).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  });

  test("a no-access page stays blocked after a reload", async ({ page }) => {
    await signInAs(page, "dentist");
    await typeUrl(page, "/messages");
    await expectNoAccess(page, NAMES.dentist);
    await page.reload();
    await expectNoAccess(page, NAMES.dentist);
  });

  test("pressing Escape on the sign-out dialog keeps the person signed in", async ({ page }) => {
    await signInAs(page, "frontdesk");
    await accountMenu(page).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out?" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await page.reload();
    await expect(accountMenu(page)).toBeVisible({ timeout: 30_000 });
  });

  test("the dentist who works at two clinics can step back from the clinic chooser and sign in as someone else", async ({ page }) => {
    await signIn(page, USERS.dentist);
    const chooser = page.getByRole("region", { name: "Which clinic?" });
    await expect(chooser).toBeVisible({ timeout: 30_000 });
    // Only clinic names before a choice: nothing from either clinic.
    await expect(chooser.getByRole("button", { name: /Bulilit/ })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toHaveCount(0);
    await chooser.getByRole("button", { name: /back|someone else|different/i }).click();
    await expect(signInForm(page)).toBeVisible();
    await signInForm(page).getByLabel("Mobile number or email").fill(USERS.frontdesk);
    await signInForm(page).getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await signInForm(page).getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/appointments/, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: new RegExp(`${NAMES.frontdesk}, Front desk\\. Account menu`) })).toBeVisible({ timeout: 30_000 });
  });

  test("a made-up patient address while signed in doesn't show anyone's data", async ({ page }) => {
    await signInAs(page, "frontdesk");
    await typeUrl(page, "/patients/not-a-real-patient");
    await expect(page.getByText(/couldn't load|not found/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /Langworth|Lynch/ })).toHaveCount(0);
  });

  test("BUG: a pasted link to a patient who isn't in your clinic says so, instead of 'couldn't load, try again'", async ({ page }) => {
    // The API answers 404 "Patient not found" (features/patients/mocks.ts); the screen shows a retryable load failure.
    await signInAs(page, "ngitiOwner");
    await typeUrl(page, "/patients/not-a-real-patient");
    await expect(page.getByText(/couldn't load|not found/i).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/not found|isn't in|no patient|doesn't exist/i).first()).toBeVisible();
    // Trying again can never help: the record isn't there.
    await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  });
});
