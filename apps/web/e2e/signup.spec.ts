import { expect, test, type Page } from "@playwright/test";
import { signInOperator } from "./support/users";

// Several pilot agents share one server, and the full stories sign in and out three times: give them room.
test.describe.configure({ timeout: 120_000 });

/*
 * Pilot tests for DEMO_SCRIPT section 7: a new clinic joins through /get-started, with no sign-in.
 * UI only: typing, clicking, choosing files through the file chooser, and reading the screen.
 */

// A 1x1 PNG, as a real logo file the person picks from their computer.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG });

const HAGIKGIK = { name: "Hagikgik Kids Dental", reference: "PRM-HGK2-7QXM" }; // the seeded sign-up, waiting for its fee

const uniq = () => Math.random().toString(36).slice(2, 6).toUpperCase();

type Clinic = {
  name: string;
  contactEmail: string;
  tin: string;
  branch: string;
  address: string;
  phone: string;
  owner: string;
  ownerEmail: string;
};

const clinic = (over: Partial<Clinic> = {}): Clinic => {
  const id = uniq();
  return {
    name: `Ngiping Masaya ${id} Dental`,
    contactEmail: `hello.${id.toLowerCase()}@masaya.ph`,
    tin: "123456789",
    branch: "Las Piñas",
    address: "12 Alabang–Zapote Road, Las Piñas",
    phone: "0917 123 4567",
    owner: "Dr. Ma. Niña O'Brien-Dela Cruz",
    ownerEmail: `nina.${id.toLowerCase()}@masaya.ph`,
    ...over,
  };
};

// ---------- helpers: the public form ----------

const sendButton = (page: Page) => page.getByRole("button", { name: /^(Send sign-up|Sending)$/ });
const terms = (page: Page) => page.getByRole("checkbox", { name: /I'm authorised to act for this clinic/ });
const field = (page: Page, label: string) => page.locator("main form").first().getByLabel(label, { exact: true });
const colourBox = (page: Page) => page.getByRole("textbox", { name: "Brand colour", exact: true });

async function openGetStarted(page: Page) {
  await page.goto("/get-started");
  await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
  await expect(sendButton(page)).toBeVisible(); // the prices have loaded, so the form is on screen
}

async function fillClinic(page: Page, c: Clinic) {
  await field(page, "Clinic name").fill(c.name);
  await field(page, "Contact email").fill(c.contactEmail);
  await field(page, "TIN").fill(c.tin);
  await field(page, "Branch name").fill(c.branch);
  await field(page, "Address").fill(c.address);
  await field(page, "Phone").fill(c.phone);
  await field(page, "Full name").fill(c.owner);
  await field(page, "Email").fill(c.ownerEmail);
}

const plan = (page: Page, name: "Small" | "Mid" | "Big") => page.getByRole("radio", { name: new RegExp(`^${name}`) });
const look = (page: Page, name: "Use my own" | "Use the default look" | "Design it for me") =>
  page.getByRole("radio", { name: new RegExp(`^${name}`) });

/** Clicks the picker's button and chooses files in the file chooser, like a person would. */
async function chooseFiles(page: Page, button: RegExp, files: { name: string; mimeType: string; buffer: Buffer }[]) {
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: button }).click();
  await (await chooser).setFiles(files);
}
const chooseLogo = (page: Page, file = png("logo.png")) => chooseFiles(page, /^Logo/, [file]);

async function chooseFont(page: Page, font: string) {
  await page.getByRole("combobox", { name: "Heading font" }).click();
  await page.getByRole("option", { name: font, exact: true }).click();
}

async function submitSignup(page: Page) {
  await terms(page).check();
  await sendButton(page).click();
  await expect(page).toHaveURL(/\/get-started\/PRM-[A-Z0-9]{4}-[A-Z0-9]{4}$/, { timeout: 15_000 });
}

/** Fills and sends a valid sign-up with the default look; returns the reference from the thank-you page. */
async function signUp(page: Page, c: Clinic) {
  await openGetStarted(page);
  await fillClinic(page, c);
  await submitSignup(page);
  await expect(page.getByRole("heading", { level: 1, name: `Thank you. ${c.name} is signed up` })).toBeVisible();
  return readReference(page);
}

async function readReference(page: Page) {
  const text = await page.getByText(/^Your reference:/).innerText();
  const match = text.match(/PRM-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  expect(match, "the thank-you page shows a PRM reference").toBeTruthy();
  return match![0];
}

async function checkReference(page: Page, reference: string) {
  await openGetStarted(page);
  await page.getByLabel("Reference").fill(reference);
  await page.getByRole("button", { name: "Check sign-up" }).click();
  await expect(page).toHaveURL(/\/get-started\/[^/]+$/, { timeout: 20_000 });
}

const amountDue = (page: Page, title = "Amount due") => page.getByRole("region", { name: title });
const amountRow = (page: Page, label: string, title = "Amount due") =>
  amountDue(page, title).locator("div").filter({ has: page.getByText(label, { exact: true }) }).locator("dd");

/** The inline error under a labelled field (FormField puts it in the field's aria-describedby). */
async function expectFieldError(page: Page, label: string, message: string | RegExp) {
  await expect(field(page, label)).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, label)).toHaveAccessibleDescription(message instanceof RegExp ? message : new RegExp(escape(message)));
}
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- helpers: the operator console and the new Owner ----------

async function openSignupInConsole(page: Page, clinicName: string) {
  await signInOperator(page);
  await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Sign-ups" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Sign-ups" })).toBeVisible();
  await page.getByRole("link", { name: clinicName, exact: true }).click();
  await expect(page.getByRole("heading", { name: clinicName, exact: true })).toBeVisible();
}

async function recordPayment(page: Page) {
  await page.getByRole("button", { name: "Record payment" }).click();
  await page.getByRole("dialog", { name: "Record payment" }).getByRole("button", { name: "Record payment" }).click();
  await expect(page.getByText("Payment recorded")).toBeVisible();
}

/** Approves, reads the temporary password off the screen, and closes the one-time dialog. */
async function approve(page: Page, c: Clinic) {
  await page.getByRole("button", { name: "Approve and create clinic" }).click();
  const created = page.getByRole("dialog", { name: `${c.name} is on Primolar` });
  await expect(created).toBeVisible();
  await expect(created.getByText(c.ownerEmail)).toBeVisible();
  await expect(created.getByText(`${c.owner} can sign in now`)).toBeVisible();
  const password = (await created.locator("dt:has-text('Temporary password') + dd").innerText()).trim();
  expect(password.length).toBeGreaterThan(5);
  await created.getByRole("button", { name: "I've passed it on" }).click();
  await expect(created).toBeHidden();
  return password;
}

async function signOutOperator(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/operator\/login/);
}

/** The new Owner signs in with the temporary password, chooses their own, and passes the first-sign-in notices. */
async function ownerFirstSignIn(page: Page, email: string, password: string) {
  const signInForm = page.getByRole("region", { name: "Sign in" });
  await signInForm.getByLabel("Email").fill(email);
  await signInForm.getByLabel("Password", { exact: true }).fill(password);
  await signInForm.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Choose your password" })).toBeVisible({ timeout: 15_000 });
  await page.getByLabel("Temporary password").fill(password);
  await page.getByLabel("New password").fill("masaya-2026!");
  await page.getByRole("button", { name: "Save and continue" }).click();
  for (let i = 0; i < 3; i++) {
    const ack = page.getByRole("main").getByRole("button", { name: /^(I understand|Continue|Accept|I agree|Got it)/ });
    const shell = page.getByRole("button", { name: /Account menu$/ }).first();
    await expect(ack.or(shell).first()).toBeVisible({ timeout: 15_000 });
    if (await shell.isVisible()) return;
    const box = page.getByRole("main").getByRole("checkbox").first();
    if (await box.isVisible().catch(() => false)) await box.check();
    await ack.first().click();
  }
}

async function openSettingsLook(page: Page) {
  await page.getByRole("link", { name: "Settings" }).first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Look" })).toBeVisible();
}

// =====================================================================================================

test.describe("happy paths", () => {
  test("a new clinic signs up with its own look, Primolar approves it, and the Owner signs in to that look", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await fillClinic(page, c);
    await plan(page, "Mid").click();
    await look(page, "Use my own").click();
    await chooseLogo(page);
    await expect(page.getByRole("img", { name: "logo.png" })).toBeVisible();
    await colourBox(page).fill("#7b2d8e");
    await expect(page.getByLabel("Preview")).toBeVisible();
    await chooseFont(page, "Poppins");
    await submitSignup(page);

    await expect(page.getByRole("heading", { level: 1, name: `Thank you. ${c.name} is signed up` })).toBeVisible();
    await expect(page.getByText("Waiting for setup fee")).toBeVisible();
    await expect(page.getByText(`${c.name} · Mid plan · Use my own`)).toBeVisible();
    const reference = await readReference(page);

    // Primolar's operator, on the same device.
    await openSignupInConsole(page, c.name);
    await expect(page.getByText(reference)).toBeVisible();
    await expect(page.getByText("#7b2d8e")).toBeVisible();
    await expect(page.getByText("Heading font: Poppins")).toBeVisible();
    await expect(page.getByText(`${c.owner} · ${c.ownerEmail} · dentist`)).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toBeDisabled();
    await recordPayment(page);
    const password = await approve(page, c);
    await signOutOperator(page);

    // The client checks their reference (typed in lower case): approved.
    await checkReference(page, reference.toLowerCase());
    await expect(page.getByRole("heading", { level: 1, name: `${c.name} is on Primolar` })).toBeVisible();
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Paid" })).toBeVisible();

    // The new Owner signs in from the status page's link.
    await page.getByRole("link", { name: "sign in here" }).click();
    await ownerFirstSignIn(page, c.ownerEmail, password);

    // The clinic is already in the look it chose: its logo, its colour and its font.
    await expect(page.getByRole("img", { name: c.name }).first()).toBeVisible({ timeout: 15_000 });
    await openSettingsLook(page);
    await expect(colourBox(page)).toHaveValue("#7b2d8e");
    await expect(page.getByRole("combobox", { name: "Heading font" })).toHaveText(/Poppins/);
  });

  test("a clinic that picks the default look is approved and its Owner sees the clinic's name where a logo goes", async ({ page }) => {
    const c = clinic({ owner: "Jose Rizal Mercado", ownerEmail: `jose.${uniq().toLowerCase()}@masaya.ph` });
    await openGetStarted(page);
    await fillClinic(page, c);
    await page.getByRole("checkbox", { name: "The Owner also treats patients (a dentist)" }).uncheck();
    await expect(look(page, "Use the default look")).toBeChecked();
    await submitSignup(page);
    await expect(page.getByText(`${c.name} · Small plan · Use the default look`)).toBeVisible();

    await openSignupInConsole(page, c.name);
    await expect(page.getByText(`${c.owner} · ${c.ownerEmail}`, { exact: true })).toBeVisible(); // not a dentist
    await recordPayment(page);
    const password = await approve(page, c);
    await signOutOperator(page);

    await page.goto("/login");
    await ownerFirstSignIn(page, c.ownerEmail, password);
    await expect(page.getByText(c.name, { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("img", { name: c.name })).toHaveCount(0);
  });

  test("a clinic asks Primolar to design its look, with a brief and reference images, and pays the design fee", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await fillClinic(page, c);
    await plan(page, "Big").click();
    await look(page, "Design it for me").click();
    await field(page, "Your brief").fill("Masaya at payapa: mint green and sunny yellow, walang pula. Para sa mga batang takot sa dentista.");
    await chooseFiles(page, /^Looks you like/, [png("ref-1.png"), png("ref-2.png")]);
    await expect(page.getByRole("img", { name: "ref-1.png" })).toBeVisible();
    await expect(page.getByRole("img", { name: "ref-2.png" })).toBeVisible();
    await expect(amountRow(page, "Design it for me")).toHaveText(/7,500/);
    await expect(amountRow(page, "Total")).toHaveText(/37,500/);
    await expect(page.getByText(/the setup fee and your first month, and the design/)).toBeVisible();
    await submitSignup(page);

    await expect(page.getByText(`${c.name} · Big plan · Design it for me`)).toBeVisible();
    await expect(amountRow(page, "Total")).toHaveText(/37,500/);

    await openSignupInConsole(page, c.name);
    await expect(page.getByText(/walang pula/)).toBeVisible();
    await expect(page.getByRole("img", { name: /Reference image/ })).toHaveCount(2);
  });

  test("the amount due follows the plan and look the clinic picks, VAT included", async ({ page }) => {
    await openGetStarted(page);
    await expect(plan(page, "Small")).toBeChecked();
    await expect(amountRow(page, "Setup fee")).toHaveText(/5,000/);
    await expect(amountRow(page, "First month")).toHaveText(/2,500/);
    await expect(amountRow(page, "Total")).toHaveText(/7,500/);
    await expect(amountDue(page)).toContainText(/Includes VAT \(12%\) of .*803\.57/);

    await plan(page, "Mid").click();
    await expect(amountRow(page, "Total")).toHaveText(/15,000/);
    await expect(amountDue(page)).toContainText(/1,607\.14/);

    await plan(page, "Big").click();
    await expect(amountRow(page, "Total")).toHaveText(/30,000/);

    await look(page, "Design it for me").click();
    await expect(amountRow(page, "Total")).toHaveText(/37,500/);
    await look(page, "Use my own").click();
    await expect(amountRow(page, "Design it for me")).toHaveCount(0);
    await expect(amountRow(page, "Total")).toHaveText(/30,000/);
  });

  test("a client checks the status of a sign-up with the reference from the thank-you page", async ({ page }) => {
    await checkReference(page, `  ${HAGIKGIK.reference.toLowerCase()} `);
    await expect(page).toHaveURL(new RegExp(`/get-started/${HAGIKGIK.reference}$`));
    await expect(page.getByRole("heading", { level: 1, name: `Thank you. ${HAGIKGIK.name} is signed up` })).toBeVisible();
    await expect(page.getByText("Waiting for setup fee")).toBeVisible();
    await expect(page.getByText("Primolar will send you a payment link.")).toBeVisible();
    await expect(page.getByText(`${HAGIKGIK.name} · Mid plan · Design it for me`)).toBeVisible();
    // A bookmarked status page still opens after a reload.
    await page.reload();
    await expect(page.getByText(HAGIKGIK.reference, { exact: true })).toBeVisible();
  });

  test("a client copies the reference from the thank-you page", async ({ page, context }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await signUp(page, clinic());
    await page.getByRole("button", { name: "Copy reference" }).click();
    await expect(page.getByText("Reference copied")).toBeVisible();
  });

  test("a clinic whose payment arrived sees it is being reviewed", async ({ page }) => {
    await openSignupInConsole(page, HAGIKGIK.name);
    await recordPayment(page);
    await signOutOperator(page);

    await page.goto(`/get-started/${HAGIKGIK.reference}`);
    await expect(page.getByRole("heading", { level: 1, name: "Payment received" })).toBeVisible();
    await expect(page.getByText("Paid, ready to approve")).toBeVisible();
    await expect(page.getByText("Primolar is reviewing your sign-up.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Paid" })).toBeVisible();
  });

  test("a rejected clinic reads Primolar's reason on its status page and can sign up again under the same name", async ({ page }) => {
    const c = clinic();
    const reference = await signUp(page, c);
    await openSignupInConsole(page, c.name);
    await page.getByRole("button", { name: "Reject" }).click();
    const dialog = page.getByRole("dialog", { name: `Reject ${c.name}?` });
    await dialog.getByLabel("Reason for the client").fill("Hindi namin ma-verify ang TIN.\nPakisuri at mag-sign up muli.");
    await dialog.getByRole("button", { name: "Reject sign-up" }).click();
    await expect(page.getByText(`${c.name} rejected`)).toBeVisible();
    await signOutOperator(page);

    await checkReference(page, reference);
    await expect(page.getByRole("heading", { level: 1, name: "Your sign-up wasn't approved" })).toBeVisible();
    const why = page.getByRole("region", { name: "Why" });
    await expect(why).toContainText("Hindi namin ma-verify ang TIN.");
    await expect(why).toContainText("Pakisuri at mag-sign up muli.");
    await expect(why).not.toContainText("refunded");

    // The name is free again once the old sign-up is rejected.
    await signUp(page, { ...c, contactEmail: `again.${uniq().toLowerCase()}@masaya.ph` });
  });

  test("a clinic owner finds the sign-up form from the sign-in page", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Get started with Primolar" }).click();
    await expect(page).toHaveURL(/\/get-started$/, { timeout: 20_000 });
    await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
    // ...and back to sign-in from the form's header.
    await page.getByRole("link", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 });
  });
});

// =====================================================================================================

test.describe("failed paths", () => {
  test("sending an empty form says what each required field needs and sends nothing", async ({ page }) => {
    await openGetStarted(page);
    await sendButton(page).click();
    await expectFieldError(page, "Clinic name", "Enter the clinic's name");
    await expectFieldError(page, "Contact email", "Enter the clinic's email address, like hello@clinic.ph");
    await expectFieldError(page, "TIN", "Enter the TIN like 123-456-789");
    await expectFieldError(page, "Branch name", "Enter the branch name");
    await expectFieldError(page, "Address", "Enter the branch address");
    await expectFieldError(page, "Phone", "Enter the branch phone number");
    await expectFieldError(page, "Full name", "Enter their full name");
    await expectFieldError(page, "Email", "Enter their email address, like name@example.com");
    await expect(page.getByText("Tick the box to accept the Terms of Service and the Data Processing Agreement")).toBeVisible();
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("a clinic that doesn't accept the Terms and the DPA is refused", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic());
    await expect(terms(page)).not.toBeChecked(); // unticked to start
    await sendButton(page).click();
    await expect(page.getByText("Tick the box to accept the Terms of Service and the Data Processing Agreement")).toBeVisible();
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("badly typed emails are refused for the clinic and for the Owner", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ contactEmail: "hello@masaya", ownerEmail: "nina at masaya.ph" }));
    await terms(page).check();
    await sendButton(page).click();
    await expectFieldError(page, "Contact email", "Enter the clinic's email address, like hello@clinic.ph");
    await expectFieldError(page, "Email", "Enter their email address, like name@example.com");
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("a TIN that is too short is refused with an example of the right shape", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ tin: "12345" }));
    await expect(field(page, "TIN")).toHaveValue("123-45");
    await submitAttempt(page);
    await expectFieldError(page, "TIN", "Enter the TIN like 123-456-789, with the branch code after it if there is one");
  });

  test("BUG: a branch phone that is not a phone number is refused", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ phone: "wala pa" }));
    await submitAttempt(page);
    // A real user expects "wala pa" ("none yet") to be refused, as a guardian's phone is ("like 0917 123 4567").
    const thanks = page.getByRole("heading", { level: 1, name: /^Thank you\./ });
    const invalid = page.locator("main form [aria-invalid=true]").first();
    await expect(thanks.or(invalid)).toBeVisible({ timeout: 15_000 });
    await expect(thanks, "the sign-up was sent with a phone of 'wala pa'").toHaveCount(0);
  });

  test("a clinic name already on Primolar is refused, ignoring case and extra spaces", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ name: "  bulilit   SMILES pediatric dental " }));
    await submitAttempt(page);
    await expectFieldError(page, "Clinic name", /already on Primolar or waiting to join\. Contact Primolar if it's yours\./);
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("a clinic name that is still waiting to join is refused", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ name: "hagikgik kids dental" }));
    await submitAttempt(page);
    await expectFieldError(page, "Clinic name", /already on Primolar or waiting to join/);
  });

  test("a contact email that already belongs to a clinic is refused, whatever its case", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic({ contactEmail: "HELLO@Ngiti.demo" }));
    await submitAttempt(page);
    await expectFieldError(page, "Contact email", "That contact email already belongs to a clinic on Primolar or one waiting to join. Contact Primolar if it's yours.");
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("Use my own without a logo asks for one", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic());
    await look(page, "Use my own").click();
    await submitAttempt(page);
    await expect(page.getByText("Add your logo, or choose Use the default look")).toBeVisible();
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("a logo that is not an image, or is over 1 MB, is refused before sending", async ({ page }) => {
    await openGetStarted(page);
    await look(page, "Use my own").click();
    await chooseLogo(page, { name: "logo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 not a logo") });
    await expect(page.getByText("Choose a PNG, JPG or SVG file")).toBeVisible();
    await expect(page.getByRole("img", { name: "logo.pdf" })).toHaveCount(0);

    await chooseLogo(page, { name: "huge.png", mimeType: "image/png", buffer: Buffer.concat([PNG, Buffer.alloc(1024 * 1024 + 10)]) });
    await expect(page.getByText("Logos must be 1 MB or smaller")).toBeVisible();
    await expect(page.getByRole("img", { name: "huge.png" })).toHaveCount(0);
  });

  test("a brand colour too light for text is refused, and the suggested darker one fixes it", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await fillClinic(page, c);
    await look(page, "Use my own").click();
    await chooseLogo(page);
    await colourBox(page).fill("#ffe066");
    const alert = page.getByRole("alert").filter({ hasText: "too light for text and buttons" });
    await expect(alert).toBeVisible();
    await submitAttempt(page);
    await expect(page).toHaveURL(/\/get-started$/);

    await alert.getByRole("button", { name: /^Use #[0-9a-f]{6}$/ }).click();
    await expect(alert).toBeHidden();
    await expect(page.getByLabel("Preview")).toBeVisible();
    await sendButton(page).click();
    await expect(page).toHaveURL(/\/get-started\/PRM-/, { timeout: 15_000 });
  });

  test("a brand colour that isn't a colour code says how to write one", async ({ page }) => {
    await openGetStarted(page);
    await look(page, "Use my own").click();
    await colourBox(page).fill("purple");
    await expect(page.getByRole("alert").filter({ hasText: "Enter a colour as # and six letters or digits" })).toBeVisible();
  });

  test("Design it for me without a brief asks for one", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic());
    await look(page, "Design it for me").click();
    await field(page, "Your brief").fill("    ");
    await submitAttempt(page);
    await expectFieldError(page, "Your brief", "Tell us the feel you want, and any colours you like or don't");
  });

  test("a branch that closes before it opens is refused", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic());
    await field(page, "Opens").fill("17:00");
    await field(page, "Closes").fill("09:00");
    await submitAttempt(page);
    await expectFieldError(page, "Closes", "Closing time must be after opening time");
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("a reference that doesn't exist says so and offers a new sign-up", async ({ page }) => {
    await checkReference(page, "PRM-ZZZZ-9999");
    await expect(page.getByText("We can't find that sign-up", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "start a new sign-up" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
  });

  test("a pasted link with a made-up reference shows the not-found page, not an error", async ({ page }) => {
    await page.goto("/get-started/not-a-reference");
    await expect(page.getByText("We can't find that sign-up", { exact: true })).toBeVisible();
  });

  test("checking with an empty reference does nothing", async ({ page }) => {
    await openGetStarted(page);
    await page.getByLabel("Reference").fill("   ");
    await page.getByRole("button", { name: "Check sign-up" }).click();
    await expect(page).toHaveURL(/\/get-started$/);
  });

  test("the operator cancels recording a payment with Escape and nothing is recorded", async ({ page }) => {
    await openSignupInConsole(page, HAGIKGIK.name);
    await page.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByRole("dialog", { name: "Record payment" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Waiting for setup fee").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Record payment" })).toBeFocused();
  });
});

async function submitAttempt(page: Page) {
  await terms(page).check();
  await sendButton(page).click();
}

// =====================================================================================================

test.describe("edge cases", () => {
  test("double-clicking Send sign-up makes one sign-up, not two", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await fillClinic(page, c);
    await terms(page).check();
    await sendButton(page).dblclick();
    await expect(page).toHaveURL(/\/get-started\/PRM-/, { timeout: 15_000 });

    await signInOperator(page);
    await page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Sign-ups" }).click();
    await expect(page.getByRole("button", { name: "Waiting (2)" })).toBeVisible();
    await expect(page.getByRole("link", { name: c.name, exact: true })).toHaveCount(1);
  });

  test("going back from the thank-you page and sending again is refused as a duplicate, not a second sign-up", async ({ page }) => {
    const c = clinic();
    const reference = await signUp(page, c);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Get started with Primolar" })).toBeVisible();
    await page.goForward();
    await expect(page.getByText(reference, { exact: true })).toBeVisible();
    await page.goBack();
    await expect(sendButton(page)).toBeVisible();
    await fillClinic(page, c);
    await submitAttempt(page);
    await expectFieldError(page, "Clinic name", `A clinic called ${c.name} is already on Primolar or waiting to join. Contact Primolar if it's yours.`);
  });

  test("reloading half-way through the form starts a clean form and sends nothing", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await field(page, "Clinic name").fill(c.name);
    await field(page, "Contact email").fill(c.contactEmail);
    await plan(page, "Big").click();
    await page.reload();
    await expect(sendButton(page)).toBeVisible();
    await expect(field(page, "Clinic name")).toHaveValue("");
    await expect(plan(page, "Small")).toBeChecked();
    // Nothing reached Primolar, so the same name can still be sent.
    await fillClinic(page, c);
    await submitSignup(page);
  });

  test("switching the look starts that choice afresh, and the logo already chosen stays", async ({ page }) => {
    await openGetStarted(page);
    await look(page, "Use my own").click();
    await chooseLogo(page);
    await colourBox(page).fill("#1d6b4f");
    await look(page, "Design it for me").click();
    await field(page, "Your brief").fill("Sea greens");
    await look(page, "Use the default look").click();
    await expect(page.getByText(/Your clinic starts in Primolar's colours/)).toBeVisible();
    await look(page, "Design it for me").click();
    await expect(field(page, "Your brief")).toHaveValue("");
    await look(page, "Use my own").click();
    await expect(colourBox(page)).toHaveValue("#5b3fa8"); // Primolar's colour again
    await expect(page.getByRole("img", { name: "logo.png" })).toBeVisible();
    await page.getByRole("button", { name: "Remove logo.png" }).click();
    await expect(page.getByRole("img", { name: "logo.png" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Logo/ })).toBeVisible();
  });

  test("Filipino names, accents and symbols come through exactly as typed", async ({ page }) => {
    const c = clinic({
      name: `Ñiño & Peña's <Ngipin> ${uniq()} Dental`,
      owner: "Dra. Mª Concepción “Connie” Dela Peña-Ñañez",
      address: "Blk 5 Lot 7, Brgy. Sto. Niño, Parañaque",
    });
    await signUp(page, c);
    await expect(page.getByText(`${c.name} · Small plan · Use the default look`)).toBeVisible();
    await openSignupInConsole(page, c.name);
    await expect(page.getByText(`${c.owner} · ${c.ownerEmail} · dentist`)).toBeVisible();
    await expect(page.getByText(new RegExp(escape(c.address)))).toBeVisible();
  });

  test("a very long clinic name still fits the thank-you page", async ({ page }) => {
    const c = clinic({ name: `Klinika ng Ngiping Masaya at Malusog para sa mga Batang Pilipino ${uniq()} `.repeat(4).trim() });
    await signUp(page, c);
    const heading = page.getByRole("heading", { level: 1 });
    const box = await heading.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
  });

  test("a brief of exactly 1,000 characters is accepted and one more is refused", async ({ page }) => {
    await openGetStarted(page);
    await fillClinic(page, clinic());
    await look(page, "Design it for me").click();
    await field(page, "Your brief").fill("a".repeat(1001));
    await submitAttempt(page);
    await expectFieldError(page, "Your brief", "Keep the brief under 1,000 characters");
    await field(page, "Your brief").fill("a".repeat(1000));
    await sendButton(page).click();
    await expect(page).toHaveURL(/\/get-started\/PRM-/, { timeout: 15_000 });
  });

  test("a fourth reference image is not kept: up to 3 in all", async ({ page }) => {
    await openGetStarted(page);
    await look(page, "Design it for me").click();
    await chooseFiles(page, /^Looks you like/, [png("a.png"), png("b.png"), png("c.png"), png("d.png")]);
    await expect(page.getByText("Only the first 3 were kept: up to 3 in all")).toBeVisible();
    await expect(page.getByRole("img", { name: /^[abc]\.png$/ })).toHaveCount(3);
    await expect(page.getByRole("button", { name: /^Looks you like/ })).toHaveCount(0);
  });

  test("the TIN formats itself as it is typed and keeps a branch code", async ({ page }) => {
    await openGetStarted(page);
    await field(page, "TIN").pressSequentially("123abc456789-00012");
    await expect(field(page, "TIN")).toHaveValue("123-456-789-00012");
  });

  test("a whole sign-up can be filled and sent with the keyboard only", async ({ page }) => {
    const c = clinic();
    await openGetStarted(page);
    await field(page, "Clinic name").focus();
    await page.keyboard.type(c.name);
    await page.keyboard.press("Tab");
    await page.keyboard.type(c.contactEmail);
    await page.keyboard.press("Tab");
    await page.keyboard.type(c.tin);
    await page.keyboard.press("Tab"); // the plan: one tab stop, arrows choose
    await expect(plan(page, "Small")).toBeFocused();
    await page.keyboard.press("ArrowRight"); // arrows move between plans (Radix radio group)...
    await expect(plan(page, "Mid")).toBeFocused();
    await page.keyboard.press("Space"); // ...and Space picks the focused one, whether or not the arrow already did
    await expect(plan(page, "Mid")).toBeChecked();
    await page.keyboard.press("Tab");
    await expect(field(page, "Branch name")).toBeFocused();
    await page.keyboard.type(c.branch);
    await page.keyboard.press("Tab");
    await page.keyboard.type(c.address);
    await page.keyboard.press("Tab");
    await page.keyboard.type(c.phone);
    await field(page, "Full name").focus(); // past the opening hours, which keep their defaults
    await page.keyboard.type(c.owner);
    await page.keyboard.press("Tab");
    await page.keyboard.type(c.ownerEmail);
    await terms(page).focus();
    await page.keyboard.press("Space");
    await expect(terms(page)).toBeChecked();
    await sendButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/get-started\/PRM-/, { timeout: 15_000 });
    await expect(page.getByText(`${c.name} · Mid plan · Use the default look`)).toBeVisible();
  });

  test("the Terms and the DPA open from the form without losing what was typed", async ({ page, context }) => {
    await openGetStarted(page);
    await field(page, "Clinic name").fill("Ngiti ng Bayan");
    const popup = context.waitForEvent("page");
    await page.getByRole("link", { name: "Terms of Service" }).click();
    const terms = await popup;
    await expect(terms).toHaveURL(/\/legal\/terms/);
    await expect(terms.getByText(/Template, pending legal review/i).first()).toBeVisible();
    await terms.close();
    await expect(field(page, "Clinic name")).toHaveValue("Ngiti ng Bayan");
  });

  test("an approved sign-up can't be approved or paid twice", async ({ page }) => {
    const c = clinic();
    await signUp(page, c);
    await openSignupInConsole(page, c.name);
    await recordPayment(page);
    await expect(page.getByRole("button", { name: "Record payment" })).toHaveCount(0);
    await approve(page, c);
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Open the clinic account" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Approve and create clinic" })).toHaveCount(0);
    await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
  });
});
