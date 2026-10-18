import { expect, test, type Page } from "@playwright/test";
import { DEMO_PASSWORD, USERS, signIn } from "./support/users";

/**
 * Pilot test: a parent (parent@gmail.com, Aliya Lynch) using the Bulilit portal on a Pixel 7.
 * Two children: Mazie (mid-treatment, 3 of 6 done) and Mika (one booked check-up). Everything goes through the UI.
 */

// The shared server is busy while other pilot agents run: give each story room, and the first loads more time.
test.describe.configure({ timeout: 120_000 });

// ---------- helpers (UI only) ----------

const NOTICE_HEADING = "Bulilit Smiles Pediatric Dental's privacy notice";

/** Signs in and lands on the privacy notice the parent must read first. */
async function signInToNotice(page: Page) {
  await signIn(page, USERS.parent);
  await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible({ timeout: 30_000 });
}

/** Signs in, reads the notice and arrives on the portal home. */
async function openPortal(page: Page) {
  await signInToNotice(page);
  await page.getByRole("button", { name: "I've read this" }).click();
  await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
}

const bottomNav = (page: Page) => page.getByRole("navigation", { name: "Portal" });

/** Taps a section in the phone's bottom tab bar, opening More for the ones that live there. */
async function goTo(page: Page, section: "Home" | "Appointments" | "Bills" | "Treatment plan" | "Care instructions" | "Uploads") {
  if (["Home", "Appointments", "Bills"].includes(section)) {
    await bottomNav(page).getByRole("link", { name: section, exact: true }).click();
  } else {
    await bottomNav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet).toBeVisible();
    await sheet.getByRole("link", { name: section }).click();
    await expect(sheet).toBeHidden();
  }
}

const childSwitcher = (page: Page) => page.getByRole("group", { name: "Whose records to show" });
/** Mazie's seeded parent upload (seed-photos.ts). */
const SEEDED_UPLOAD = "Paediatrician's clearance";

async function pickChild(page: Page, name: "Mazie" | "Mika") {
  await childSwitcher(page).getByRole("button", { name }).click();
  await expect(childSwitcher(page).getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
}

async function signOutFromMenu(page: Page) {
  await page.getByRole("button", { name: /Aliya Lynch, Parent\. Account menu/ }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  const dialog = page.getByRole("dialog", { name: "Sign out?" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const toast = (page: Page, text: string | RegExp) => page.locator("[data-sonner-toast]").filter({ hasText: text });

/** Reads layout only (no state change): true when the page is wider than the phone screen. */
async function overflowsHorizontally(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
}

// A 1x1 PNG, a tiny PDF and a text file the parent might pick from their phone.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

const fileInput = (page: Page) => page.getByLabel("Photo or PDF");
const captionInput = (page: Page) => page.getByLabel("Description");
const reasonInput = (page: Page) => page.getByLabel("What is the visit for?");
const noteInput = (page: Page) => page.getByLabel("Anything we should know? (optional)");

async function chooseUploadKind(page: Page, kind: "Medical document (clearance, lab result)" | "Photo of teeth or mouth") {
  await page.getByRole("combobox", { name: "What are you sending?" }).click();
  await page.getByRole("option", { name: kind }).click();
}

// ======================================================================

test.describe("happy paths", () => {
  test("parent reads the clinic's privacy notice with both children's consents and opens the portal", async ({ page }) => {
    await signInToNotice(page);
    await expect(page.getByText("Version 1 · Template, pending legal review")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Your consents on record" })).toBeVisible();
    await expect(page.getByText("Mazie", { exact: true })).toBeVisible();
    await expect(page.getByText("Mika", { exact: true })).toBeVisible();
    await expect(page.getByText(/Privacy contact: Dr\. Paolo Villanueva/)).toBeVisible();

    await page.getByRole("button", { name: "I've read this" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(/\/portal$/);
    await expect(page.getByText("Powered by Primolar")).toBeVisible();
  });

  test("parent who already read the notice is not asked again after signing out and back in", async ({ page }) => {
    await openPortal(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
    await signOutFromMenu(page);
    await signIn(page, USERS.parent);
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toHaveCount(0);
  });

  test("parent switches between Mazie and Mika and every section follows the chosen child", async ({ page }) => {
    await openPortal(page);
    await expect(childSwitcher(page).getByRole("button")).toHaveCount(2);
    await expect(page.getByText(/^Mazie Lynch, \d+ y \d+ m$/)).toBeVisible();

    await pickChild(page, "Mika");
    await expect(page.getByText(/^Mika Lynch, 3 y 4 m$/)).toBeVisible();
    await expect(page.getByText("Nothing planned right now")).toBeVisible();

    await goTo(page, "Appointments");
    await expect(page.getByRole("heading", { name: "Mika's appointments" })).toBeVisible();
    await expect(page.getByText(/Oral examination with Dr\./)).toBeVisible();

    await pickChild(page, "Mazie");
    await expect(page.getByRole("heading", { name: "Mazie's appointments" })).toBeVisible();
    await expect(page.getByText(/Extraction with Dr\./).first()).toBeVisible();
  });

  test("parent sees how far along Mazie's treatment plan is, item by item", async ({ page }) => {
    await openPortal(page);
    await expect(page.getByText("3 of 6 treatments done")).toBeVisible();
    await page.getByRole("link", { name: "See the plan" }).click();
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toBeVisible();
    const progress = page.getByRole("progressbar", { name: "Treatments done" });
    await expect(progress).toHaveAttribute("aria-valuenow", "3");
    await expect(progress).toHaveAttribute("aria-valuemax", "6");
    await expect(page.getByText("Prophylaxis (cleaning)")).toBeVisible();
    await expect(page.getByText("Tooth 74, Lower left primary first molar")).toBeVisible();
    await expect(page.getByText("Planned", { exact: true })).toHaveCount(3);
    await expect(page.getByText("Done", { exact: true })).toHaveCount(3);
  });

  // Mika's seeded check-up is always booked (seed.ts, appointment_sibling); Mazie's next visit may already be confirmed.
  test("parent confirms Mika's next visit from Home and it stays confirmed after a reload", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    const nextVisit = page.locator("section").filter({ has: page.getByRole("heading", { name: "Next visit" }) });
    await nextVisit.getByRole("button", { name: "Confirm visit" }).click();
    await expect(toast(page, /Thanks! Mika's visit on .+ is confirmed\./)).toBeVisible();
    await expect(nextVisit.getByText("Confirmed")).toBeVisible();
    await page.reload();
    await pickChild(page, "Mika");
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
    await expect(nextVisit.getByText("Confirmed")).toBeVisible();
    await expect(nextVisit.getByRole("button", { name: "Confirm visit" })).toHaveCount(0);
  });

  test("parent confirms Mika's check-up from the Appointments page", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Appointments");
    await expect(page.getByRole("heading", { name: "Mika's appointments" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm visit" }).click();
    await expect(toast(page, /Thanks! Mika's visit on .+ is confirmed\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm visit" })).toHaveCount(0);
    await expect(page.getByText("Confirmed", { exact: true })).toBeVisible();
  });

  test("parent requests a morning appointment for Mika and the request is remembered after a reload", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Appointments");
    await page.getByRole("combobox", { name: "Time of day" }).click();
    await page.getByRole("option", { name: "Morning" }).click();
    await reasonInput(page).fill("Check-up and cleaning");
    await noteInput(page).fill("Mika is shy with new people.");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: /We have your request for .+ \(morning\)\./ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole("heading", { name: "Mika's appointments" })).toBeVisible();
    await expect(page.getByText(/We have your request for .+ \(morning\)\./)).toBeVisible();

    // The request was Mika's: Mazie can still have her own.
    await pickChild(page, "Mazie");
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("parent uploads a medical clearance PDF and sees it listed, still there after a reload", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await expect(page.getByRole("heading", { name: "Uploads for Mazie" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toBeVisible();
    await fileInput(page).setInputFiles({ name: "clearance.pdf", mimeType: "application/pdf", buffer: PDF });
    await captionInput(page).fill("Medical clearance from Dr. Cruz");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(toast(page, "Uploaded. The clinic can see it now.")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Medical clearance from Dr. Cruz" })).toBeVisible();
    await expect(captionInput(page)).toHaveValue("");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Uploads for Mazie" })).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Medical clearance from Dr. Cruz" })).toBeVisible();
  });

  test("parent uploads a photo of Mika's teeth and it shows with its description", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Uploads");
    await expect(page.getByRole("heading", { name: "Uploads for Mika" })).toBeVisible();
    await chooseUploadKind(page, "Photo of teeth or mouth");
    await fileInput(page).setInputFiles({ name: "ngipin.png", mimeType: "image/png", buffer: PNG });
    await captionInput(page).fill("Front tooth looks dark");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(toast(page, "Uploaded. The clinic can see it now.")).toBeVisible();
    await expect(page.getByRole("img", { name: "Front tooth looks dark" })).toBeVisible();
    // Mazie's uploads are separate.
    await pickChild(page, "Mazie");
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toBeVisible();
    await expect(page.getByRole("img", { name: "Front tooth looks dark" })).toHaveCount(0);
  });

  test("parent switches reminder messages off for Mika only and the choice persists", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    const reminders = page.getByRole("checkbox", { name: "Reminder messages allowed" });
    await expect(reminders).toBeChecked();
    await reminders.click();
    await expect(toast(page, "Consent updated")).toBeVisible();
    await expect(reminders).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
    await pickChild(page, "Mika");
    await expect(page.getByRole("checkbox", { name: "Reminder messages allowed" })).not.toBeChecked();
    await pickChild(page, "Mazie");
    await expect(page.getByRole("checkbox", { name: "Reminder messages allowed" })).toBeChecked();
    // And back on again.
    await pickChild(page, "Mika");
    await page.getByRole("checkbox", { name: "Reminder messages allowed" }).click();
    await expect(page.getByRole("checkbox", { name: "Reminder messages allowed" })).toBeChecked();
  });

  test("parent opens the clinic's privacy notice from Home and comes back with the back button", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("link", { name: "Read the clinic's privacy notice" }).click();
    await expect(page.getByRole("heading", { name: /privacy notice/i }).first()).toBeVisible();
    await expect(page.getByText(/Data Privacy Act of 2012/).first()).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
  });

  test("parent reads the bills, care instructions and every bottom-bar section without leaving the portal", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Bills");
    await expect(page.getByRole("heading", { name: "Bills for Mazie" })).toBeVisible();
    await expect(bottomNav(page).getByRole("link", { name: "Bills" })).toHaveAttribute("aria-current", "page");
    await goTo(page, "Care instructions");
    await expect(page.getByRole("heading", { name: "Care instructions for Mazie" })).toBeVisible();
    await expect(page.getByText("If you're worried about Mazie after a treatment, call the clinic.")).toBeVisible();
    await expect(bottomNav(page).getByRole("button", { name: "More" })).toBeVisible();
    await goTo(page, "Treatment plan");
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toBeVisible();
    await goTo(page, "Home");
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
  });

  test("parent signs out from the account menu and lands on sign-in", async ({ page }) => {
    await openPortal(page);
    await signOutFromMenu(page);
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
  });
});

// ======================================================================

test.describe("failed paths", () => {
  test("parent types the wrong password and is told plainly", async ({ page }) => {
    await signIn(page, USERS.parent, "pass1234");
    await expect(page.getByRole("alert").filter({ hasText: "That mobile number or email and password don't match a demo account" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("parent taps Sign in with nothing filled in and sees what is missing", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter your mobile number or email")).toBeVisible();
    await expect(form.getByText("Enter your password")).toBeVisible();
    await form.getByLabel("Mobile number or email").fill("parent@gmail");
    await form.getByLabel("Password", { exact: true }).fill(DEMO_PASSWORD);
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter a mobile number like 0917 123 4567, or an email address")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("parent who signs out instead of accepting the notice never reaches the portal, even with the back button", async ({ page }) => {
    await signInToNotice(page);
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toHaveCount(0);
    await page.goto("/portal");
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toHaveCount(0);
    // Signing in again asks again, because it was never acknowledged.
    await signInToNotice(page);
  });

  test("parent who skips the notice by typing a portal URL still gets the notice first", async ({ page }) => {
    await signInToNotice(page);
    await page.goto("/portal/plan");
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("heading", { name: NOTICE_HEADING })).toBeVisible();
    await page.getByRole("button", { name: "I've read this" }).click();
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toBeVisible();
  });

  for (const path of ["/dashboard", "/patients", "/patients/new", "/appointments", "/billing", "/messages", "/recall", "/documents", "/settings"]) {
    test(`parent who types the staff URL ${path} is told it is for clinic staff`, async ({ page }) => {
      await openPortal(page);
      await page.goto(path);
      await expect(page.getByText("You don't have access to this page")).toBeVisible();
      await expect(page.getByText("You're signed in as Aliya Lynch (Parent). This part of the app is for clinic staff.")).toBeVisible();
      await page.getByRole("link", { name: "Go to your home page" }).click();
      await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
    });
  }

  test("parent who types the Primolar console URL only gets the console's own sign-in", async ({ page }) => {
    await openPortal(page);
    await page.goto("/operator");
    await expect(page).toHaveURL(/\/operator\/login$/);
    await expect(page.getByText("Primolar console")).toBeVisible();
    await page.goto("/operator/signups");
    await expect(page).toHaveURL(/\/operator\/login$/);
  });

  test("parent tries to upload without a file or a description and is told what is missing", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Choose a photo or a PDF")).toBeVisible();
    await expect(page.getByText("Say what this is, like “Medical clearance from Dr. Cruz”")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toHaveCount(1); // nothing new listed
  });

  test("parent tries to send a PDF as a photo of teeth and is asked for an image", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await chooseUploadKind(page, "Photo of teeth or mouth");
    await fileInput(page).setInputFiles({ name: "teeth.pdf", mimeType: "application/pdf", buffer: PDF });
    await captionInput(page).fill("Teeth");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Attach an image file")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toHaveCount(1); // nothing new listed
  });

  test("parent tries to send a text file as a medical document and is refused", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await fileInput(page).setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
    await captionInput(page).fill("Notes");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Attach a photo or a PDF")).toBeVisible();
  });

  test("parent tries to upload a file over 10 MB and is told the limit", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);
    await fileInput(page).setInputFiles({ name: "scan.pdf", mimeType: "application/pdf", buffer: big });
    await captionInput(page).fill("Big scan");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Files must be under 10 MB")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toHaveCount(1); // nothing new listed
  });

  test("parent who switched clinical photos off cannot then upload a photo of the teeth", async ({ page }) => {
    await openPortal(page);
    const photos = page.getByRole("checkbox", { name: "Clinical photos allowed" });
    await photos.click();
    await expect(toast(page, "Consent updated")).toBeVisible();
    await expect(photos).not.toBeChecked();
    await goTo(page, "Uploads");
    await chooseUploadKind(page, "Photo of teeth or mouth");
    await fileInput(page).setInputFiles({ name: "teeth.png", mimeType: "image/png", buffer: PNG });
    await captionInput(page).fill("Swollen gum");
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(toast(page, /Mazie's family declined clinical photos/)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: SEEDED_UPLOAD })).toHaveCount(1); // nothing new listed
  });

  test("parent sends a request without saying what the visit is for and is asked to", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Say what the visit is for")).toBeVisible();
    await reasonInput(page).fill("   ");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Say what the visit is for")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("parent types a date in the past and the request is refused", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await page.getByLabel("Preferred date").fill("2020-01-15");
    await reasonInput(page).fill("Check-up");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Pick today or a later date")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("parent cancels signing out and stays in the portal", async ({ page }) => {
    await openPortal(page);
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    const dialog = page.getByRole("dialog", { name: "Sign out?" });
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
    // Escape closes it too.
    await page.getByRole("button", { name: /Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page).toHaveURL(/\/portal$/);
  });
});

// ======================================================================

test.describe("edge cases", () => {
  test("Mika has no treatment plan, no bills and no care instructions: each page says so kindly", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Treatment plan");
    await expect(page.getByText("Nothing planned right now")).toBeVisible();
    await expect(page.getByText("After a check-up, the dentist's plan for Mika will show here.")).toBeVisible();
    await goTo(page, "Bills");
    await expect(page.getByText("No bills yet")).toBeVisible();
    await goTo(page, "Care instructions");
    await expect(page.getByText("No instructions yet")).toBeVisible();
    await expect(page.getByText("After a treatment, the clinic's instructions for Mika will show here.")).toBeVisible();
  });

  test("the chosen child stays chosen across sections and after a reload", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Treatment plan");
    await expect(page.getByRole("heading", { name: "Mika's treatment plan" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mika's treatment plan" })).toBeVisible();
    await expect(childSwitcher(page).getByRole("button", { name: "Mika" })).toHaveAttribute("aria-pressed", "true");
  });

  test("a second request for the same child is not possible while one is waiting", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).fill("Toothache");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
    await expect(page.getByText(/We have your request for/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toHaveCount(0);
    await expect(reasonInput(page)).toHaveCount(0);
  });

  test("double-tapping Send request sends just one request, with no error", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).fill("Cleaning");
    await page.getByRole("button", { name: "Send request" }).dblclick();
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
    await expect(page.getByText(/We have your request for/)).toBeVisible();
    await expect(toast(page, /already have a request waiting/)).toHaveCount(0);
  });

  test("a request reason of exactly 200 characters is accepted, 201 is not", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).fill("a".repeat(201));
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Keep it under 200 characters")).toBeVisible();
    await reasonInput(page).fill("b".repeat(200));
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
  });

  test("a note over 500 characters is refused with a clear message", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).fill("Check-up");
    await noteInput(page).fill("n".repeat(501));
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(page.getByText("Keep it under 500 characters")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("today's date is accepted for a request (the earliest allowed)", async ({ page }) => {
    await openPortal(page);
    await pickChild(page, "Mika");
    await goTo(page, "Appointments");
    const date = page.getByLabel("Preferred date");
    const today = await date.inputValue();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await expect(date).toHaveAttribute("min", today);
    await reasonInput(page).fill("Masakit ang ngipin ni Niño");
    await page.getByRole("button", { name: "Send request" }).click();
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
  });

  test("reloading half-way through a request discards it and nothing is sent", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).fill("Half-typed reason");
    await page.reload();
    await expect(page.getByRole("heading", { name: "Mazie's appointments" })).toBeVisible();
    await expect(reasonInput(page)).toHaveValue("");
    await expect(page.getByRole("button", { name: "Send request" })).toBeVisible();
  });

  test("parent fills in and sends a request using only the keyboard", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await reasonInput(page).focus();
    await page.keyboard.type("Check-up para kay Mazie");
    await page.keyboard.press("Tab");
    await expect(noteInput(page)).toBeFocused();
    await page.keyboard.type("Pakitawagan po ako pagkatapos ng 5 PM.");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Send request" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(toast(page, "Request sent. The clinic will call you.")).toBeVisible();
  });

  test("an upload description with Filipino characters and an apostrophe shows exactly as typed", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    const caption = "Clearance ni Niño mula kay Dr. Peñaflor — O'Brien Lab";
    await fileInput(page).setInputFiles({ name: "clearance-niño.pdf", mimeType: "application/pdf", buffer: PDF });
    await captionInput(page).fill(caption);
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(toast(page, "Uploaded. The clinic can see it now.")).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: caption })).toHaveText(caption);
  });

  test("BUG: a 200-character upload description without spaces widens the phone screen (201 is refused)", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await fileInput(page).setInputFiles({ name: "doc.pdf", mimeType: "application/pdf", buffer: PDF });
    await captionInput(page).fill("x".repeat(201));
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(page.getByText("Keep it under 200 characters")).toBeVisible();
    const long = "Mahabang_paglalarawan_".repeat(9) + "ab"; // 200 chars, no spaces to wrap on
    expect(long).toHaveLength(200);
    await captionInput(page).fill(long);
    await page.getByRole("button", { name: "Upload" }).click();
    await expect(toast(page, "Uploaded. The clinic can see it now.")).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: long })).toBeVisible();
    expect(await overflowsHorizontally(page)).toBe(false);
  });

  test("double-tapping Upload stores the file only once", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Uploads");
    await fileInput(page).setInputFiles({ name: "x.pdf", mimeType: "application/pdf", buffer: PDF });
    await captionInput(page).fill("Lab result");
    await page.getByRole("button", { name: "Upload" }).dblclick();
    await expect(toast(page, "Uploaded. The clinic can see it now.").first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Uploads for Mazie" })).toBeVisible();
    await expect(page.getByRole("paragraph").filter({ hasText: /^Lab result$/ })).toHaveCount(1);
  });

  test("the More sheet closes with Escape and leaves the parent where they were", async ({ page }) => {
    await openPortal(page);
    await bottomNav(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog", { name: "More" });
    await expect(sheet.getByRole("link")).toHaveCount(3);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible();
  });

  test("BUG: the back button returns to the previous portal section without a long \"Opening\" wait", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Appointments");
    await expect(page.getByRole("heading", { name: "Mazie's appointments" })).toBeVisible();
    await goTo(page, "Treatment plan");
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toBeVisible();
    // A person pressing Back expects the previous page at once, not a loader. 5 s is generous for a cached page.
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Mazie's appointments" })).toBeVisible({ timeout: 5_000 });
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Hello, Aliya" })).toBeVisible({ timeout: 5_000 });
  });

  test("after signing out, the back button does not show the children's records", async ({ page }) => {
    await openPortal(page);
    await goTo(page, "Treatment plan");
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toBeVisible();
    await signOutFromMenu(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Mazie's treatment plan" })).toHaveCount(0);
  });

  test("no portal page is wider than the phone screen", async ({ page }) => {
    await openPortal(page);
    expect(await overflowsHorizontally(page), "Home").toBe(false);
    for (const section of ["Appointments", "Bills", "Treatment plan", "Care instructions", "Uploads"] as const) {
      await goTo(page, section);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await overflowsHorizontally(page), section).toBe(false);
    }
    await page.goto("/login");
    expect(await overflowsHorizontally(page), "login").toBe(false);
  });

  test("main portal controls are big enough to tap on a phone (at least 44 px tall)", async ({ page }) => {
    await openPortal(page);
    const targets = [
      ...["Home", "Appointments", "Bills"].map((n) => bottomNav(page).getByRole("link", { name: n, exact: true })),
      bottomNav(page).getByRole("button", { name: "More" }),
      childSwitcher(page).getByRole("button", { name: "Mazie" }),
      childSwitcher(page).getByRole("button", { name: "Mika" }),
      page.getByRole("button", { name: /Account menu/ }),
      page.getByRole("link", { name: "See the plan" }),
    ];
    const tall = async (t: (typeof targets)[number]) => {
      const box = await t.boundingBox();
      expect(box, String(t)).not.toBeNull();
      expect(box!.height, String(t)).toBeGreaterThanOrEqual(44);
    };
    for (const t of targets) await tall(t);
    // Mika's seeded check-up is always booked; Mazie's next visit may already be confirmed.
    await pickChild(page, "Mika");
    await tall(page.getByRole("button", { name: "Confirm visit" }).first());
  });

  test("BUG: the photo and reminder consent switches are too small to tap on a phone", async ({ page }) => {
    await openPortal(page);
    for (const name of ["Clinical photos allowed", "Reminder messages allowed"]) {
      const box = await page.getByRole("checkbox", { name }).boundingBox();
      expect(box).not.toBeNull();
      // WCAG 2.2 target size (minimum) is 24 x 24 CSS px; the rest of the portal uses 44 px.
      expect(box!.height, name).toBeGreaterThanOrEqual(24);
      expect(box!.width, name).toBeGreaterThanOrEqual(24);
    }
  });

  test("tapping the consent label (not just the tiny box) toggles it", async ({ page }) => {
    await openPortal(page);
    await page.getByText("Clinical photos allowed").click();
    await expect(toast(page, "Consent updated")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Clinical photos allowed" })).not.toBeChecked();
  });

  test("a parent only ever sees their own two children", async ({ page }) => {
    await openPortal(page);
    await expect(childSwitcher(page).getByRole("button")).toHaveText(["Mazie", "Mika"]);
  });
});
