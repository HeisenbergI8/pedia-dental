import { expect as baseExpect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, signIn, pinSeededDay } from "./support/users";

/**
 * Pilot tests for Dr. Ana Reyes (dentist@gmail.com), a dentist at two clinics: Bulilit Smiles and Ngiti Kids.
 * Everything is driven through the UI the way she would use it: typing, clicking, reading the screen.
 */

const BULILIT = "Bulilit Smiles Pediatric Dental";
const NGITI = "Ngiti Kids Dental";

// A 1x1 PNG, so "Choose file" gets a real image the browser can resize.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

test.describe.configure({ timeout: 120_000 });
// The demo server is shared with other pilot testers, so screens can take longer than usual to appear.
const expect = baseExpect.configure({ timeout: 20_000 });

// ---------- helpers (UI only) ----------

/** Types the email and password, then picks the clinic on the chooser. */
async function signInAt(page: Page, clinic: string) {
  await signIn(page, USERS.dentist);
  const chooser = page.getByRole("region", { name: "Which clinic?" });
  await expect(chooser).toBeVisible({ timeout: 20_000 });
  await chooser.getByRole("button", { name: clinic }).click();
  // Signing in can take a while when the shared demo server is busy.
  await expect(page).toHaveURL(/\/appointments/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible({ timeout: 20_000 });
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: /Dr\. Ana Reyes, Dentist\. Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Patients in the nav, search by name, open the row. */
async function openPatient(page: Page, search: string, rowName: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Patients" }).click();
  await expect(page.getByRole("heading", { name: "Patients", level: 1 })).toBeVisible();
  await page.getByRole("searchbox", { name: "Search patients" }).fill(search);
  // Wait for the list to narrow to the one child before clicking, as a person would.
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(2);
  await page.getByRole("link", { name: rowName }).click();
  await expect(page.getByRole("tablist")).toBeVisible({ timeout: 20_000 });
}

async function startVisit(page: Page) {
  await page.getByRole("button", { name: "Start visit as Ana Reyes" }).click();
  await expect(page.getByText("Visit in progress")).toBeVisible();
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name }).click();
  await expect(page.getByRole("tab", { name })).toHaveAttribute("aria-selected", "true");
}

/** Radix select: open the combobox, pick the option. */
async function choose(page: Page, combobox: string | RegExp, option: string | RegExp, scope = page.locator("body")) {
  await scope.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).click();
}

const tooth = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Tooth ${n}:`) });

/** Opens the tooth panel by keyboard (whole tooth, no surface pre-checked). */
async function openTooth(page: Page, n: number) {
  await tooth(page, n).focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: new RegExp(`^Tooth ${n} ·`) });
  await expect(panel).toBeVisible();
  return panel;
}

const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);

/** Clicks "Choose file" in the photo dialog and picks a file from the OS file picker. */
async function pickFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  const chooserPromise = page.waitForEvent("filechooser");
  await page.getByRole("dialog", { name: "Add photo" }).getByRole("button", { name: "Choose file" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(file);
}

// =====================================================================================================

test.describe("happy paths", () => {
  test("dentist signs in, sees the clinic chooser, picks Bulilit and lands on the schedule", async ({ page }) => {
    await signIn(page, USERS.dentist);
    const chooser = page.getByRole("region", { name: "Which clinic?" });
    await expect(chooser.getByText("Your email is set up at more than one clinic.")).toBeVisible();
    await expect(chooser.getByRole("button", { name: BULILIT })).toBeVisible();
    await expect(chooser.getByRole("button", { name: NGITI })).toBeVisible();
    await chooser.getByRole("button", { name: BULILIT }).click();
    await expect(page).toHaveURL(/\/appointments/);
    await expect(page.getByRole("button", { name: "Dr. Ana Reyes, Dentist. Account menu" })).toBeVisible();
    await expect(page.getByRole("img", { name: BULILIT })).toBeVisible();
  });

  test("dentist switches from Bulilit to Ngiti by signing out and choosing the other clinic", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Patients" }).click();
    await expect(page.getByText("61 patients")).toBeVisible();

    await signOut(page);
    await signInAt(page, NGITI);
    await expect(page.getByRole("img", { name: NGITI })).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Patients" }).click();
    await expect(page.getByText("4 patients")).toBeVisible();
    await expect(page.getByRole("link", { name: "Abshire, Frederik" })).toBeVisible();
    // Bulilit's children are not listed at Ngiti.
    await page.getByRole("searchbox", { name: "Search patients" }).fill("Avery Toy");
    await expect(page.getByText("No patients match")).toBeVisible();
  });

  test("dentist looks over today's schedule in day, week and list views and opens an appointment", async ({ page }) => {
    await pinSeededDay(page);
    await signInAt(page, BULILIT);
    const views = page.getByRole("group", { name: "Calendar view" });
    await views.getByRole("button", { name: "Week" }).click();
    await expect(views.getByRole("button", { name: "Week" })).toHaveAttribute("aria-pressed", "true");
    await views.getByRole("button", { name: "List" }).click();
    await expect(views.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
    await views.getByRole("button", { name: "Day" }).click();
    await page.getByRole("button", { name: /Dariana Oberbrunner Confirmed/ }).click();
    const sheet = page.getByRole("dialog", { name: "Dariana Oberbrunner" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText("Restoration").first()).toBeVisible();
    await expect(sheet.getByText("Dentist")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  });

  test("dentist checks in a confirmed child from the schedule and starts the visit", async ({ page }) => {
    await pinSeededDay(page);
    await signInAt(page, BULILIT);
    await page.getByRole("button", { name: /Dariana Oberbrunner Confirmed/ }).click();
    const sheet = page.getByRole("dialog", { name: "Dariana Oberbrunner" });
    await sheet.getByRole("button", { name: "Check in" }).click();
    await expect(toast(page, /Marked arrived/i)).toBeVisible();
    await sheet.getByRole("button", { name: "Start visit" }).click();
    await expect(page).toHaveURL(/\/patients\//);
    await expect(page.getByRole("heading", { name: "Dariana Oberbrunner", level: 1 })).toBeVisible();
    await expect(page.getByText("Visit in progress")).toBeVisible();
  });

  test("dentist opens a child's record and the allergy alert stays on every tab", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await expect(page.getByRole("heading", { name: "Avery Toy", level: 1 })).toBeVisible();
    for (const tab of ["Overview", "Chart", "Notes", "Plan", "Photos", "Billing", "Documents"]) {
      await openTab(page, tab);
      await expect(page.getByRole("region", { name: "Medical alerts" }).getByText("Allergy: Penicillin")).toBeVisible();
    }
  });

  test("dentist records caries on a tooth and it shows on the chart and in its history after a reload", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 36);
    await expect(panel.getByText("Allergy: Penicillin")).toBeVisible();
    await expect(panel.getByRole("combobox", { name: "Condition" })).toHaveText(/Caries/);
    await panel.getByRole("checkbox", { name: "Occlusal (O)" }).check();
    await panel.getByLabel("Note (optional)").fill("Deep pit, monitor");
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 36")).toBeVisible();
    await expect(panel.getByText("Caries · O")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooth(page, 36)).toHaveAccessibleName("Tooth 36: O caries");

    await page.reload();
    await expect(tooth(page, 36)).toHaveAccessibleName("Tooth 36: O caries");
    const again = await openTooth(page, 36);
    await expect(again.getByText("Deep pit, monitor")).toBeVisible();
  });

  test("dentist corrects a finding and the original stays in history marked corrected", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 46);
    await panel.getByRole("checkbox", { name: "Occlusal (O)" }).check();
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 46")).toBeVisible();
    await panel.getByRole("button", { name: "Correct" }).click();
    await expect(panel.getByText(/Correcting caries · O/)).toBeVisible();
    await choose(page, "Condition", "Restored", panel);
    await panel.getByRole("button", { name: "Save correction" }).click();
    await expect(toast(page, "Correction saved")).toBeVisible();
    await expect(panel.getByText("Restored · O")).toBeVisible();
    await expect(panel.getByText("Caries · O")).toBeVisible();
    await expect(panel.getByText("Corrected", { exact: true })).toBeVisible();
    await expect(panel.getByText("Correction", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooth(page, 46)).toHaveAccessibleName("Tooth 46: O restored");
  });

  test("dentist records one sealant finding on several teeth at once", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    await page.getByRole("button", { name: "Select several" }).click();
    await expect(page.getByText("Tap the teeth to include")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record finding" })).toBeDisabled();
    await tooth(page, 16).focus();
    await page.keyboard.press("Enter");
    await tooth(page, 26).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("Teeth 16, 26")).toBeVisible();
    await page.getByRole("button", { name: "Record finding" }).click();
    const sheet = page.getByRole("dialog", { name: "2 teeth" });
    await choose(page, "Condition", "Sealant", sheet);
    await sheet.getByRole("button", { name: /Save/ }).click();
    await expect(toast(page, "Finding saved on 2 teeth")).toBeVisible();
    await expect(tooth(page, 16)).toHaveAccessibleName(/Tooth 16: .*Sealant/i);
    await expect(tooth(page, 26)).toHaveAccessibleName(/Tooth 26: .*Sealant/i);
  });

  test("dentist writes an emergency note as a draft, then signs it and it locks", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await page.getByRole("button", { name: "New note" }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await choose(page, "Template", "Emergency visit", dialog);
    await dialog.getByLabel("Chief complaint *").fill("Toothache, lower left");
    await dialog.getByLabel("Treatment given *").fill("Temporary filling placed");
    await dialog.getByRole("checkbox", { name: "Anxious" }).check();
    await dialog.getByRole("button", { name: "Save draft" }).click();
    await expect(toast(page, "Draft saved")).toBeVisible();
    await expect(dialog).toBeHidden();
    await expect(page.getByText("Draft", { exact: true })).toBeVisible();
    await expect(page.getByText("Toothache, lower left")).toBeVisible();

    await page.getByRole("button", { name: "Edit or sign" }).click();
    const edit = page.getByRole("dialog", { name: "Edit Emergency visit" });
    await edit.getByLabel("Treatment given *").fill("Temporary filling placed, review in 1 week");
    await edit.getByRole("button", { name: "Save and sign" }).click();
    await expect(toast(page, "Emergency visit note signed")).toBeVisible();
    const emergency = page.getByRole("article").filter({ hasText: "Emergency visit" });
    await expect(emergency.getByText("Signed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit or sign" })).toHaveCount(0);
    await expect(emergency.getByText("Temporary filling placed, review in 1 week")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("article").filter({ hasText: "Emergency visit" }).getByText("Signed", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit or sign" })).toHaveCount(0);
  });

  test("dentist adds a restoration to the treatment plan from the tooth and sees it in the Plan tab", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 75);
    await choose(page, "Procedure to plan", "Restoration", panel);
    await panel.getByRole("button", { name: "Add to plan" }).click();
    await expect(toast(page, "Restoration on 75 added to the plan")).toBeVisible();
    await page.keyboard.press("Escape");
    await openTab(page, "Plan");
    const plan = page.getByRole("tabpanel", { name: "Plan" });
    await expect(plan.getByText("Restoration").first()).toBeVisible();
    await expect(plan.getByText(/75/).first()).toBeVisible();
  });

  test("dentist records oral habits and speech for the visit and they appear in the growth timeline", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await page.getByRole("button", { name: "Record for this visit" }).click();
    const dialog = page.getByRole("dialog", { name: "Growth and development" });
    await dialog.getByRole("checkbox", { name: "Thumb sucking" }).check();
    await dialog.locator("#thumb_sucking-start").fill("2025-01-15");
    await dialog.getByLabel("Speech observations").fill("Lisp on S sounds");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(toast(page, "Growth and development saved")).toBeVisible();
    const habits = page.getByRole("list", { name: "Oral habits" });
    await expect(habits.getByText("Thumb sucking")).toBeVisible();
    await expect(habits.getByText(/since Jan 15, 2025/)).toBeVisible();
    await expect(page.getByRole("list", { name: "Growth timeline" }).getByText("Lisp on S sounds")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit for this visit" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("list", { name: "Growth timeline" }).getByText("Lisp on S sounds")).toBeVisible();
  });

  test("dentist adds an intraoral photo to the visit and it shows in the Photos tab", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await pickFile(page, { name: "upper-arch.png", mimeType: "image/png", buffer: PNG });
    await expect(dialog.getByText("upper-arch.png")).toBeVisible();
    await expect(dialog.getByRole("combobox", { name: "Visit" })).toHaveText(/\(current\)/);
    await dialog.getByLabel("Tooth (optional)").fill("55");
    await dialog.getByLabel("Caption (optional)").fill("Upper arch, before cleaning");
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(toast(page, "Photo saved")).toBeVisible();
    await expect(dialog).toBeHidden();
    const tab = page.getByRole("tabpanel", { name: "Photos" });
    await expect(tab.getByText("Upper arch, before cleaning")).toBeVisible();
    await expect(tab.getByText(/Tooth 55/)).toBeVisible();
    await expect(tab.getByRole("heading", { name: /Visit .* Dr\. Ana Reyes/ })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("tabpanel", { name: "Photos" }).getByText("Upper arch, before cleaning")).toBeVisible();
  });

  test("dentist uploads a before and an after photo of one tooth and compares them", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Photos");
    for (const stage of ["Before", "After"]) {
      await page.getByRole("button", { name: "Add photo" }).click();
      const dialog = page.getByRole("dialog", { name: "Add photo" });
      await pickFile(page, { name: `${stage.toLowerCase()}.png`, mimeType: "image/png", buffer: PNG });
      await choose(page, "Before or after", stage, dialog);
      await dialog.getByLabel("Tooth (optional)").fill("84");
      await dialog.getByRole("button", { name: "Save photo" }).click();
      await expect(dialog).toBeHidden();
    }
    const compare = page.getByRole("heading", { name: "Before and after" });
    await expect(compare).toBeVisible();
    await expect(page.getByRole("slider", { name: "Before and after split" })).toBeVisible();
    await page.getByRole("radio", { name: "Side by side" }).or(page.getByRole("button", { name: "Side by side" })).click();
    const figures = page.locator("figure");
    await expect(figures.getByRole("img", { name: /Intraoral · before · tooth 84/ })).toBeVisible();
    await expect(figures.getByRole("img", { name: /Intraoral · after · tooth 84/ })).toBeVisible();
  });

  test("dentist downloads a dental certificate PDF for a past visit and it is logged on the record", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    await expect(page.getByText("No documents issued yet")).toBeVisible();
    // Dental certificate is the default choice; the latest completed visit is picked.
    await expect(page.getByRole("combobox", { name: "Visit" })).toHaveText(/Jun 1, 2026/);
    await expect(page.getByRole("combobox", { name: "Issued and signed by" })).toHaveText("Dr. Ana Reyes");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(toast(page, "Dental certificate downloaded and logged on the record")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download again: Dental certificate/ })).toBeVisible();
  });

  test("dentist writes a paracetamol prescription and downloads it", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    await page.getByRole("button", { name: /^Prescription/ }).click();
    await expect(page.getByText("Allergies:").locator("..")).toContainText("Penicillin");
    await choose(page, "Medicine", /^Paracetamol 120 mg/);
    const sig = page.getByLabel("How to take it");
    await expect(sig).toHaveValue(/___/);
    await sig.fill("Give 5 mL by mouth every 4 to 6 hours as needed for pain or fever.");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    expect((await downloadPromise).suggestedFilename()).toMatch(/\.pdf$/i);
    await expect(toast(page, /Prescription downloaded and logged/)).toBeVisible();
  });

  test("dentist finishes the visit and the chart goes read-only", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await page.getByRole("button", { name: "Finish visit" }).click();
    await expect(toast(page, "Visit finished")).toBeVisible();
    await expect(page.getByRole("button", { name: "Start visit as Ana Reyes" })).toBeVisible();
    await expect(page.getByText("In progress", { exact: true })).toHaveCount(0);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 36);
    await expect(panel.getByText("Read-only. Start a visit and show the latest chart to record findings.")).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save finding" })).toHaveCount(0);
  });

  test("dentist views the chart as of an earlier visit, read-only", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    await choose(page, "Chart as of", /Visit of Jun 1, 2026/);
    await expect(page.getByRole("button", { name: "Select several" })).toHaveCount(0);
    const panel = await openTooth(page, 36);
    await expect(panel.getByRole("button", { name: "Save finding" })).toHaveCount(0);
    await expect(panel.getByText(/Read-only/)).toBeVisible();
  });

  test("a certificate the dentist issues shows up in the clinic-wide Documents log", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Documents" }).click();
    await expect(page.getByText("No documents issued yet")).toBeVisible();
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).click();
    await downloadPromise;
    await expect(toast(page, /downloaded and logged/)).toBeVisible();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Documents" }).click();
    await expect(page.getByRole("heading", { name: "Documents", level: 1 })).toBeVisible();
    await expect(page.getByRole("main").getByText("Dental certificate").first()).toBeVisible();
    await expect(page.getByRole("main").getByText(/Avery/).first()).toBeVisible();
  });

  test("dentist charts at Ngiti, signs out, comes back to Ngiti and the finding is still there", async ({ page }) => {
    await signInAt(page, NGITI);
    await openPatient(page, "Robbie Kessler", "Kessler, Robbie");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 46);
    await panel.getByRole("checkbox", { name: "Buccal (B)" }).check();
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 46")).toBeVisible();
    await page.keyboard.press("Escape");

    await signOut(page);
    await signInAt(page, BULILIT);
    await signOut(page);
    await signInAt(page, NGITI);
    await openPatient(page, "Robbie Kessler", "Kessler, Robbie");
    await expect(page.getByText("Visit in progress")).toBeVisible();
    await openTab(page, "Chart");
    await expect(tooth(page, 46)).toHaveAccessibleName("Tooth 46: B caries");
  });
});

// =====================================================================================================

test.describe("failed paths", () => {
  test("dentist types the wrong password and is told so, with no clinic chooser", async ({ page }) => {
    await signIn(page, USERS.dentist, "wrong-pass");
    await expect(page.getByRole("region", { name: "Sign in" }).getByRole("alert")).toBeVisible();
    await expect(page.getByRole("region", { name: "Which clinic?" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test("dentist submits the sign-in form empty and sees what is missing", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByLabel("Mobile number or email")).toHaveAttribute("aria-invalid", "true");
    await expect(form.getByLabel("Password", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(page).toHaveURL(/\/login/);
  });

  test("dentist backs out of the clinic chooser with Use a different email", async ({ page }) => {
    await signIn(page, USERS.dentist);
    await page.getByRole("button", { name: "Use a different email" }).click();
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Which clinic?" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });

  test("dentist without a visit in progress can read the chart but cannot record or write notes", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await expect(page.getByText("No visit in progress.")).toBeVisible();
    await openTab(page, "Chart");
    await expect(page.getByRole("button", { name: "Select several" })).toHaveCount(0);
    const panel = await openTooth(page, 36);
    await expect(panel.getByText("Read-only. Start a visit and show the latest chart to record findings.")).toBeVisible();
    await page.keyboard.press("Escape");
    await openTab(page, "Notes");
    await expect(page.getByText("Start a visit to write a note.")).toBeVisible();
    await expect(page.getByRole("button", { name: "New note" })).toHaveCount(0);
  });

  test("dentist's nav has no billing, recalls or messages, and typing those URLs is refused", async ({ page }) => {
    await signInAt(page, BULILIT);
    const nav = page.getByRole("navigation", { name: "Main" });
    for (const hidden of ["Billing", "Recall", "Messages"]) {
      await expect(nav.getByRole("link", { name: new RegExp(hidden, "i") })).toHaveCount(0);
    }
    for (const url of ["/billing", "/recall", "/messages"]) {
      await page.goto(url);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
      await expect(page.getByText(/You're signed in as Dr\. Ana Reyes \(Dentist\)/)).toBeVisible();
    }
    await page.getByRole("link", { name: "Go to your home page" }).click();
    await expect(page).toHaveURL(/\/appointments/);
  });

  test("dentist's dashboard shows today but no finance figures", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Dashboard" }).click();
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole("main")).not.toBeEmpty();
    await expect(page.getByRole("heading", { name: "Finance" })).toHaveCount(0);
    await expect(page.getByText("Revenue by procedure")).toHaveCount(0);
    await expect(page.getByText("Outstanding balances")).toHaveCount(0);
  });

  test("dentist can read Settings but cannot change the clinic", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
    await expect(page.getByText("Read-only in this prototype.")).toBeVisible();
    await expect(page.getByRole("table", { name: "Procedure catalog" })).toBeVisible();
    for (const name of [/Save look/i, /Add staff/i, /Save new version/i]) {
      await expect(page.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(page.getByRole("tab", { name: /^Staff$|^Plan$/ })).toHaveCount(0);
  });

  test("dentist sees a child's bill but cannot record a payment", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Velma Kerluke", "Kerluke, Velma");
    await openTab(page, "Billing");
    const billing = page.getByRole("tabpanel", { name: "Billing" });
    await expect(billing.getByText(/1,000/).first()).toBeVisible();
    await expect(billing.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    await expect(billing.getByRole("button", { name: "Refund" })).toHaveCount(0);
  });

  test("dentist signed in to Ngiti cannot open a Bulilit child's record by pasting its link", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    const bulilitUrl = page.url();
    await signOut(page);
    await signInAt(page, NGITI);
    await page.goto(bulilitUrl);
    await expect(page.getByRole("heading", { name: "Avery Toy" })).toHaveCount(0);
    await expect(page.getByText("Penicillin")).toHaveCount(0);
    await expect(page.getByText(/couldn't|not found|don't have access/i).first()).toBeVisible();
  });

  test("prescribing amoxicillin to a penicillin-allergic child is refused", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    await page.getByRole("button", { name: /^Prescription/ }).click();
    await choose(page, "Medicine", /^Amoxicillin/);
    await page.getByLabel("How to take it").fill("Give 5 mL by mouth every 8 hours for 7 days.");
    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(toast(page, /allerg/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /^Download again: Prescription/ })).toHaveCount(0);
  });

  test("prescription keeps the ___ dose blank from being downloaded", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    await page.getByRole("button", { name: /^Prescription/ }).click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(page.getByText("Choose a medicine")).toBeVisible();
    await choose(page, "Medicine", /^Ibuprofen/);
    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(page.getByText("Write the dose where it says ___").last()).toBeVisible();
    await expect(page.getByText("No documents issued yet")).toBeVisible();
  });

  test("referral letter without who and why is not issued", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    await page.getByRole("button", { name: /^Referral letter/ }).click();
    await page.getByRole("button", { name: "Download PDF" }).click();
    await expect(page.getByText("Say who you're referring the child to")).toBeVisible();
    await expect(page.getByText("Give the reason for the referral")).toBeVisible();
    await expect(page.getByText("No documents issued yet")).toBeVisible();
  });

  test("note cannot be signed while required fields are empty", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await page.getByRole("button", { name: "New note" }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await choose(page, "Template", "Emergency visit", dialog);
    await dialog.getByRole("button", { name: "Save and sign" }).click();
    await expect(dialog.getByText("Fill in chief complaint")).toBeVisible();
    await expect(dialog.getByText("Fill in treatment given")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("growth record refuses a habit that stopped before it started, and a future date", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await page.getByRole("button", { name: "Record for this visit" }).click();
    const dialog = page.getByRole("dialog", { name: "Growth and development" });
    await dialog.getByRole("checkbox", { name: "Pacifier use" }).check();
    await dialog.locator("#pacifier-start").fill("2025-06-01");
    await dialog.locator("#pacifier-stop").fill("2025-01-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Stopped before it started")).toBeVisible();

    await dialog.locator("#pacifier-stop").fill("");
    await dialog.locator("#pacifier-start").fill("2099-01-01");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("Can't be in the future")).toBeVisible();
    await expect(dialog).toBeVisible();
  });

  test("photo dialog asks for a file and a real tooth number", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await dialog.getByLabel("Tooth (optional)").fill("99");
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(dialog.getByText("Choose or take a photo")).toBeVisible();
    await expect(dialog.getByText("Use an FDI number, e.g. 74")).toBeVisible();
  });

  test("a PDF cannot be saved as an intraoral photo, but can as a medical document", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await pickFile(page, { name: "lab-result.pdf", mimeType: "application/pdf", buffer: PDF });
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(dialog.getByText("Attach an image file")).toBeVisible();
    await choose(page, "Type", "Medical document", dialog);
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(toast(page, "Photo saved")).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Photos" }).getByText("Medical document").first()).toBeVisible();
  });

  test("intraoral photo is refused for a family that declined photos, but an X-ray is allowed", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Coby Medhurst", "Medhurst, Coby");
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await pickFile(page, { name: "smile.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(toast(page, /family declined clinical photos/)).toBeVisible();
    await expect(dialog).toBeVisible();
    await choose(page, "Type", "X-ray", dialog);
    await dialog.getByRole("button", { name: "Save photo" }).click();
    await expect(toast(page, "Photo saved")).toBeVisible();
  });

  test("cancelling sign out keeps the dentist signed in", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.getByRole("button", { name: "Dr. Ana Reyes, Dentist. Account menu" }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out?" });
    await expect(dialog.getByText("Dr. Ana Reyes will be signed out on this device.")).toBeVisible();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/appointments/);
  });
});

// =====================================================================================================

test.describe("edge cases", () => {
  test("Filipino names and special characters in a chart note are kept exactly", async ({ page }) => {
    const note = "Niño's 2nd visit — sabi ni Mang Peñaflor: \"masakit\" <b>not bold</b> & 100%";
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 85);
    await panel.getByLabel("Note (optional)").fill(note);
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 85")).toBeVisible();
    await page.reload();
    const again = await openTooth(page, 85);
    await expect(again.getByText(note, { exact: true })).toBeVisible();
  });

  test("behavior note stops at 300 characters", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await page.getByRole("button", { name: "New note" }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await choose(page, "Template", "Emergency visit", dialog);
    const behavior = dialog.getByLabel("Behavior note (optional)");
    await behavior.fill("x".repeat(320));
    await expect(behavior).toHaveValue("x".repeat(300));
  });

  test("a very long chart note wraps and is saved whole", async ({ page }) => {
    const long = "Interproximal shadow seen on bitewing. ".repeat(40).trim();
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 74);
    await panel.getByLabel("Note (optional)").fill(long);
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 74")).toBeVisible();
    await expect(panel.getByText(long)).toBeVisible();
    const box = await panel.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test("double-clicking Save finding records the finding only once", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 84);
    await panel.getByRole("button", { name: "Save finding" }).dblclick();
    await expect(toast(page, "Finding saved on tooth 84").first()).toBeVisible();
    await expect(panel.getByRole("list").last().getByRole("listitem")).toHaveCount(1);
  });

  test("double-clicking Start visit starts only one visit", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await page.getByRole("button", { name: "Start visit as Ana Reyes" }).dblclick();
    await expect(page.getByText("Visit in progress")).toBeVisible();
    await expect(page.getByText("In progress", { exact: true })).toHaveCount(1);
  });

  test("reloading mid-visit keeps the visit and the open tab", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await expect(page).toHaveURL(/tab=notes/);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Notes" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByText("Visit in progress")).toBeVisible();
    await expect(page.getByRole("button", { name: "New note" })).toBeVisible();
  });

  test("the browser back button returns from the patient record to the patient list", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Chart");
    await page.goBack();
    await expect(page).toHaveURL(/\/patients\?q=/);
    await expect(page.getByRole("heading", { name: "Patients", level: 1 })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("link", { name: "Toy, Avery" })).toBeVisible();
  });

  test("Escape closes the tooth panel without saving and puts focus back on the tooth", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 36);
    await panel.getByLabel("Note (optional)").fill("Should not be saved");
    await page.keyboard.press("Escape");
    await expect(panel).toBeHidden();
    await expect(tooth(page, 36)).toBeFocused();
    await expect(tooth(page, 36)).toHaveAccessibleName("Tooth 36: no findings");
  });

  test("Escape on a new note discards it", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await page.getByRole("button", { name: "New note" }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await choose(page, "Template", "Emergency visit", dialog);
    await dialog.getByLabel("Chief complaint *").fill("Discard me");
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByText("No notes for this visit yet.")).toBeVisible();
    await expect(page.getByText("Discard me")).toHaveCount(0);
  });

  test("dentist charts a finding using only the keyboard", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 11);
    // Condition select: focus, open with Enter, move to Restored, choose.
    await panel.getByRole("combobox", { name: "Condition" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("option", { name: "Restored" }).focus();
    await page.keyboard.press("Enter");
    await expect(panel.getByRole("combobox", { name: "Condition" })).toHaveText(/Restored/);
    await panel.getByRole("checkbox", { name: "Mesial (M)" }).focus();
    await page.keyboard.press("Space");
    await expect(panel.getByRole("checkbox", { name: "Mesial (M)" })).toBeChecked();
    await panel.getByRole("button", { name: "Save finding" }).focus();
    await page.keyboard.press("Enter");
    await expect(toast(page, "Finding saved on tooth 11")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(tooth(page, 11)).toHaveAccessibleName("Tooth 11: M restored");
  });

  test("an extracted tooth takes no new findings", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Chart");
    const panel = await openTooth(page, 54);
    await choose(page, "Condition", "Extracted", panel);
    await expect(panel.getByText("This condition applies to the whole tooth.")).toBeVisible();
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(toast(page, "Finding saved on tooth 54")).toBeVisible();
    await expect(panel.getByText(/This tooth is recorded as extracted/)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Save finding" })).toHaveCount(0);
  });

  test("a child at the second clinic with no history shows friendly empty states", async ({ page }) => {
    await signInAt(page, NGITI);
    await openPatient(page, "Robbie Kessler", "Kessler, Robbie");
    await expect(page.getByText("No visits yet.").first()).toBeVisible();
    await openTab(page, "Photos");
    await expect(page.getByText("No photos yet")).toBeVisible();
    await openTab(page, "Notes");
    await expect(page.getByText("No notes yet.")).toBeVisible();
    await openTab(page, "Documents");
    await expect(page.getByText("No documents issued yet")).toBeVisible();
    await page.getByRole("button", { name: /^Dental certificate/ }).click();
    await expect(page.getByText("Nothing in this patient's record to generate this from yet.")).toBeVisible();
  });

  test("double-clicking Save draft on a note saves one note", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await startVisit(page);
    await openTab(page, "Notes");
    await page.getByRole("button", { name: "New note" }).click();
    const dialog = page.getByRole("dialog", { name: "New note" });
    await choose(page, "Template", "Emergency visit", dialog);
    await dialog.getByLabel("Chief complaint *").fill("Chipped incisor");
    await dialog.getByLabel("Treatment given *").fill("Smoothed edge");
    await dialog.getByRole("button", { name: "Save draft" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("article").filter({ hasText: "Chipped incisor" })).toHaveCount(1);
  });

  test("double-clicking Save photo saves one photo", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await pickFile(page, { name: "once.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByLabel("Caption (optional)").fill("Only once please");
    await dialog.getByRole("button", { name: "Save photo" }).dblclick();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("tabpanel", { name: "Photos" }).getByText("Only once please")).toHaveCount(1);
  });

  test("double-clicking Download PDF issues the certificate once", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Documents");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download PDF" }).dblclick();
    await downloadPromise;
    await expect(page.getByRole("button", { name: /^Download again: Dental certificate/ }).first()).toBeVisible();
    await page.waitForTimeout(1500); // let a second click, if it went through, land too
    await expect(page.getByRole("button", { name: /^Download again: Dental certificate/ })).toHaveCount(1);
  });

  test("a photo dated in the future is refused", async ({ page }) => {
    await signInAt(page, BULILIT);
    await openPatient(page, "Avery Toy", "Toy, Avery");
    await openTab(page, "Photos");
    await page.getByRole("button", { name: "Add photo" }).click();
    const dialog = page.getByRole("dialog", { name: "Add photo" });
    await pickFile(page, { name: "future.png", mimeType: "image/png", buffer: PNG });
    await dialog.getByLabel("Taken on").fill("2099-12-31");
    await dialog.getByRole("button", { name: "Save photo" }).click();
    // A photo can't have been taken after today (habit dates already refuse this with "Can't be in the future").
    await expect(dialog.getByText(/future/i)).toBeVisible();
    await expect(page.getByRole("tabpanel", { name: "Photos" }).getByText("Dec 31")).toHaveCount(0);
  });

  test("a link to a patient that does not exist shows an error, not a blank page", async ({ page }) => {
    await signInAt(page, BULILIT);
    await page.goto("/patients/does-not-exist");
    await expect(page.getByText(/couldn't|not found/i).first()).toBeVisible();
  });

  test("a signed-out person pasting a patient link is sent to sign in", async ({ page }) => {
    await page.goto("/patients/patient_roster_8?tab=chart");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
  });

  test("password is masked and can be shown before signing in", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    const pw = form.getByLabel("Password", { exact: true });
    await pw.fill(DEMO_PASSWORD);
    await expect(pw).toHaveAttribute("type", "password");
    await form.getByRole("button", { name: "Show password" }).click();
    await expect(pw).toHaveAttribute("type", "text");
  });
});
