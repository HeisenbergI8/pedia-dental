import { expect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, expectSignedIn, signIn, signInOperator } from "./support/users";

/*
 * Pilot tests for Primolar's operator console (operator@primolar.demo at /operator/login).
 * UI only: every step is what a person would type, click or read on screen.
 */

// ---------- helpers (own to this spec) ----------

const CONSOLE_ERROR = "That email and password don't match a Primolar operator";
const CLINIC_ERROR = "That mobile number or email and password don't match a demo account";
const SEEDED_PATIENT = "Calista Langworth"; // a Bulilit patient: the operator must never see her

/** Signs in to the console and waits for the clinic list. */
async function openConsole(page: Page) {
  await signInOperator(page);
  await expect(page.getByRole("heading", { name: "Clinic accounts", level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(accountsTable(page)).toBeVisible();
}

const accountsTable = (page: Page) => page.getByRole("table", { name: "Clinic accounts" });
const rowOf = (page: Page, clinic: string) => accountsTable(page).getByRole("row").filter({ has: page.getByRole("link", { name: clinic, exact: true }) });

/** Clicks the clinic's name in the list and waits for its page. */
async function openClinic(page: Page, clinic: string) {
  await accountsTable(page).getByRole("link", { name: clinic, exact: true }).click();
  await expect(page.getByRole("heading", { name: clinic, level: 1 })).toBeVisible();
}

async function goToNav(page: Page, label: "Clinic accounts" | "Sign-ups" | "Price list") {
  await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: label }).click();
}

const paymentRows = (page: Page) => page.getByRole("table", { name: "Payments to Primolar" }).locator("tbody tr");

/** Picks an option from a Radix select by its label. */
async function choose(scope: Page | Locator, page: Page, label: string, option: string) {
  await scope.getByLabel(label, { exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

type NewClinic = {
  name: string;
  contactEmail: string;
  tin?: string;
  branch?: string;
  address?: string;
  phone?: string;
  owner: string;
  ownerEmail: string;
  plan?: "Small" | "Mid" | "Big";
};

const uid = () => Math.random().toString(36).slice(2, 7);

function aClinic(over: Partial<NewClinic> = {}): NewClinic {
  const id = uid();
  return {
    name: `Ngipin Masaya ${id}`,
    contactEmail: `hello-${id}@masaya.test`,
    tin: "123456789",
    branch: "Tagaytay",
    address: "5 Calamba Road, Tagaytay, Cavite",
    phone: "(046) 413 0000",
    owner: "Dr. Carlo Mendoza",
    ownerEmail: `owner-${id}@masaya.test`,
    ...over,
  };
}

async function openNewClinicDialog(page: Page) {
  await page.getByRole("button", { name: "New clinic account" }).click();
  const dialog = page.getByRole("dialog", { name: "New clinic account" });
  await expect(dialog.getByLabel("Clinic name")).toBeVisible();
  return dialog;
}

/** Fills the phone sign-up form like the operator would, default look. */
async function fillNewClinic(dialog: Locator, c: NewClinic, { tick = true } = {}) {
  await dialog.getByLabel("Clinic name").fill(c.name);
  await dialog.getByLabel("Contact email").fill(c.contactEmail);
  if (c.tin !== undefined) await dialog.getByLabel("TIN").fill(c.tin);
  if (c.plan) await dialog.getByRole("radio", { name: new RegExp(`^${c.plan}`) }).click();
  if (c.branch !== undefined) await dialog.getByLabel("Branch name").fill(c.branch);
  if (c.address !== undefined) await dialog.getByLabel("Address").fill(c.address);
  if (c.phone !== undefined) await dialog.getByLabel("Phone").fill(c.phone);
  await dialog.getByLabel("Full name").fill(c.owner);
  await dialog.getByLabel("Email", { exact: true }).fill(c.ownerEmail);
  await dialog.getByRole("radio", { name: /^Use the default look/ }).click();
  if (tick) await dialog.getByRole("checkbox", { name: /Signed agreement on file/ }).check();
}

/** Reads the one-time temporary password off the success dialog. */
async function readTemporaryPassword(page: Page, clinic: string) {
  const done = page.getByRole("dialog", { name: `${clinic} is on Primolar` });
  await expect(done).toBeVisible();
  await expect(done.getByText("It is shown only once.")).toBeVisible();
  const password = (await done.locator("dt", { hasText: "Temporary password" }).locator("xpath=following-sibling::dd[1]").innerText()).trim();
  expect(password.length).toBeGreaterThanOrEqual(8);
  return { done, password };
}

async function openHagikgik(page: Page) {
  await page.getByRole("link", { name: "Hagikgik Kids Dental" }).click();
  await expect(page.getByRole("heading", { name: "Hagikgik Kids Dental", level: 1 })).toBeVisible();
  await expect(page.getByText("PRM-HGK2-7QXM", { exact: false })).toBeVisible();
}

async function signOutOfConsole(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/operator\/login$/);
}

/** First sign-in with a temporary password: the clinic asks for a new one. */
async function chooseOwnPassword(page: Page, temporary: string, next = "Bago-Password-2026") {
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Temporary password").fill(temporary);
  await page.getByLabel("New password").fill(next);
  await page.getByRole("button", { name: "Save and continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeHidden({ timeout: 15_000 });
}

/** The clinic's confidentiality notice every new login acknowledges once. */
async function acknowledgeNotice(page: Page) {
  await expect(page.getByRole("heading", { name: "Patient records are confidential" })).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "I understand" }).click();
  await expect(page.getByRole("heading", { name: "Patient records are confidential" })).toBeHidden({ timeout: 15_000 });
}

const loginAlert = (page: Page) => page.getByRole("alert").filter({ hasText: /match|paused/ });

test.describe.configure({ timeout: 120_000 });

// ---------- tests ----------

test.describe("happy paths", () => {
  test("operator signs in and sees every clinic with its plan, Owner and usage counts", async ({ page }) => {
    await openConsole(page);
    const table = accountsTable(page);
    for (const header of ["Clinic", "Status", "Plan", "Owner", "Branches", "Staff logins", "Patients"]) {
      await expect(table.getByRole("columnheader", { name: header, exact: true })).toBeVisible();
    }
    const bulilit = rowOf(page, "Bulilit Smiles Pediatric Dental");
    await expect(bulilit).toContainText("Mid");
    await expect(bulilit).toContainText("Dr. Paolo Villanueva");
    await expect(bulilit).toContainText("owner@gmail.com");
    await expect(bulilit).toContainText(/\d+ of 3/);
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("Small");
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("5 of 5");
    await expect(rowOf(page, "Ipin Kids Dental")).toContainText("Dr. Lara Santiago");
    await expect(table.getByRole("row")).toHaveCount(4); // header + 3 seeded clinics
  });

  test("operator opens a clinic and sees counts and billing but never a patient record", async ({ page }) => {
    await openConsole(page);
    await expect(page.getByText(SEEDED_PATIENT)).toHaveCount(0);
    await openClinic(page, "Bulilit Smiles Pediatric Dental");
    await expect(page.getByRole("heading", { name: "Plan", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Subscription", exact: true })).toBeVisible();
    await expect(page.getByText("Patients without consent recorded")).toBeVisible();
    await expect(page.getByText(SEEDED_PATIENT)).toHaveCount(0);
    await expect(page.getByText(/Parent|Guardian/)).toHaveCount(0);
  });

  test("operator records Ipin's overdue month and it is no longer overdue after a reload", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ipin Kids Dental");
    await expect(page.getByText("Overdue, in grace")).toBeVisible();
    await expect(page.getByText(/pay by/)).toBeVisible();
    const before = await paymentRows(page).count();

    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await expect(dialog).toContainText("The next due date stays on Ipin Kids Dental's schedule");
    await choose(dialog, page, "Paid by", "GCash");
    await dialog.getByLabel("Reference (optional)").fill("GC-2026-1014-ÑA");
    await dialog.getByRole("button", { name: "Record payment" }).click();

    await expect(page.getByText("Payment recorded for Ipin Kids Dental")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(paymentRows(page)).toHaveCount(before + 1);
    await expect(page.getByText("Overdue, in grace")).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Ipin Kids Dental", level: 1 })).toBeVisible();
    await expect(paymentRows(page)).toHaveCount(before + 1);
    await expect(page.getByText("Overdue, in grace")).toHaveCount(0);
  });

  test("operator creates a clinic signed up by phone and its Owner signs in with the one-time password", async ({ page }) => {
    const c = aClinic({ plan: "Mid" });
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await expect(dialog.getByRole("region", { name: "Amount due" })).toContainText("Total");
    await dialog.getByRole("button", { name: "Create clinic account" }).click();

    const { done, password } = await readTemporaryPassword(page, c.name);
    await expect(done).toContainText(c.ownerEmail);
    await expect(done.getByText(/Switch-user PIN/)).toBeVisible();
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(done).toBeHidden();

    const row = rowOf(page, c.name);
    await expect(row).toContainText("Mid");
    await expect(row).toContainText(c.owner);
    await expect(row).toContainText("1 of 3");
    await expect(row).toContainText("Active");

    // The Owner signs in on the clinic side with the temporary password, then picks their own.
    await signOutOfConsole(page);
    await signIn(page, c.ownerEmail, password);
    await chooseOwnPassword(page, password);
    await acknowledgeNotice(page);
    await expectSignedIn(page);
    await expect(page.getByText(c.name).first()).toBeVisible();
  });

  test("operator approves the Hagikgik sign-up after recording its setup fee", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await expect(page.getByRole("button", { name: "Waiting (1)" })).toBeVisible();
    await page.getByRole("link", { name: "Hagikgik Kids Dental" }).click();
    await expect(page.getByRole("heading", { name: "Hagikgik Kids Dental", level: 1 })).toBeVisible();

    await page.getByRole("button", { name: "Record payment" }).click();
    const pay = page.getByRole("dialog", { name: "Record payment" });
    await pay.getByLabel("Reference (optional)").fill("BDO-778812");
    await pay.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await expect(page.getByText(/ref\. BDO-778812/)).toBeVisible();

    await page.getByRole("button", { name: "Approve and create clinic" }).click();
    const { done, password } = await readTemporaryPassword(page, "Hagikgik Kids Dental");
    await expect(done).toContainText("owner@hagikgik.demo");
    await done.getByRole("button", { name: "I've passed it on" }).click();

    await page.getByRole("link", { name: "Open the clinic account" }).click();
    await expect(page.getByRole("heading", { name: "Hagikgik Kids Dental", level: 1 })).toBeVisible();
    await expect(page.getByText("Design in progress").first()).toBeVisible();

    await goToNav(page, "Sign-ups");
    await expect(page.getByRole("button", { name: "Waiting (0)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approved (1)" })).toBeVisible();

    await signOutOfConsole(page);
    await signIn(page, "owner@hagikgik.demo", password);
    await chooseOwnPassword(page, password);
    await acknowledgeNotice(page);
    await expectSignedIn(page);
  });

  test("operator rejects a sign-up with a reason and finds it under Rejected", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await openHagikgik(page);
    await page.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog", { name: "Reject Hagikgik Kids Dental?" });
    await dialog.getByLabel("Reason for the client").fill("We can't verify the TIN. Pakisubukan ulit with the BIR certificate.");
    await dialog.getByRole("button", { name: "Reject sign-up" }).click();
    await expect(page.getByText("Hagikgik Kids Dental rejected")).toBeVisible();
    await expect(page.getByText("We can't verify the TIN. Pakisubukan ulit with the BIR certificate.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toHaveCount(0);

    await goToNav(page, "Sign-ups");
    await page.getByRole("button", { name: "Rejected (1)" }).click();
    await expect(page.getByRole("link", { name: "Hagikgik Kids Dental" })).toBeVisible();
  });

  test("operator upgrades Ngiti to Mid and the list shows the new plan", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ngiti Kids Dental");
    const save = page.getByRole("button", { name: "Save plan" });
    await expect(save).toBeDisabled();
    await choose(page, page, "Plan", "Mid");
    await save.click();
    await expect(page.getByText("Ngiti Kids Dental is on the Mid plan")).toBeVisible();
    await page.getByRole("link", { name: "Clinic accounts" }).first().click();
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("Mid");
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("5 of 20");
  });

  test("operator can't downgrade Bulilit to Small while it uses more than Small includes (B12 decision 12)", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Bulilit Smiles Pediatric Dental");
    await choose(page, page, "Plan", "Small");
    await expect(page.getByText(/the Owner must archive branches or deactivate logins before the plan can go down/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save plan" })).toBeDisabled();
  });

  test("operator pauses Ipin so its Owner can't sign in, then reactivates it", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Pause account" }).click();
    const confirm = page.getByRole("dialog", { name: "Pause Ipin Kids Dental?" });
    await expect(confirm).toContainText("Parents keep read-only access");
    await confirm.getByRole("button", { name: "Pause Ipin Kids Dental" }).click();
    await expect(page.getByText("Ipin Kids Dental is paused")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reactivate account" })).toBeVisible();

    await signOutOfConsole(page);
    await signIn(page, USERS.ipinOwner);
    await expect(page.getByRole("alert").filter({ hasText: "paused" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);

    await openConsole(page);
    await expect(rowOf(page, "Ipin Kids Dental")).toContainText("Paused");
    await openClinic(page, "Ipin Kids Dental");
    await page.getByRole("button", { name: "Reactivate account" }).click();
    await expect(page.getByText("Ipin Kids Dental is active again")).toBeVisible();

    await signOutOfConsole(page);
    await signIn(page, USERS.ipinOwner);
    await expectSignedIn(page);
  });

  test("operator transfers Ngiti's ownership and the list shows the new Owner", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ngiti Kids Dental");
    await page.getByRole("button", { name: "Transfer ownership" }).click();
    const dialog = page.getByRole("dialog", { name: "Transfer ownership of Ngiti Kids Dental" });
    await expect(dialog.getByRole("button", { name: "Transfer ownership" })).toBeDisabled();
    await choose(dialog, page, "New Owner", "Dr. Ana Reyes · Dentist");
    await expect(dialog).toContainText("Dr. Ana Reyes becomes the Owner. Dr. Bea Lim keeps their job");
    await dialog.getByRole("button", { name: "Transfer ownership" }).click();
    await expect(page.getByText("Dr. Ana Reyes now owns Ngiti Kids Dental")).toBeVisible();
    await page.getByRole("link", { name: "Clinic accounts" }).first().click();
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("Dr. Ana Reyes");
  });

  test("operator stays signed in after a reload and signing out locks the console", async ({ page }) => {
    await openConsole(page);
    await page.reload();
    await expect(accountsTable(page)).toBeVisible();
    await signOutOfConsole(page);
    await page.goto("/operator");
    await expect(page).toHaveURL(/\/operator\/login$/);
    await expect(page.getByRole("heading", { name: "Primolar console" })).toBeVisible();
  });
});

test.describe("failed paths", () => {
  test("operator types the wrong password and is told plainly, without getting in", async ({ page }) => {
    await signInOperator(page, USERS.operator, "wrong-pass");
    await expect(loginAlert(page)).toHaveText(CONSOLE_ERROR);
    await expect(page).toHaveURL(/\/operator\/login$/);
  });

  test("an unknown email gets the same message as a wrong password", async ({ page }) => {
    await signInOperator(page, "nobody@primolar.demo", DEMO_PASSWORD);
    await expect(loginAlert(page)).toHaveText(CONSOLE_ERROR);
  });

  test("signing in with empty fields shows what to fill in", async ({ page }) => {
    await page.goto("/operator/login");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(page.getByText("Enter your password")).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveAttribute("aria-invalid", "true");
  });

  test("a malformed email is refused before sending", async ({ page }) => {
    await signInOperator(page, "operator@", DEMO_PASSWORD);
    await expect(page.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(page).toHaveURL(/\/operator\/login$/);
  });

  test("a clinic Owner can't sign in to the Primolar console", async ({ page }) => {
    await signInOperator(page, USERS.owner, DEMO_PASSWORD);
    await expect(loginAlert(page)).toHaveText(CONSOLE_ERROR);
    await expect(page.getByRole("table", { name: "Clinic accounts" })).toHaveCount(0);
  });

  test("the operator can't sign in to the clinic app", async ({ page }) => {
    await signIn(page, USERS.operator, DEMO_PASSWORD);
    await expect(loginAlert(page)).toHaveText(CLINIC_ERROR);
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a signed-in clinic Owner who types the console address is sent to the console sign-in", async ({ page }) => {
    await signIn(page, USERS.owner);
    await expectSignedIn(page);
    await page.goto("/operator");
    await expect(page).toHaveURL(/\/operator\/login$/);
    await expect(accountsTable(page)).toHaveCount(0);
  });

  test("a signed-in operator who types the clinic address does not get into a clinic", async ({ page }) => {
    await openConsole(page);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
  });

  test("a signed-out person pasting a clinic account link lands on the console sign-in", async ({ page }) => {
    await page.goto("/operator/signups/signup_hagikgik");
    await expect(page).toHaveURL(/\/operator\/login$/);
    await expect(page.getByText("Dr. Bea Manalo")).toHaveCount(0);
  });

  test("creating a clinic with nothing filled in lists every missing field", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    for (const message of [
      "Enter the clinic's name",
      "Enter the clinic's email address, like hello@clinic.ph",
      "Enter the TIN like 123-456-789, with the branch code after it if there is one",
      "Enter the branch name",
      "Enter the branch address",
      "Enter the branch phone number",
      "Enter their full name",
      "Enter their email address, like name@example.com",
      "Tick this once you hold the agreement the Owner signed",
    ]) {
      await expect(dialog.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(dialog).toBeVisible();
  });

  test("a clinic name already on Primolar is refused, ignoring case and spaces", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, aClinic({ name: "  bulilit   SMILES pediatric dental " }));
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText(/A clinic called bulilit\s+SMILES pediatric dental is already on Primolar/)).toBeVisible();
    await expect(dialog.getByLabel("Clinic name")).toHaveAttribute("aria-invalid", "true");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(accountsTable(page).getByRole("row")).toHaveCount(4);
  });

  test("a contact email a waiting sign-up already uses is refused under its field", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, aClinic({ contactEmail: "HELLO@hagikgik.demo" }));
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText("That contact email already belongs to a clinic on Primolar or one waiting to join.", { exact: false })).toBeVisible();
    await expect(dialog.getByLabel("Contact email")).toHaveAttribute("aria-invalid", "true");
  });

  test("a TIN with too few digits is refused", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, aClinic({ tin: "12345" }));
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText("Enter the TIN like 123-456-789, with the branch code after it if there is one")).toBeVisible();
    await expect(page.getByRole("dialog", { name: /is on Primolar/ })).toHaveCount(0);
  });

  test("creating a clinic without ticking the signed agreement is refused", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, aClinic(), { tick: false });
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText("Tick this once you hold the agreement the Owner signed")).toBeVisible();
    await expect(page.getByRole("dialog", { name: /is on Primolar/ })).toHaveCount(0);
  });

  test("choosing Use my own without a logo asks for the logo", async ({ page }) => {
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, aClinic());
    await dialog.getByRole("radio", { name: /^Use my own/ }).click();
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText("Add the clinic's logo, or choose Use the default look")).toBeVisible();
  });

  test("cancelling the new clinic form creates nothing", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("link", { name: c.name })).toHaveCount(0);
    await expect(accountsTable(page).getByRole("row")).toHaveCount(4);
  });

  test("Approve stays off until the setup fee is recorded", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await page.getByRole("link", { name: "Hagikgik Kids Dental" }).click();
    const approve = page.getByRole("button", { name: "Approve and create clinic" });
    await expect(approve).toBeDisabled();
    await expect(page.getByText(/Approve opens once the setup fee is recorded/)).toBeVisible();
  });

  test("rejecting without a reason is refused and Keep it leaves the sign-up waiting", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await openHagikgik(page);
    await page.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog", { name: "Reject Hagikgik Kids Dental?" });
    await dialog.getByLabel("Reason for the client").fill("    ");
    await dialog.getByRole("button", { name: "Reject sign-up" }).click();
    await expect(dialog.getByText("Tell the clinic why")).toBeVisible();
    await dialog.getByRole("button", { name: "Keep it" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toBeVisible();
  });

  test("cancelling the pause leaves the clinic active", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ngiti Kids Dental");
    await page.getByRole("button", { name: "Pause account" }).click();
    const dialog = page.getByRole("dialog", { name: "Pause Ngiti Kids Dental?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Pause account" })).toBeVisible();
    await page.getByRole("link", { name: "Clinic accounts" }).first().click();
    await expect(rowOf(page, "Ngiti Kids Dental")).toContainText("Active");
  });

  test("a payment reference over 60 characters or with no date is refused", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ipin Kids Dental");
    const before = await paymentRows(page).count();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByLabel("Reference (optional)").fill("R".repeat(61));
    await dialog.getByLabel("Paid on").fill("");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("Keep the reference under 60 characters")).toBeVisible();
    await expect(dialog.getByText("Enter the date it was paid")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(paymentRows(page)).toHaveCount(before);
    await expect(page.getByText("Overdue, in grace")).toBeVisible();
  });
});

test.describe("edge cases", () => {
  test("a clinic with a Filipino name, ñ and apostrophes is created and shown exactly", async ({ page }) => {
    const id = uid();
    const c = aClinic({ name: `Ngiping Niño's Dental Clinic ${id}`, owner: "Dra. Ma. Señora Dela Cruz-O'Neil", branch: "Parañaque", address: "12 Doña Soledad Ave., Parañaque" });
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    const { done } = await readTemporaryPassword(page, c.name);
    await expect(done).toContainText("Dra. Ma. Señora Dela Cruz-O'Neil can sign in now");
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(rowOf(page, c.name)).toContainText("Dra. Ma. Señora Dela Cruz-O'Neil");
    await openClinic(page, c.name);
    await expect(page.getByText("Dra. Ma. Señora Dela Cruz-O'Neil").first()).toBeVisible();
  });

  test("the temporary password can't be dismissed by Escape and is gone once passed on", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    const { done, password } = await readTemporaryPassword(page, c.name);
    await expect(done.getByRole("button", { name: "Close" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(done).toBeVisible();
    await expect(done.getByText(password)).toBeVisible();
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(page.getByText(password)).toHaveCount(0);
    await openClinic(page, c.name);
    await expect(page.getByText(password)).toHaveCount(0);
  });

  test("double-clicking Create clinic account makes only one clinic", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).dblclick();
    const { done } = await readTemporaryPassword(page, c.name);
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(accountsTable(page).getByRole("link", { name: c.name, exact: true })).toHaveCount(1);
    await expect(accountsTable(page).getByRole("row")).toHaveCount(5);
  });

  test("double-clicking Record payment records one month, not two", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ngiti Kids Dental");
    const before = await paymentRows(page).count();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByRole("button", { name: "Record payment" }).dblclick();
    await expect(page.getByText("Payment recorded for Ngiti Kids Dental")).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Ngiti Kids Dental", level: 1 })).toBeVisible();
    await expect(paymentRows(page)).toHaveCount(before + 1);
  });

  test("Escape closes the record-payment dialog without recording anything", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ipin Kids Dental");
    const before = await paymentRows(page).count();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByLabel("Reference (optional)").fill("half-typed");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Record payment" })).toBeFocused();
    await expect(paymentRows(page)).toHaveCount(before);
  });

  test("reloading in the middle of a new clinic form loses the draft and creates nothing", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await page.reload();
    await expect(accountsTable(page)).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("link", { name: c.name })).toHaveCount(0);
  });

  test("a clinic created twice by name is refused the second time", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    let dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    const { done } = await readTemporaryPassword(page, c.name);
    await done.getByRole("button", { name: "I've passed it on" }).click();

    dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, { ...c, name: c.name.toUpperCase(), contactEmail: `other-${uid()}@masaya.test` });
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    await expect(dialog.getByText(/is already on Primolar or waiting to join/)).toBeVisible();
  });

  test("operator signs in using only the keyboard", async ({ page }) => {
    await page.goto("/operator/login");
    await page.getByLabel("Email").focus();
    await page.keyboard.type(USERS.operator);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password")).toBeFocused();
    await page.keyboard.type(DEMO_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(accountsTable(page)).toBeVisible({ timeout: 15_000 });
  });

  test("an email typed with capitals and spaces still signs the operator in", async ({ page }) => {
    await signInOperator(page, "  Operator@Primolar.DEMO ", DEMO_PASSWORD);
    await expect(accountsTable(page)).toBeVisible({ timeout: 15_000 });
  });

  test("pressing Back after signing out does not show the clinic list again", async ({ page }) => {
    await openConsole(page);
    await openClinic(page, "Ngiti Kids Dental");
    await signOutOfConsole(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/operator\/login$/);
    await expect(page.getByRole("heading", { name: "Ngiti Kids Dental" })).toHaveCount(0);
  });

  test("a mistyped clinic link shows a clear not-found page", async ({ page }) => {
    await openConsole(page);
    await page.goto("/operator/accounts/clinic_does_not_exist");
    await expect(page.getByText("No such clinic account")).toBeVisible();
    await page.getByRole("link", { name: "Clinic accounts" }).first().click();
    await expect(accountsTable(page)).toBeVisible();
  });

  test("the Rejected and Approved tabs say so when they are empty", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await page.getByRole("button", { name: "Rejected (0)" }).click();
    await expect(page.getByText("No rejected sign-ups")).toBeVisible();
    await page.getByRole("button", { name: "Approved (0)" }).click();
    await expect(page.getByText("No approved sign-ups")).toBeVisible();
  });

  test("a paid sign-up's plan can't be changed in Fix details", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await page.getByRole("link", { name: "Hagikgik Kids Dental" }).click();
    await page.getByRole("button", { name: "Record payment" }).click();
    await page.getByRole("dialog", { name: "Record payment" }).getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await page.getByRole("button", { name: "Fix details" }).click();
    const dialog = page.getByRole("dialog", { name: "Fix Hagikgik Kids Dental" });
    await dialog.getByRole("radio", { name: /^Small/ }).click();
    await expect(dialog.getByText(/The setup fee is already recorded for the Mid plan/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  test("a very long clinic name is accepted and shown in full on its page", async ({ page }) => {
    const long = `Klinika ng Ngiti at Kalusugan ng Ngipin ng mga Bata sa Lungsod ng Dasmariñas ${uid()} `.repeat(3).trim();
    const c = aClinic({ name: long });
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    const { done } = await readTemporaryPassword(page, c.name);
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await openClinic(page, c.name);
  });

  test("BUG: a new Owner is told their chosen password was saved", async ({ page }) => {
    const c = aClinic();
    await openConsole(page);
    const dialog = await openNewClinicDialog(page);
    await fillNewClinic(dialog, c);
    await dialog.getByRole("button", { name: "Create clinic account" }).click();
    const { done, password } = await readTemporaryPassword(page, c.name);
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await signOutOfConsole(page);
    await signIn(page, c.ownerEmail, password);
    await chooseOwnPassword(page, password);
    // The screen promises a "Password saved. Welcome!" confirmation (change-password-screen.tsx).
    await expect(page.getByText("Password saved. Welcome!")).toBeVisible();
  });

  test("BUG: the Approve hint speaks plain language, not internal decision numbers", async ({ page }) => {
    await openConsole(page);
    await goToNav(page, "Sign-ups");
    await openHagikgik(page);
    await expect(page.getByText(/Approve opens once the setup fee is recorded/)).toBeVisible();
    await expect(page.getByText(/billing #\d+/)).toHaveCount(0);
  });
});
