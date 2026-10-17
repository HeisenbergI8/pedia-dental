import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, expectSignedIn, signIn, signInOperator, pinSeededDay } from "./support/users";

/**
 * Pilot tests for the ADMIN: Carmen Dela Cruz, Admin and dentist at Bulilit's Imus branch only.
 * Everything goes through the screen the way Carmen would use it: typing, clicking, reading.
 *
 * Patients used here are the stable seeded ones (Damien Balistreri). Roster patients' names change with the time of
 * day the demo data is seeded, so a test that needs one reads the name off the screen first.
 */

const ADMIN_NAME = "Carmen Dela Cruz";
const IMUS_ADDRESS = "12 Nueno Avenue, Imus, Cavite";
// The shared server is slow while many pilot agents run at once: allow each story more time.
test.describe.configure({ timeout: 150_000 });
test.use({ actionTimeout: 30_000 });

const expect = baseExpect.configure({ timeout: 20_000 });

const PATIENT = { search: "Balistreri", row: /Balistreri, Damien/, name: "Damien Balistreri" };

// ---------- helpers (UI only) ----------

async function signInAsAdmin(page: Page) {
  await signIn(page, USERS.admin);
  // Generous: the shared server can be slow when many pilot agents run at once.
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 30_000 });
  await expect(page.getByText(/Good (morning|afternoon|evening), Carmen/)).toBeVisible({ timeout: 15_000 });
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" });

async function goTo(page: Page, label: string) {
  await mainNav(page).getByRole("link", { name: label, exact: true }).click();
}

const accountMenu = (page: Page, who = `${ADMIN_NAME}, Admin`) =>
  page.getByRole("button", { name: new RegExp(`^${who}\\. Account menu`) });

async function signOut(page: Page, who?: string) {
  await accountMenu(page, who).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const confirm = page.getByRole("dialog", { name: "Sign out?" });
  await confirm.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
}

/** The sidebar's "Find a patient" search, then the matching child. */
async function openPatient(page: Page, search = PATIENT.search, row: RegExp = PATIENT.row) {
  await page.getByRole("button", { name: /Find a patient/ }).click();
  const finder = page.getByRole("dialog", { name: "Find a patient" });
  await finder.getByRole("searchbox", { name: "Search patients" }).fill(search);
  await finder.getByRole("link", { name: row }).first().click();
  await expect(page.getByRole("tab", { name: "Overview" })).toBeVisible({ timeout: 30_000 });
}

async function startVisit(page: Page) {
  await page.getByRole("button", { name: `Start visit as ${ADMIN_NAME}` }).click();
  await expect(page.getByText("Visit in progress")).toBeVisible();
}

async function pickOption(page: Page, combobox: Locator, option: string | RegExp) {
  await combobox.click();
  await page.getByRole("option", { name: option, exact: typeof option === "string" ? true : undefined }).click();
}

async function openNewNote(page: Page) {
  await page.getByRole("tab", { name: "Notes" }).click();
  await page.getByRole("button", { name: "New note" }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await pickOption(page, dialog.getByLabel("Template"), "Oral examination");
  return dialog;
}

async function fillOralExam(page: Page, dialog: Locator) {
  await pickOption(page, dialog.getByLabel("Oral hygiene *"), "Good");
  await pickOption(page, dialog.getByLabel("Caries risk assessment *"), "Low");
  await dialog.getByText("Cooperative", { exact: true }).click();
}

/** The "New appointment" dialog from the Appointments screen, with the patient and procedure picked. */
async function openBooking(page: Page, procedure?: string) {
  await goTo(page, "Appointments");
  await page.getByRole("button", { name: "New appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "New appointment" });
  await expect(dialog).toBeVisible();
  if (procedure) {
    await dialog.getByLabel("Patient").fill(PATIENT.search);
    await page.getByRole("option", { name: PATIENT.row }).click();
    await expect(dialog.getByText(/Damien Balistreri/)).toBeVisible();
    await dialog.getByRole("radio", { name: procedure }).click();
  }
  return dialog;
}

async function openPaymentDialog(page: Page) {
  await openPatient(page);
  await page.getByRole("tab", { name: "Billing" }).click();
  await page.getByRole("tabpanel").getByRole("button", { name: "Record payment" }).first().click();
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await expect(dialog).toBeVisible();
  const text = (await dialog.getByText(/^Balance ₱/).innerText()).match(/₱([\d,]+\.\d{2})/)![1]!;
  return { dialog, balance: Number(text.replace(/,/g, "")) };
}

const peso = (n: number) => `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Next Sunday's yyyy-mm-dd, from the clinic's (Manila) calendar the browser runs in. */
function nextSunday() {
  const d = new Date();
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7 || 7));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- tests ----------

test.describe("happy paths", () => {
  test("admin signs in and lands on Today at a glance with the clinic's finance figures", async ({ page }) => {
    await signInAsAdmin(page);
    await expect(accountMenu(page)).toBeVisible();
    const finance = page.getByRole("region", { name: "Finance" });
    await expect(finance.getByText("Collected today")).toBeVisible();
    await expect(finance.getByText("Outstanding", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Today's appointments/ })).toBeVisible();
  });

  test("admin's menu offers every clinic screen, Billing and Settings included", async ({ page }) => {
    await signInAsAdmin(page);
    await expect(mainNav(page).getByRole("link")).toHaveText([
      "Dashboard",
      "Appointments",
      "Patients",
      "Billing",
      "Recalls",
      "Messages",
      "Documents",
      "Settings",
    ]);
    // Each opens for her, not the "no access" page.
    for (const screen of ["Billing", "Recalls", "Messages", "Documents"]) {
      await goTo(page, screen);
      await expect(page.getByRole("heading", { level: 1, name: screen })).toBeVisible();
      await expect(page.getByText("You don't have access to this page")).toHaveCount(0);
    }
  });

  test("admin, as the dentist in the chair, charts caries on a tooth and it is still there after a reload", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    await page.getByRole("tab", { name: "Chart" }).click();
    await page.getByRole("button", { name: /^Tooth 16: no findings/ }).click();
    const panel = page.getByRole("dialog", { name: /Tooth 16/ });
    await expect(panel.getByText(`New finding for this visit with ${ADMIN_NAME}.`)).toBeVisible();
    await expect(panel.getByLabel("Condition")).toHaveText("Caries");
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(page.getByText("Finding saved on tooth 16")).toBeVisible();
    await expect(panel.getByText("No findings recorded for this tooth.")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Tooth 16: .*caries/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: /^Tooth 16: .*caries/i })).toBeVisible({ timeout: 15_000 });
  });

  test("admin writes and signs an oral examination note, which is then locked", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    const dialog = await openNewNote(page);
    await fillOralExam(page, dialog);
    await dialog.getByRole("button", { name: "Save and sign" }).click();
    await expect(page.getByText("Oral examination note signed")).toBeVisible();
    await expect(dialog).toBeHidden();

    const panel = page.getByRole("tabpanel");
    await expect(panel.getByText(new RegExp(`${ADMIN_NAME} · signed`))).toBeVisible();
    await expect(panel.getByRole("button", { name: "Edit or sign" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("tabpanel").getByText(new RegExp(`${ADMIN_NAME} · signed`))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Edit or sign" })).toHaveCount(0);
  });

  test("admin saves a note as a draft between patients and signs it later", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    const dialog = await openNewNote(page);
    await pickOption(page, dialog.getByLabel("Oral hygiene *"), "Fair");
    await pickOption(page, dialog.getByLabel("Caries risk assessment *"), "Mid");
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(page.getByText("Draft saved")).toBeVisible();

    await page.getByRole("tabpanel").getByRole("button", { name: "Edit or sign" }).click();
    const edit = page.getByRole("dialog", { name: "Edit Oral examination" });
    await expect(edit.getByLabel("Oral hygiene *")).toHaveText("Fair");
    await pickOption(page, edit.getByLabel("Caries risk assessment *"), "High");
    await edit.getByRole("button", { name: "Save and sign" }).click();
    await expect(page.getByText("Oral examination note signed")).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Edit or sign" })).toHaveCount(0);
  });

  test("admin adds a restoration to a child's treatment plan and the total updates", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await page.getByRole("tab", { name: "Plan" }).click();
    const panel = page.getByRole("tabpanel");
    await pickOption(page, panel.getByLabel("Procedure"), "Restoration");
    await panel.getByLabel("Tooth").fill("36");
    await expect(panel.getByLabel("Fee (₱)")).toHaveValue("2000");
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Restoration added to the plan")).toBeVisible();
    await expect(panel.getByText("₱2,000.00").first()).toBeVisible();
    await expect(panel.getByText("0 of 1 done")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tabpanel").getByText("0 of 1 done")).toBeVisible({ timeout: 15_000 });
  });

  test("admin books a cleaning for a returning patient and it shows on the child's record", async ({ page }) => {
    await signInAsAdmin(page);
    const dialog = await openBooking(page, "Prophylaxis (cleaning)");
    // Carmen is a dentist too, so she is offered as "You".
    await expect(dialog.getByRole("radio", { name: /Carmen Dela Cruz\s*You/ })).toBeVisible();
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(page.getByText("Appointment booked")).toBeVisible();
    await expect(dialog).toBeHidden();

    await openPatient(page);
    await expect(page.getByRole("listitem").filter({ hasText: "Prophylaxis (cleaning)" })).toHaveCount(1);
  });

  test("admin records a partial cash payment and the receipt carries the Imus branch address", async ({ page }) => {
    await signInAsAdmin(page);
    const { dialog, balance } = await openPaymentDialog(page);
    expect(balance).toBeGreaterThan(100);
    await dialog.getByLabel("Amount received (₱)").fill("100");
    await expect(dialog.getByLabel("Received by")).toHaveText(ADMIN_NAME);
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment recorded · receipt AR-\d+/)).toBeVisible();
    const statement = page.getByRole("tabpanel");
    await expect(statement.getByText(peso(balance - 100)).first()).toBeVisible();

    const receipts = statement.getByRole("link", { name: /^Receipt AR-/ });
    await receipts.last().click();
    await expect(page).toHaveURL(/\/receipts\//, { timeout: 30_000 });
    await expect(page.getByText(IMUS_ADDRESS)).toBeVisible();
    await expect(page.getByText("₱100.00").first()).toBeVisible();
  });

  test("admin finishes a visit and the record says no visit is in progress", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    await page.getByRole("button", { name: "Finish visit" }).click();
    await expect(page.getByText("Visit finished")).toBeVisible();
    await expect(page.getByText(/No visit in progress/)).toBeVisible();
  });

  test("admin hands the device to the Imus front desk with Switch user and her PIN", async ({ page }) => {
    await signInAsAdmin(page);
    await accountMenu(page).click();
    await page.getByRole("menuitem", { name: "Switch user" }).click();
    const dialog = page.getByRole("dialog", { name: "Switch user" });
    // Only people who work at Imus, and never herself.
    await expect(dialog.getByRole("radio")).toHaveCount(4);
    await expect(dialog.getByText(ADMIN_NAME)).toHaveCount(0);

    await dialog.getByText("Demo PINs").click();
    const pin = (await dialog.getByText(/^Liza Cruz: \d{4}$/).innerText()).slice(-4);
    await dialog.getByText("Liza Cruz", { exact: true }).click();
    await dialog.getByLabel("Liza Cruz's PIN").fill(pin);
    await dialog.getByRole("button", { name: "Switch user" }).click();
    await expect(page.getByText("Liza Cruz (Front desk) is now using this device")).toBeVisible();
    await expect(accountMenu(page, "Liza Cruz, Front desk")).toBeVisible();
  });

  test("admin signs out from the account menu and lands on the sign-in page", async ({ page }) => {
    await signInAsAdmin(page);
    await signOut(page);
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
  });

  test("admin registers a child with a Filipino name and finds her again by search", async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await page.getByLabel("First name").fill("Niña");
    await page.getByLabel("Last name").fill("Dela Peña");
    await page.getByLabel("Date of birth").fill("2019-05-14");
    await page.getByRole("radio", { name: "Female", exact: true }).click();
    await page.getByRole("radio", { name: "Mother", exact: true }).click();
    // The surname is copied from the child; Carmen types the mother's first and middle names in front of it.
    await page.getByLabel("Full name").click();
    await page.keyboard.type("Ma. Lourdes O'Hara");
    await expect(page.getByLabel("Full name")).toHaveValue("Ma. Lourdes O'Hara Dela Peña");
    await page.getByLabel("Mobile number").fill("0917 123 4567");
    await page.getByRole("radio", { name: "None known" }).first().click();
    await page.getByRole("radio", { name: "None known" }).nth(1).click();
    await page.getByRole("button", { name: "Save patient" }).click();

    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await expect(consent.getByRole("combobox", { name: "Who consented" })).toHaveText("Ma. Lourdes O'Hara Dela Peña (Mother)");
    await consent.getByRole("checkbox", { name: /privacy notice/ }).check();
    await consent.getByRole("button", { name: "Save patient" }).click();
    await expect(page).toHaveURL(/\/patients\/[^/]+$/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: "Niña Dela Peña" })).toBeVisible();

    await openPatient(page, "Peña", /Dela Peña, Niña/);
    await expect(page.getByRole("heading", { name: "Niña Dela Peña" })).toBeVisible();
  });
});

test.describe("failed paths", () => {
  test("a wrong password keeps admin on the sign-in page with a plain message", async ({ page }) => {
    await signIn(page, USERS.admin, "pass1234");
    await expect(page.getByText("That email and password don't match a demo account")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("signing in with empty or malformed fields shows what to fix", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(form.getByText("Enter your password")).toBeVisible();

    await form.getByLabel("Email").fill("admin@gmail");
    await form.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("admin's clinic login does not open Primolar's own console", async ({ page }) => {
    await signInOperator(page, USERS.admin, DEMO_PASSWORD);
    await expect(page.getByText("That email and password don't match a Primolar operator")).toBeVisible();
    await expect(page).toHaveURL(/\/operator\/login$/);
  });

  test("admin who pastes the parent portal address is told it is for parents and can go home", async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto("/portal");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByText(/signed in as Carmen Dela Cruz \(Admin\)\. The parent portal is for parents\./)).toBeVisible();
    await page.getByRole("link", { name: "Go to your home page" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test("the Owner manages staff, branches and the plan in Settings, while the admin only reads the clinic's reference data", async ({ page }) => {
    await signIn(page, USERS.owner);
    await expectSignedIn(page);
    await goTo(page, "Settings");
    for (const tab of ["Clinic", "Branches", "Staff", "Plan"]) await expect(page.getByRole("tab", { name: tab })).toBeVisible();
    await signOut(page, "Dr\\. Paolo Villanueva, Owner");

    await signInAsAdmin(page);
    await goTo(page, "Settings");
    await expect(page.getByText("The clinic's procedures, staff and chairs. Read-only in this prototype.")).toBeVisible();
    await expect(page.getByRole("tab")).toHaveCount(0);
    for (const action of [/Add staff/, /Save look/, /Add branch/, /Save new version/, /Deactivate/]) {
      await expect(page.getByRole("button", { name: action })).toHaveCount(0);
    }
    await expect(page.getByRole("table", { name: "Dentists and staff" }).getByText(ADMIN_NAME)).toBeVisible();
  });

  test("admin never sees Primolar's billing: the overdue banner and the Plan page are the Owner's alone", async ({ page }) => {
    // An Owner whose payment is overdue sees the banner on every page...
    await signIn(page, USERS.ipinOwner);
    await expectSignedIn(page);
    await expect(page.getByRole("link", { name: "See Settings → Plan" })).toBeVisible({ timeout: 15_000 });
    await signOut(page, "Dr\\. Lara Santiago, Owner");

    // ...and the admin sees no billing anywhere.
    await signInAsAdmin(page);
    for (const screen of ["Dashboard", "Appointments", "Patients", "Billing", "Settings"]) {
      await goTo(page, screen);
      await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
      await expect(page.getByRole("link", { name: "See Settings → Plan" })).toHaveCount(0);
      await expect(page.getByText(/overdue|Primolar plan|setup fee|pay by/i)).toHaveCount(0);
    }
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
  });

  test("admin at Imus only gets no branch switcher, no branch filter, and only Imus chairs", async ({ page }) => {
    await signInAsAdmin(page);
    await expect(page.getByRole("combobox", { name: "Branch" })).toHaveCount(0);
    await expect(page.getByText("Showing", { exact: true })).toHaveCount(0);

    await goTo(page, "Appointments");
    for (const chair of ["Chair 1", "Chair 2", "Chair 3"]) await expect(page.getByText(chair, { exact: true }).first()).toBeVisible();
    await expect(page.getByText(/^Chair [45]$/)).toHaveCount(0);

    const dialog = await openBooking(page, "Prophylaxis (cleaning)");
    await dialog.getByRole("button", { name: "Pick another date or time" }).click();
    await dialog.getByLabel("Chair").click();
    await expect(page.getByRole("option")).toHaveText(["Chair 1", "Chair 2", "Chair 3"]);
  });

  test("BUG: admin at Imus sees a child's Dasmariñas booking on the record without being told it is at Dasmariñas", async ({ page }) => {
    await pinSeededDay(page);
    // The Owner looks up a booking at Dasmariñas, a branch Carmen does not work at.
    await signIn(page, USERS.owner);
    await expectSignedIn(page);
    await page.getByRole("combobox", { name: "Branch" }).click();
    await page.getByRole("option", { name: "Dasmariñas" }).click();
    await goTo(page, "Appointments");
    await page.getByRole("radio", { name: "Week" }).or(page.getByRole("button", { name: "Week", exact: true })).first().click();
    const booking = page.getByRole("main").getByRole("button", { name: /Booked · Oral examination/ });
    await page.getByRole("main").getByText(/Booked · Oral examination|No appointments/).first().waitFor().catch(() => {});
    if ((await booking.count()) === 0) await page.getByRole("button", { name: "Next", exact: true }).click(); // a Saturday: next week
    await booking.first().click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByText("Chair 4")).toBeVisible();
    // The title reads "Appointment" until the child's record loads.
    await expect(sheet.getByRole("heading").first()).not.toHaveText("Appointment");
    const child = (await sheet.getByRole("heading").first().innerText()).trim();
    const when = (await sheet.getByText(/· 12:00/).first().innerText()).split("·")[0]!.trim(); // "Thu, Oct 15"
    await page.keyboard.press("Escape");
    await page.getByRole("combobox", { name: "Branch" }).click();
    await page.getByRole("option", { name: "Imus" }).click(); // leave the device at Imus
    await signOut(page, "Dr\\. Paolo Villanueva, Owner");

    // Carmen opens the same child.
    await signInAsAdmin(page);
    const [first, ...rest] = child.split(" ");
    await openPatient(page, rest.join(" "), new RegExp(`${rest.join(" ")}, ${first}`));
    const row = page.getByRole("listitem").filter({ hasText: `${when} · 12:00 PM` });
    // Either the other branch's booking is not shown to her, or it says where it is.
    if ((await row.count()) > 0) await expect(row.first()).toContainText("Dasmariñas");
  });

  test("a note can't be signed until the required findings are chosen", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    const dialog = await openNewNote(page);
    await dialog.getByRole("button", { name: "Save and sign" }).click();
    await expect(dialog.getByText("Choose oral hygiene")).toBeVisible();
    await expect(dialog.getByText("Choose caries risk assessment")).toBeVisible();
    await expect(dialog).toBeVisible();
    await expect(page.getByText("Oral examination note signed")).toHaveCount(0);
  });

  test("the chart is read-only until a visit is started", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await page.getByRole("tab", { name: "Chart" }).click();
    await page.getByRole("button", { name: /^Tooth 16: no findings/ }).click();
    const panel = page.getByRole("dialog", { name: /Tooth 16/ });
    await expect(panel.getByText("Read-only. Start a visit and show the latest chart to record findings.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save finding" })).toHaveCount(0);
  });

  test("booking with nothing filled in says what is missing", async ({ page }) => {
    await signInAsAdmin(page);
    const dialog = await openBooking(page);
    await dialog.getByRole("button", { name: /^Book/ }).click();
    await expect(dialog.getByText("Pick a patient")).toBeVisible();
    await expect(dialog.getByText("Give a reason")).toBeVisible();
    await expect(page.getByText("Appointment booked")).toHaveCount(0);
  });

  test("a booking after Imus closes is refused with the opening hours", async ({ page }) => {
    await signInAsAdmin(page);
    const dialog = await openBooking(page, "Prophylaxis (cleaning)");
    await dialog.getByRole("button", { name: "Pick another date or time" }).click();
    await dialog.getByLabel("Start").fill("19:00");
    await dialog.getByRole("button", { name: /^Book/ }).click();
    await expect(dialog.getByText("Book between 8:00 AM and 6:00 PM.")).toBeVisible();
    await expect(page.getByText("Appointment booked")).toHaveCount(0);
  });

  test("a booking on a Sunday is refused because Imus is closed", async ({ page }) => {
    await signInAsAdmin(page);
    const dialog = await openBooking(page, "Prophylaxis (cleaning)");
    await dialog.getByRole("button", { name: "Pick another date or time" }).click();
    await dialog.getByLabel("Date").fill(nextSunday());
    await dialog.getByLabel("Start").fill("10:00");
    await dialog.getByRole("button", { name: /^Book/ }).click();
    await expect(dialog.getByText("The clinic is closed on Sundays. Pick another day.")).toBeVisible();
  });

  test("a payment of zero, a GCash payment without a reference, and more than the balance are all refused", async ({ page }) => {
    await signInAsAdmin(page);
    const { dialog, balance } = await openPaymentDialog(page);
    const amount = dialog.getByLabel("Amount received (₱)");

    await amount.fill("0");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("Enter an amount")).toBeVisible();

    await amount.fill("100");
    await pickOption(page, dialog.getByLabel("Method"), "GCash");
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(dialog.getByText("Enter the reference number")).toBeVisible();

    await dialog.getByLabel("Reference number").fill("GC-123456");
    await amount.fill(String(balance + 1000));
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(`That's more than the ${peso(balance)} balance`)).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("a wrong PIN on Switch user keeps the admin signed in and says so", async ({ page }) => {
    await signInAsAdmin(page);
    await accountMenu(page).click();
    await page.getByRole("menuitem", { name: "Switch user" }).click();
    const dialog = page.getByRole("dialog", { name: "Switch user" });
    await dialog.getByRole("button", { name: "Switch user" }).click();
    await expect(dialog.getByText("Choose who is taking over")).toBeVisible();

    await dialog.getByText("Liza Cruz", { exact: true }).click();
    await dialog.getByLabel("Liza Cruz's PIN").fill("0000");
    await dialog.getByRole("button", { name: "Switch user" }).click();
    await expect(dialog.getByText(/That PIN isn't right for Liza Cruz/)).toBeVisible();
    await expect(dialog.getByLabel("Liza Cruz's PIN")).toHaveValue("");
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(accountMenu(page)).toBeVisible();
  });

  test("cancelling the sign-out question, by button or Escape, keeps the admin signed in", async ({ page }) => {
    await signInAsAdmin(page);
    for (const how of ["button", "escape"] as const) {
      await accountMenu(page).click();
      await page.getByRole("menuitem", { name: "Sign out" }).click();
      const confirm = page.getByRole("dialog", { name: "Sign out?" });
      await expect(confirm).toContainText(`${ADMIN_NAME} will be signed out on this device`);
      if (how === "button") await confirm.getByRole("button", { name: "Cancel" }).click();
      else await page.keyboard.press("Escape");
      await expect(confirm).toBeHidden();
      await expect(page).toHaveURL(/\/dashboard$/);
    }
  });

  test("an invalid tooth number can't be added to the plan", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await page.getByRole("tab", { name: "Plan" }).click();
    const panel = page.getByRole("tabpanel");
    await pickOption(page, panel.getByLabel("Procedure"), "Restoration");
    await panel.getByLabel("Tooth").fill("99");
    await expect(panel.getByText("Not an FDI tooth number")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Add", exact: true })).toBeDisabled();
  });

  test("BUG: registering a child refuses a birth date in the future", async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await page.getByLabel("First name").fill("Bukas");
    await page.getByLabel("Last name").fill("Santos");
    await page.getByLabel("Date of birth").fill("2030-01-01");
    await page.getByRole("radio", { name: "Male", exact: true }).click();
    await page.getByRole("radio", { name: "Father", exact: true }).click();
    await page.getByLabel("Full name").click();
    await page.keyboard.type("Jose");
    await page.getByLabel("Mobile number").fill("0917 765 4321");
    await page.getByRole("radio", { name: "None known" }).first().click();
    await page.getByRole("radio", { name: "None known" }).nth(1).click();
    await page.getByRole("button", { name: "Save patient" }).click();
    // A child can't be born after today: the form should say so instead of moving on to the consent step.
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/patients\/new/);
  });
});

test.describe("edge cases", () => {
  test("a reload keeps the admin signed in on the page she was on", async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, "Settings");
    await expect(page).toHaveURL(/\/settings$/);
    await page.reload();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("Read-only in this prototype.", { exact: false })).toBeVisible({ timeout: 15_000 });
    await expect(accountMenu(page)).toBeVisible();
  });

  test("after signing out, the back button doesn't show the clinic's pages again", async ({ page }) => {
    await signInAsAdmin(page);
    await goTo(page, "Patients");
    await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();
    await signOut(page);
    await page.goBack();
    await expect(page).not.toHaveURL(/\/patients/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toHaveCount(0);
    await expect(accountMenu(page)).toHaveCount(0);
  });

  test("pasting the dashboard address while signed out leads to the sign-in page", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
    await expect(page.getByText("Collected today")).toHaveCount(0);
  });

  test("an email typed with capitals and spaces still signs the admin in", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByLabel("Email").fill("  Admin@Gmail.com ");
    await form.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
    await expect(accountMenu(page)).toBeVisible();
  });

  test("admin signs in with the keyboard alone", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByLabel("Email").focus();
    await page.keyboard.type(USERS.admin);
    await page.keyboard.press("Tab");
    await expect(form.getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.type(DEMO_PASSWORD);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  });

  test("double-clicking Save finding records the finding once", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    await page.getByRole("tab", { name: "Chart" }).click();
    await page.getByRole("button", { name: /^Tooth 16: no findings/ }).click();
    const panel = page.getByRole("dialog", { name: /Tooth 16/ });
    await panel.getByRole("button", { name: "Save finding" }).dblclick();
    await expect(page.getByText("Finding saved on tooth 16").first()).toBeVisible();
    await expect(panel.getByRole("button", { name: "Correct" })).toHaveCount(1);
  });

  test("double-clicking Save and sign creates one signed note", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    const dialog = await openNewNote(page);
    await fillOralExam(page, dialog);
    await dialog.getByRole("button", { name: "Save and sign" }).dblclick();
    await expect(page.getByText("Oral examination note signed").first()).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText(new RegExp(`${ADMIN_NAME} · signed`))).toHaveCount(1);
  });

  test("BUG: double-clicking Record payment takes the money once", async ({ page }) => {
    await signInAsAdmin(page);
    const { dialog, balance } = await openPaymentDialog(page);
    await dialog.getByLabel("Amount received (₱)").fill("50");
    await dialog.getByRole("button", { name: "Record payment" }).dblclick();
    await expect(page.getByText(/Payment recorded · receipt/).first()).toBeVisible();
    const statement = page.getByRole("tabpanel");
    await expect(statement.getByText("Cash payment")).toHaveCount(1);
    await expect(statement.getByText(peso(balance - 50)).first()).toBeVisible();
  });

  test("admin voids a bill made by mistake with a reason, and its treatment can be billed again (B8)", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    const patientId = page.url().match(/\/patients\/([^/?]+)/)![1]!;
    // A fluoride done by a signed note: through the demo's API in the page (MSW answers it), so it has no payment yet.
    const ok = await page.evaluate(async (id) => {
      const post = (path: string, body: unknown = {}) =>
        fetch(`/api${path}`, { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() }, body: JSON.stringify(body) })
          .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error(`${path} ${r.status} ${await r.text()}`))));
      await post(`/patients/${id}/plan`, { procedureCode: "fluoride", fee: 80000 });
      const visit = await post(`/patients/${id}/visits`, { dentistId: "staff_delacruz" });
      const note = await post(`/patients/${id}/notes`, { visitId: visit.id, templateId: "tpl_fluoride", values: { agent: "5% NaF varnish", teeth: [] }, behavior: [] });
      await post(`/notes/${note.id}/sign`);
      await post(`/visits/${visit.id}/complete`);
      return true;
    }, patientId);
    expect(ok).toBe(true);
    await page.goto(`/patients/${patientId}?tab=billing`);
    const tab = page.getByRole("tabpanel");
    await tab.getByRole("button", { name: "Create invoice" }).click();
    await expect(page.getByText("Invoice created")).toBeVisible();
    await tab.getByRole("button", { name: "Void", exact: true }).first().click();
    const dialog = page.getByRole("dialog", { name: "Void this bill?" });
    await dialog.getByRole("button", { name: "Void bill" }).click();
    await expect(dialog.getByText("Give a reason for voiding this bill")).toBeVisible();
    await dialog.getByLabel("Why is it voided?").fill("Billed the wrong child");
    await dialog.getByRole("button", { name: "Void bill" }).click();
    await expect(page.getByText("Bill voided. Its treatments can be billed again.")).toBeVisible();
    await expect(tab.getByRole("heading", { name: /· Voided$/ }).first()).toBeVisible();
    await expect(tab.getByText(/Voided by Carmen Dela Cruz on .+: Billed the wrong child/)).toBeVisible();
    await expect(tab.getByText("Ready to bill")).toBeVisible(); // its treatment is offered again
  });

  test("paying the exact balance brings it to zero", async ({ page }) => {
    await signInAsAdmin(page);
    const { dialog, balance } = await openPaymentDialog(page);
    await expect(dialog.getByLabel("Amount received (₱)")).toHaveValue(String(balance)); // offered in full
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText(/Payment recorded · receipt/)).toBeVisible();
    await expect(page.getByRole("tabpanel").getByText("₱0.00").first()).toBeVisible();
    await expect(page.getByRole("tabpanel").getByRole("button", { name: "Record payment" })).toHaveCount(0);
  });

  test("the behaviour note stops at 300 characters", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    const dialog = await openNewNote(page);
    const note = dialog.getByLabel("Behavior note (optional)");
    await note.fill("Umiiyak pero kalmado nang hawakan ni Nanay. ".repeat(10));
    const value = await note.inputValue();
    expect(value.length).toBe(300);
  });

  test("a chart finding note with ñ, apostrophes and angle brackets is shown exactly as typed", async ({ page }) => {
    const text = `Niño's tooth — sensitive <cold> & "sweet"`;
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    await page.getByRole("tab", { name: "Chart" }).click();
    await page.getByRole("button", { name: /^Tooth 16: no findings/ }).click();
    const panel = page.getByRole("dialog", { name: /Tooth 16/ });
    await panel.getByLabel("Note (optional)").fill(text);
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(page.getByText("Finding saved on tooth 16")).toBeVisible();
    await expect(panel.getByText(text)).toBeVisible();
  });

  test("Escape closes a half-filled booking without booking anything", async ({ page }) => {
    await signInAsAdmin(page);
    const dialog = await openBooking(page, "Prophylaxis (cleaning)");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Appointment booked")).toHaveCount(0);
    await openPatient(page);
    await expect(page.getByRole("listitem").filter({ hasText: "Prophylaxis (cleaning)" })).toHaveCount(0);
  });

  test("Escape on the tooth panel discards an unsaved finding", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await startVisit(page);
    await page.getByRole("tab", { name: "Chart" }).click();
    await page.getByRole("button", { name: /^Tooth 16: no findings/ }).click();
    const panel = page.getByRole("dialog", { name: /Tooth 16/ });
    await pickOption(page, panel.getByLabel("Condition"), "Sealant");
    await expect(panel.getByLabel("Condition")).toHaveText("Sealant");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(page.getByRole("button", { name: /^Tooth 16: no findings/ })).toBeVisible();
  });

  test("a negative fee can't be added to the plan", async ({ page }) => {
    await signInAsAdmin(page);
    await openPatient(page);
    await page.getByRole("tab", { name: "Plan" }).click();
    const panel = page.getByRole("tabpanel");
    await pickOption(page, panel.getByLabel("Procedure"), "Oral examination");
    await panel.getByLabel("Fee (₱)").fill("-500");
    await panel.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Oral examination added to the plan")).toHaveCount(0);
    await expect(panel.getByText("0 of 0 done")).toBeVisible();
  });
});
