import { expect as baseExpect, test, type Locator, type Page } from "@playwright/test";
import { addDays, format, isSunday, parse } from "date-fns";
import { USERS, expectSignedIn, signIn } from "./support/users";

/**
 * Pilot test: the front desk (Liza Cruz, Bulilit Smiles, Imus) through the UI only, the way she would use it.
 * Every test starts on a fresh copy of the demo data (new browser context).
 */

// The pilot server is shared by several testers at once, so screens can take a while to answer.
const expect = baseExpect.configure({ timeout: 20_000 });

// ---------- helpers (UI only) ----------

async function signInFrontDesk(page: Page) {
  await signIn(page, USERS.frontdesk);
  // Front desk lands on Appointments (the shared server can be slow under many workers).
  await expect(page.getByRole("heading", { name: "Appointments", level: 1 })).toBeVisible({ timeout: 45_000 });
  await expectSignedIn(page);
}

const mainNav = (page: Page) => page.getByRole("navigation", { name: "Main" }).first();

async function openNav(page: Page, name: string) {
  await mainNav(page).getByRole("link", { name, exact: true }).click();
}

/** The next day the clinic is open (it closes on Sundays), at least `daysAhead` days from today. */
function openDay(daysAhead: number) {
  let d = addDays(new Date(), daysAhead);
  while (isSunday(d)) d = addDays(d, 1);
  return d;
}

const iso = (d: Date) => format(d, "yyyy-MM-dd");

/** Toasts appear in the Notifications region. */
const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);

/**
 * The demo data is laid out around today, so which slots are taken and which texts are queued change with the day of
 * the week. Tests book only where the seed never does, and make the state they need through the UI.
 */
const withdrawnCount = async (page: Page) =>
  Number((await page.getByRole("button", { name: /^Withdrawn/ }).textContent())?.match(/\((\d+)\)/)?.[1]);

/** From Recalls: queues a recall reminder for this child, so a "no" to reminders has a text to withdraw. */
async function queueRecallReminder(page: Page, child: string) {
  await openNav(page, "Recalls");
  await page.getByRole("button", { name: new RegExp(`^Send reminder about .* for ${child}$`) }).click();
  await expect(toast(page, /^Reminder queued for /)).toBeVisible();
}

/** Opens the patient through the "Find a patient" search, the way staff jump to a child. */
async function findPatient(page: Page, query: string, linkName: RegExp) {
  await page.getByRole("button", { name: /Find a patient/ }).click();
  const dialog = page.getByRole("dialog", { name: "Find a patient" });
  await dialog.getByLabel("Search patients").fill(query);
  await dialog.getByRole("list", { name: "Matching patients" }).getByRole("link", { name: linkName }).first().click();
  await expect(dialog).toBeHidden();
}

const dayTitle = (d: Date) => format(d, "EEE, MMM d, yyyy");

/** From today's calendar, clicks Next one day at a time until the day view shows `day`, waiting for each page. */
async function goToDay(page: Page, day: Date) {
  if ((await page.getByText(dayTitle(day), { exact: true }).count()) > 0) return;
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(page.getByText(dayTitle(new Date()), { exact: true })).toBeVisible();
  for (let d = addDays(new Date(), 1); dayTitle(d) !== dayTitle(addDays(day, 1)); d = addDays(d, 1)) {
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await expect(page.getByText(dayTitle(d), { exact: true })).toBeVisible();
  }
}

/** Opens one appointment from the calendar's List view of `day`, picked by its start time and the child's name. */
async function openAppointment(page: Page, day: Date, child: string, time: string) {
  await goToDay(page, day);
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "List" }).click();
  await page.getByRole("main").getByRole("button").filter({ hasText: child }).filter({ hasText: time }).first().click();
  return page.getByRole("dialog", { name: child });
}

/** The appointment's tile or row on the calendar (List view), by child and start time. */
const appointmentRow = (page: Page, child: string, time: string) =>
  page.getByRole("main").getByRole("button").filter({ hasText: child }).filter({ hasText: time });

async function chooseOption(page: Page, trigger: Locator, option: string) {
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

/**
 * Books through Appointments > New appointment, typing the time by hand ("Pick another date or time").
 * Returns the dialog so callers can check errors.
 */
async function startBooking(page: Page, { patientQuery, patientOption, procedure, dentist }: { patientQuery: string; patientOption: RegExp; procedure: string; dentist: string }) {
  await page.getByRole("button", { name: "New appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "New appointment" });
  await dialog.getByRole("combobox", { name: "Patient" }).fill(patientQuery);
  await page.getByRole("option", { name: patientOption }).first().click();
  await dialog.getByRole("radiogroup", { name: "What for" }).getByRole("radio", { name: procedure }).click();
  await dialog.getByRole("radiogroup", { name: "Dentist" }).getByRole("radio", { name: dentist }).click();
  return dialog;
}

async function typeTime(page: Page, dialog: Locator, { date, time, minutes, chair }: { date: string; time: string; minutes?: number; chair?: string }) {
  const custom = dialog.getByRole("button", { name: "Pick another date or time" });
  if (await custom.isVisible()) await custom.click();
  await dialog.getByLabel("Date", { exact: true }).fill(date);
  await dialog.getByLabel("Start", { exact: true }).fill(time);
  if (minutes !== undefined) await dialog.getByLabel("Minutes", { exact: true }).fill(String(minutes));
  if (chair) await chooseOption(page, dialog.getByRole("combobox", { name: "Chair" }), chair);
}

/** Fills the required parts of New patient. */
async function fillNewChild(
  page: Page,
  c: { first: string; last: string; born: string; sex: "Female" | "Male"; guardian: string; relationship?: string; phone: string },
) {
  await page.getByLabel("First name").fill(c.first);
  await page.getByLabel("Last name").fill(c.last);
  await page.getByLabel("Date of birth").fill(c.born);
  await page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: c.sex, exact: true }).click();
  await page.getByRole("radiogroup", { name: "Relationship" }).getByRole("radio", { name: c.relationship ?? "Mother" }).click();
  // As a person does: click into the name (the child's surname is pre-filled), select it all and type over it.
  await page.getByLabel("Full name").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(c.guardian);
  await page.getByLabel("Mobile number").fill(c.phone);
  await page.getByRole("radiogroup", { name: "Allergies" }).getByRole("radio", { name: "None known" }).click();
  await page.getByRole("radiogroup", { name: "Conditions or medications" }).getByRole("radio", { name: "None known" }).click();
}

const saveBar = (page: Page) => page.locator("form").getByRole("button", { name: "Save patient", exact: true });

// ---------- happy paths ----------

test.beforeEach(() => {
  // The pilot server is shared by many testers at once; give each story room.
  test.setTimeout(120_000);
});

test.describe("happy paths", () => {
  test("front desk signs in and lands on the appointments calendar for today", async ({ page }) => {
    await signInFrontDesk(page);
    await expect(page).toHaveURL(/\/appointments/);
    await expect(page.getByText(format(new Date(), "EEE, MMM d, yyyy"), { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Liza Cruz, Front desk/ })).toBeVisible();
  });

  test("front desk reads today at a glance on the dashboard", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /Good (morning|afternoon|evening), Liza/ })).toBeVisible();
    const glance = page.getByRole("navigation", { name: "Today at a glance" });
    await expect(glance.getByRole("link", { name: /appointments?/ }).first()).toBeVisible();
    await expect(glance.getByRole("link", { name: /waiting/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Today's appointments/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Requests from parents \(2\)/ })).toBeVisible();
    // Opening the Waiting tile shows the calendar filtered to that group.
    await glance.getByRole("link", { name: /waiting/ }).click();
    await expect(page.getByRole("status").filter({ hasText: "Showing only" })).toContainText("waiting");
    await page.getByRole("button", { name: "Show all" }).click();
    await expect(page.getByText("Showing only")).toBeHidden();
  });

  test("front desk sends a birthday greeting from the dashboard and it shows in the message log", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Dashboard");
    await expect(page.getByRole("heading", { name: /Today's appointments/ })).toBeVisible();
    const first = page.getByRole("button", { name: "Send greeting" }).first();
    test.skip((await first.count()) === 0, "No birthdays in today's demo data");
    const row = page.getByRole("listitem").filter({ hasText: "Turning" }).filter({ has: page.getByRole("button", { name: "Send greeting" }) }).first();
    const child = (await row.getByRole("link").first().innerText()).trim();
    await first.click();
    await expect(toast(page, `Birthday greeting queued for ${child}'s family`)).toBeVisible();
    // Once a year: the button gives way to a "Greeting queued" note, so it can't be sent twice.
    const sameRow = page.getByRole("listitem").filter({ has: page.getByRole("link", { name: child, exact: true }) }).filter({ hasText: "Turning" }).last();
    await expect(sameRow.getByText("Greeting queued")).toBeVisible();
    await expect(sameRow.getByRole("button", { name: "Send greeting" })).toHaveCount(0);
    await openNav(page, "Messages");
    await page.getByRole("button", { name: /^Queued/ }).click();
    await expect(page.getByText("Birthday greeting").first()).toBeVisible();
  });

  test("front desk books a cleaning for a returning patient from an open slot", async ({ page }) => {
    await signInFrontDesk(page);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Prophylaxis (cleaning)", dentist: "Dr. Ana Reyes" });
    await expect(dialog.getByText("Allergy: Penicillin")).toBeVisible(); // the allergy is in front of the booker
    const slots = dialog.getByRole("radiogroup", { name: "When" }).getByRole("radio");
    await expect(slots.first()).toBeVisible();
    await slots.first().click();
    const submit = dialog.getByRole("button", { name: /^Book / });
    await submit.click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await expect(dialog).toBeHidden();
    await findPatient(page, "Calista", /Langworth, Calista/);
    await expect(page.getByRole("tabpanel", { name: "Overview" }).getByText(/Prophylaxis \(cleaning\)/)).toBeVisible();
    // Still there after a reload.
    await page.reload();
    await expect(page.getByRole("tabpanel", { name: "Overview" }).getByText(/Prophylaxis \(cleaning\)/)).toBeVisible();
  });

  test("front desk books a check-up at a typed time and finds it on the calendar", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(3);
    const dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Miguel Santos" });
    // 5:30 PM: the seed never books Dr. Santos or Chair 3 then (a sibling's check-up takes 5:00 on some days).
    await typeTime(page, dialog, { date: iso(day), time: "17:30", chair: "Chair 3" });
    await expect(dialog.getByRole("button", { name: new RegExp(`Book ${format(day, "EEE, MMM d")}, 5:30 PM`) })).toBeVisible();
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await goToDay(page, day);
    await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "List" }).click();
    await expect(appointmentRow(page, "Savanna Gerlach", "5:30 PM")).toContainText("Oral examination · Chair 3");
    // A booking queues a confirmation text to the parent.
    await openNav(page, "Messages");
    await expect(page.getByText(/Savanna/).first()).toBeVisible();
  });

  test("front desk reschedules an appointment to another time from the calendar", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(4);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Fluoride application", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:00", chair: "Chair 2" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    const sheet = await openAppointment(page, day, "Calista Langworth", "5:00 PM");
    await expect(sheet.getByText(/5:00–5:15 PM/)).toBeVisible();
    await sheet.getByRole("button", { name: "Reschedule" }).click();
    const move = page.getByRole("dialog", { name: "Reschedule appointment" });
    await move.getByLabel("Start", { exact: true }).fill("17:30");
    await move.getByRole("button", { name: "Move appointment" }).click();
    await expect(toast(page, "Appointment moved")).toBeVisible();
    await page.reload();
    await expect(appointmentRow(page, "Calista Langworth", "5:30 PM")).toBeVisible();
    await expect(appointmentRow(page, "Calista Langworth", "5:00 PM")).toHaveCount(0);
    await appointmentRow(page, "Calista Langworth", "5:30 PM").click();
    await expect(page.getByRole("dialog", { name: "Calista Langworth" }).getByText(/5:30–5:45 PM/)).toBeVisible();
  });

  test("front desk cancels an appointment with a reason and it leaves the calendar", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(5);
    const dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:00", chair: "Chair 1" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    const sheet = await openAppointment(page, day, "Savanna Gerlach", "5:00 PM");
    await sheet.getByRole("button", { name: "Cancel appointment" }).click();
    const confirm = sheet.getByRole("button", { name: "Cancel appointment" });
    await expect(confirm).toBeDisabled(); // a reason is required
    await sheet.getByLabel("Why is it cancelled?").fill("Parent called: child has a fever");
    await confirm.click();
    await expect(toast(page, "Marked cancelled")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(appointmentRow(page, "Savanna Gerlach", "5:00 PM")).toHaveCount(0);
  });

  test("front desk checks a child in and the dashboard counts them as waiting", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Dashboard");
    const waitingTile = page.getByRole("navigation", { name: "Today at a glance" }).getByRole("link", { name: /waiting/ });
    const waitingBefore = Number((await waitingTile.getAttribute("aria-label").catch(() => null) ?? (await waitingTile.innerText())).match(/(\d+)/)![1]);
    await openNav(page, "Appointments");
    await expect(page.getByText(/^\d+ appts?$/).first()).toBeVisible().catch(() => undefined);
    const upcoming = page.getByRole("button", { name: /(Booked|Confirmed)/ }).first();
    test.skip((await upcoming.count()) === 0, "No booked appointment left today (late in the day)");
    await upcoming.click();
    const sheet = page.getByRole("dialog");
    await sheet.getByRole("button", { name: "Check in" }).click();
    await expect(toast(page, "Marked arrived")).toBeVisible();
    await expect(sheet.getByText("Arrived").first()).toBeVisible();
    // Front desk can't start the clinical visit: that is the dentist's.
    await expect(sheet.getByRole("button", { name: "Start visit" })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await openNav(page, "Dashboard");
    await expect(page.getByRole("navigation", { name: "Today at a glance" }).getByRole("link", { name: new RegExp(`^${waitingBefore + 1} waiting`) })).toBeVisible();
  });

  test("front desk handles a parent's booking request", async ({ page }) => {
    await signInFrontDesk(page);
    await expect(page.getByRole("heading", { name: "Requests from parents (2)" })).toBeVisible();
    await page.getByRole("button", { name: "Mark handled" }).first().click();
    await expect(toast(page, "Marked handled")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Requests from parents (1)" })).toBeVisible();
    // The other request: Book opens the form with the child already chosen.
    const request = page.getByRole("listitem").filter({ has: page.getByRole("button", { name: "Mark handled" }) }).first();
    const child = (await request.getByRole("link").first().innerText()).trim(); // "Surname, First"
    await request.getByRole("button", { name: "Book", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "New appointment" });
    await expect(dialog.getByRole("combobox", { name: "Patient" })).toHaveCount(0);
    await expect(dialog.getByText(child, { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Requests from parents (1)" })).toBeVisible();
  });

  test("front desk finds a patient by guardian phone and by name in the patient list", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    const search = page.getByRole("main").getByLabel("Search patients");
    await search.fill("0967 544");
    await expect(page.getByRole("link", { name: "Langworth, Calista" })).toBeVisible();
    await search.fill("langworth");
    await expect(page.getByRole("link", { name: "Langworth, Calista" })).toBeVisible();
    await expect(page.getByRole("main").getByRole("table").getByRole("row")).toHaveCount(2);
    await page.getByRole("link", { name: "Langworth, Calista" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Calista Langworth" })).toBeVisible();
  });

  test("front desk narrows the patient list to balances due", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("button", { name: /^Balance due/ }).click();
    await expect(page.getByRole("button", { name: /^Balance due/ })).toHaveAttribute("aria-pressed", "true");
    const rows = page.getByRole("main").getByRole("table").getByRole("row");
    await expect(rows.nth(1)).toContainText("₱");
  });

  test("front desk registers a new child with a guardian and the parent's consent", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "New patient" })).toBeVisible();
    await fillNewChild(page, { first: "Niño", last: "Dela Cruz", born: "2019-03-02", sex: "Male", guardian: "Maria Dela Cruz", phone: "9171234567" });
    await saveBar(page).click();
    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await expect(consent).toBeVisible();
    // The optional consents start unticked.
    await expect(consent.getByRole("checkbox", { name: /Clinical photos/ })).not.toBeChecked();
    await expect(consent.getByRole("checkbox", { name: /Reminder messages/ })).not.toBeChecked();
    await expect(consent.getByRole("combobox", { name: "Who consented" })).toContainText("Maria Dela Cruz (Mother)");
    await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
    await consent.getByRole("checkbox", { name: /Reminder messages/ }).check();
    await consent.getByRole("button", { name: "Save patient" }).click();
    await expect(toast(page, "Niño Dela Cruz added")).toBeVisible();
    await expect(page.getByRole("heading", { level: 1, name: "Niño Dela Cruz" })).toBeVisible();
    const overview = page.getByRole("tabpanel", { name: "Overview" });
    await expect(overview.getByText(/consented by\s+Maria Dela Cruz\s+\(Mother\)/)).toBeVisible();
    await expect(overview.getByRole("checkbox", { name: "Reminder messages allowed" })).toBeChecked();
    await expect(overview.getByRole("checkbox", { name: "Clinical photos allowed" })).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Niño Dela Cruz" })).toBeVisible();
    await openNav(page, "Patients");
    await page.getByRole("main").getByLabel("Search patients").fill("Niño");
    await expect(page.getByRole("link", { name: "Dela Cruz, Niño" })).toBeVisible();
  });

  test("front desk registers a child and goes straight to booking", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Ma. Lourdes", last: "Santos", born: "2020-07-15", sex: "Female", guardian: "Jose Santos", relationship: "Father", phone: "9181112222" });
    await page.getByRole("button", { name: /Save and book/ }).click();
    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
    await consent.getByRole("button", { name: "Save and book" }).click();
    await expect(toast(page, "Ma. Lourdes Santos added")).toBeVisible();
    const booking = page.getByRole("dialog", { name: "New appointment" });
    await expect(booking).toBeVisible();
    await expect(booking.getByText("Santos, Ma. Lourdes")).toBeVisible();
  });

  test("front desk records privacy consent for a child registered before consent was required", async ({ page }) => {
    await signInFrontDesk(page);
    await findPatient(page, "Calista", /Langworth, Calista/);
    await expect(page.getByText(/Consent not recorded/).first()).toBeVisible();
    await page.getByRole("button", { name: "Record privacy consent" }).click();
    const dialog = page.getByRole("dialog", { name: "Parent's consent" });
    await dialog.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
    await dialog.getByRole("button", { name: "Save consent" }).click();
    await expect(toast(page, "Consent recorded")).toBeVisible();
    const overview = page.getByRole("tabpanel", { name: "Overview" });
    await expect(overview.getByText(/consented by\s+Diane Langworth/)).toBeVisible();
    await expect(overview.getByText(/recorded by\s+Liza Cruz/)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Record privacy consent" })).toHaveCount(0);
    await expect(page.getByText("Consent not recorded: record it at this visit (Overview, Privacy).")).toHaveCount(0);
  });

  test("front desk prints the paper consent form", async ({ page }) => {
    await signInFrontDesk(page);
    await findPatient(page, "Calista", /Langworth, Calista/);
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Print consent form" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test("front desk sends a recall reminder and books a recall from the due list", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Recalls");
    const overdueHeading = page.getByRole("heading", { name: /^Overdue \(\d+\)/ });
    await expect(overdueHeading).toBeVisible();
    // The demo's names change from day to day: take the 4th and 5th overdue children.
    const remind = page.getByRole("button", { name: /^Send reminder about / }).nth(3);
    const remindLabel = (await remind.getAttribute("aria-label"))!;
    await remind.click();
    await expect(toast(page, /Reminder queued for/)).toBeVisible();
    const before = Number((await overdueHeading.innerText()).match(/\((\d+)\)/)![1]);
    const book = page.getByRole("button", { name: /^Book .* for / }).nth(4);
    const bookLabel = (await book.getAttribute("aria-label"))!; // "Book 6-month recall for Surname, First"
    const child = bookLabel.split(" for ").pop()!;
    await book.click();
    // The form opens filled in for the child.
    const dialog = page.getByRole("dialog", { name: "New appointment" });
    await expect(dialog.getByText(child, { exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await expect(page.getByRole("button", { name: bookLabel, exact: true })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: `Overdue (${before - 1})` })).toBeVisible();
    void remindLabel;
  });

  test("front desk edits a message template and the change is kept", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Messages");
    await page.getByRole("tab", { name: "Templates" }).click();
    const body = page.getByLabel("Message", { exact: true });
    await body.fill("Hi {guardian_name}! {child_first_name}'s visit at {clinic_name} is on {date} at {time}. Salamat po!");
    await expect(page.getByText(/Hi Rosa Mendoza! Bea's visit at Bulilit Smiles Pediatric Dental/)).toBeVisible();
    await page.getByRole("button", { name: "Save template" }).click();
    await expect(toast(page, /saved$/)).toBeVisible();
    await page.reload();
    await page.getByRole("tab", { name: "Templates" }).click();
    await expect(page.getByLabel("Message", { exact: true })).toHaveValue(/Salamat po!/);
  });

  test("front desk filters the message log to failed texts", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Messages");
    await page.getByRole("button", { name: /^Failed/ }).click();
    await expect(page.getByRole("button", { name: /^Failed/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("tabpanel", { name: "Message log" }).getByText("Failed").first()).toBeVisible();
  });

  test("a family's no to reminders stops the front desk's recall reminder", async ({ page }) => {
    await signInFrontDesk(page);
    await queueRecallReminder(page, "Medhurst, Coby");
    await openNav(page, "Messages");
    const withdrawnBefore = await withdrawnCount(page);
    await findPatient(page, "Coby", /Medhurst, Coby/);
    const reminders = page.getByRole("tabpanel", { name: "Overview" }).getByRole("checkbox", { name: "Reminder messages allowed" });
    await expect(reminders).toBeChecked();
    await reminders.click(); // saved at once
    await expect(reminders).not.toBeChecked();
    await expect(toast(page, "Consent updated")).toBeVisible();
    await expect(page.getByText(/photos (yes|no), reminders no/).first()).toBeAttached().catch(() => undefined);
    await openNav(page, "Recalls");
    await page.getByRole("button", { name: /^Send reminder about .* for Medhurst, Coby$/ }).click();
    await expect(toast(page, "This family declined reminder messages. Change it under Privacy on the child's Overview.")).toBeVisible();
    // After a reload the log shows the queued text withdrawn.
    await openNav(page, "Messages");
    await expect(page).toHaveURL(/\/messages/); // reload Messages, not the page the click was leaving
    await page.reload();
    await expect(page.getByRole("button", { name: /^Withdrawn/ })).toHaveText(`Withdrawn (${withdrawnBefore + 1})`);
  });

  test("BUG: the message log is stale after a family says no to reminders (withdrawn text still shows as queued)", async ({ page }) => {
    await signInFrontDesk(page);
    await queueRecallReminder(page, "Medhurst, Coby");
    await openNav(page, "Messages");
    const withdrawnBefore = await withdrawnCount(page);
    await findPatient(page, "Coby", /Medhurst, Coby/);
    const reminders = page.getByRole("tabpanel", { name: "Overview" }).getByRole("checkbox", { name: "Reminder messages allowed" });
    await reminders.click();
    await expect(reminders).not.toBeChecked();
    await expect(toast(page, "Consent updated")).toBeVisible();
    // Back to Messages through the menu, no reload: Coby's queued reminder must now read as withdrawn.
    await openNav(page, "Messages");
    await expect(page.getByRole("button", { name: /^Withdrawn/ })).toHaveText(`Withdrawn (${withdrawnBefore + 1})`);
  });

  test("front desk takes the Billing day view but sees no finance dashboard", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Billing");
    await expect(page.getByRole("heading", { level: 1, name: "Billing" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^Collected / })).toBeVisible();
    await openNav(page, "Dashboard");
    await expect(page.getByRole("heading", { name: /Today's appointments/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Finance" })).toHaveCount(0);
    await expect(page.getByText("Outstanding balances")).toHaveCount(0);
  });
});

// ---------- failed paths ----------

test.describe("failed paths", () => {
  test("front desk mistypes the password and is told so", async ({ page }) => {
    await signIn(page, USERS.frontdesk, "wrong-pass");
    await expect(page.getByRole("alert").filter({ hasText: "That email and password don't match a demo account" })).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
    // The email stays filled in so she only retypes the password.
    await expect(page.getByRole("region", { name: "Sign in" }).getByLabel("Email")).toHaveValue(USERS.frontdesk);
  });

  test("front desk submits the sign-in form empty and with a bad email", async ({ page }) => {
    await page.goto("/login");
    const form = page.getByRole("region", { name: "Sign in" });
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(form.getByText("Enter your password")).toBeVisible();
    await form.getByLabel("Email").fill("frontdesk@");
    await form.getByLabel("Password", { exact: true }).fill("pass123");
    await form.getByRole("button", { name: "Sign in" }).click();
    await expect(form.getByText("Enter your email address, like name@example.com")).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("front desk can't book outside clinic hours or on a Sunday", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(3);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:45", chair: "Chair 1" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(dialog.getByText("Book between 8:00 AM and 6:00 PM.")).toBeVisible();
    let sunday = addDays(new Date(), 1);
    while (!isSunday(sunday)) sunday = addDays(sunday, 1);
    await dialog.getByLabel("Date", { exact: true }).fill(iso(sunday));
    await dialog.getByLabel("Start", { exact: true }).fill("10:00");
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(dialog.getByText("The clinic is closed on Sundays. Pick another day.")).toBeVisible();
    await expect(toast(page, "Appointment booked")).toHaveCount(0);
  });

  test("front desk can't double-book a chair or a dentist", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(6);
    let dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:00", chair: "Chair 1" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await expect(dialog).toBeHidden();
    // Same chair, another dentist.
    dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Miguel Santos" });
    await typeTime(page, dialog, { date: iso(day), time: "17:15", chair: "Chair 1" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Chair 1 is already booked at 5:00 PM")).toBeVisible();
    await expect(dialog).toBeVisible(); // the form stays open to fix it
    // Same dentist, another chair.
    await page.getByRole("dialog", { name: "New appointment" }).getByRole("button", { name: "Close" }).click();
    dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:00", chair: "Chair 2" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Dr. Ana Reyes is already booked at 5:00 PM")).toBeVisible();
  });

  test("front desk tries to book without choosing a patient, reason or dentist", async ({ page }) => {
    await signInFrontDesk(page);
    await page.getByRole("button", { name: "New appointment" }).click();
    const dialog = page.getByRole("dialog", { name: "New appointment" });
    await dialog.getByRole("button", { name: /^Book/ }).click();
    await expect(dialog.getByText("Pick a patient")).toBeVisible();
    await expect(dialog.getByText("Give a reason")).toBeVisible();
    await expect(dialog.getByText("Pick a dentist", { exact: true })).toBeVisible();
    await expect(toast(page, "Appointment booked")).toHaveCount(0);
  });

  test("front desk tries to save a new patient with nothing filled in", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await saveBar(page).click();
    for (const message of [
      "Enter the child's first name",
      "Enter the child's last name",
      "Enter the date of birth",
      "Enter the guardian's full name",
      "Say how they're related, e.g. Mother",
      "Say whether the child has any allergies",
      "Say whether the child has any conditions or takes medicines",
    ]) {
      await expect(page.getByText(message, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Enter the guardian's phone number/)).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toHaveCount(0);
  });

  test("front desk can't register a child without ticking the parent's consent", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Andrea", last: "Bautista", born: "2018-11-20", sex: "Female", guardian: "Liza Bautista", phone: "9223334444" });
    await saveBar(page).click();
    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await consent.getByRole("button", { name: "Save patient" }).click();
    await expect(consent.getByText("Tick to confirm the guardian received the privacy notice and consented")).toBeVisible();
    // Back keeps everything typed; nothing was saved.
    await consent.getByRole("button", { name: "Back" }).click();
    await expect(consent).toBeHidden();
    await expect(page.getByLabel("First name")).toHaveValue("Andrea");
    await openNav(page, "Patients");
    await page.getByRole("main").getByLabel("Search patients").fill("Bautista");
    await expect(page.getByText(/No patients match/)).toBeVisible();
  });

  test("front desk enters a malformed guardian email and an unknown placeholder in a template", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Paolo", last: "Reyes", born: "2017-01-09", sex: "Male", guardian: "Ana Reyes", phone: "9170000001" });
    await page.getByRole("button", { name: /Contact and address/ }).click();
    await page.getByLabel("Guardian's email").fill("ana.reyes@");
    await saveBar(page).click();
    await expect(page.getByText("Enter a valid email address, like name@example.com")).toBeVisible();
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toHaveCount(0);

    await openNav(page, "Messages");
    await page.getByRole("tab", { name: "Templates" }).click();
    const body = page.getByLabel("Message", { exact: true });
    await body.fill("Hello {parent_name}");
    await expect(page.getByText("{parent_name} isn't a placeholder. Pick one from the list.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
    await body.fill("   ");
    await expect(page.getByText("Write the message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
  });

  test("front desk changes her mind: cancelling no-show and cancel steps keeps the appointment", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(4);
    const dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:30", chair: "Chair 3" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    const sheet = await openAppointment(page, day, "Savanna Gerlach", "5:30 PM");
    await sheet.getByRole("button", { name: "No-show" }).click();
    await expect(sheet.getByText("Mark as a no-show?")).toBeVisible();
    await sheet.getByRole("button", { name: "Keep it" }).click();
    await sheet.getByRole("button", { name: "Cancel appointment" }).click();
    await sheet.getByLabel("Why is it cancelled?").fill("oops");
    await sheet.getByRole("button", { name: "Keep it" }).click();
    await expect(sheet.getByText("Booked").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(appointmentRow(page, "Savanna Gerlach", "5:30 PM")).toContainText("Booked");
  });

  test("front desk discards a half-typed registration after confirming", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await page.getByLabel("First name").fill("Jun-Jun");
    await page.getByRole("button", { name: "Cancel" }).click();
    const confirm = page.getByRole("dialog", { name: "Discard this new patient?" });
    await confirm.getByRole("button", { name: "Keep editing" }).click();
    await expect(page.getByLabel("First name")).toHaveValue("Jun-Jun");
    await page.getByRole("button", { name: "Cancel" }).click();
    await confirm.getByRole("button", { name: "Discard" }).click();
    await expect(page).toHaveURL(/\/patients$/);
    await page.getByRole("link", { name: "New patient" }).click();
    await expect(page.getByLabel("First name")).toHaveValue("");
    await expect(page.getByText(/We kept what you typed earlier/)).toHaveCount(0);
  });

  test("front desk can't see the Owner's staff, plan or privacy-notice settings", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Settings");
    await expect(page.getByText("The clinic's procedures, staff and chairs. Read-only in this prototype.")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Staff" })).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Add staff/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Save new version/ })).toHaveCount(0);
    await expect(page.getByText(/of \d+ staff logins/)).toHaveCount(0);
  });

  test("front desk reads a child's chart but can't write in it", async ({ page }) => {
    await signInFrontDesk(page);
    await findPatient(page, "Calista", /Langworth, Calista/);
    await page.getByRole("tab", { name: "Notes" }).click();
    await expect(page.getByRole("button", { name: /New note|Write a note|Sign/ })).toHaveCount(0);
    await page.getByRole("tab", { name: "Chart" }).click();
    await expect(page.getByRole("tabpanel", { name: "Chart" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save chart|Record finding/ })).toHaveCount(0);
  });

  test("a parent's portal is off limits when front desk pastes its URL", async ({ page }) => {
    await signInFrontDesk(page);
    await page.goto("/portal");
    await expect(page.getByText("You don't have access to this page")).toBeVisible();
    await expect(page.getByText(/signed in as Liza Cruz \(Front desk\)/)).toBeVisible();
    await page.getByRole("link", { name: "Go to your home page" }).click();
    await expect(page).toHaveURL(/\/appointments/);
  });

  test("signed-out visitors who paste a staff URL are sent to sign in", async ({ page }) => {
    await page.goto("/patients");
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("region", { name: "Sign in" })).toBeVisible();
  });

  test("front desk signs out and the back button doesn't bring the clinic back", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toBeVisible();
    await page.getByRole("button", { name: /Liza Cruz, Front desk/ }).click();
    await page.getByRole("menuitem", { name: /Sign out/ }).click();
    await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: "Patients" })).toHaveCount(0);
    await expect(page).toHaveURL(/\/login/);
  });
});

// ---------- edge cases ----------

test.describe("edge cases", () => {
  test("front desk searches for a patient who doesn't exist", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("main").getByLabel("Search patients").fill("Zzyzx Nobody");
    await expect(page.getByText("No patients match “Zzyzx Nobody”")).toBeVisible();
    await page.getByRole("button", { name: /Find a patient/ }).click();
    const dialog = page.getByRole("dialog", { name: "Find a patient" });
    await dialog.getByLabel("Search patients").fill("Zzyzx");
    await expect(dialog.getByText(/No patient matches “Zzyzx”/)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("front desk is warned when registering a child who may already be registered", async ({ page }) => {
    await signInFrontDesk(page);
    // The seed's birth dates are ages counted back from today, so read Calista's from her record.
    await findPatient(page, "Calista", /Langworth, Calista/);
    const bornText = (await page.getByText(/^Born \w{3} \d{1,2}, \d{4}$/).first().textContent())!.replace(/^Born /, "");
    const born = format(parse(bornText, "MMM d, yyyy", new Date()), "yyyy-MM-dd");
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Calista", last: "Langworth", born, sex: "Female", guardian: "Diane Langworth", phone: "9675443989" });
    await saveBar(page).click();
    const warning = page.getByRole("dialog", { name: /This child may already be registered/ });
    await expect(warning).toBeVisible();
    await expect(warning.getByRole("link", { name: "Calista Langworth" })).toBeVisible();
    await warning.getByRole("button", { name: "Go back and check" }).click();
    await expect(warning).toBeHidden();
    // Twins are real: front desk may still go ahead.
    await saveBar(page).click();
    await page.getByRole("dialog", { name: /This child may already be registered/ }).getByRole("button", { name: "Create anyway" }).click();
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toBeVisible();
  });

  test("front desk registers a child with an apostrophe, ñ and a long Filipino name", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, {
      first: "Maria Concepcion Josefina Ñ",
      last: "O'Brien-Dela Peña y Villanueva",
      born: "2021-12-30",
      sex: "Female",
      guardian: "Rosario O'Brien-Dela Peña",
      relationship: "Grandparent",
      phone: "0917 765 4321",
    });
    await saveBar(page).click();
    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
    await consent.getByRole("button", { name: "Save patient" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Maria Concepcion Josefina Ñ O'Brien-Dela Peña y Villanueva" })).toBeVisible();
    await expect(page.getByText(/Grandparent: Rosario O'Brien-Dela Peña/)).toBeVisible();
    await expect(page.getByRole("link", { name: "0917 765 4321" }).first()).toBeVisible();
    await page.getByRole("button", { name: /Find a patient/ }).click();
    await page.getByRole("dialog", { name: "Find a patient" }).getByLabel("Search patients").fill("peña");
    await expect(page.getByRole("list", { name: "Matching patients" }).getByRole("link", { name: /O'Brien-Dela Peña/ })).toBeVisible();
  });

  test("front desk types a nickname longer than 30 characters", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Bea", last: "Lim", born: "2019-05-05", sex: "Female", guardian: "Grace Lim", phone: "9170001111" });
    await page.getByLabel("Nickname").fill("B".repeat(31));
    await saveBar(page).click();
    await expect(page.getByText("Keep the nickname under 30 characters")).toBeVisible();
    await page.getByLabel("Nickname").fill("B".repeat(30));
    await saveBar(page).click();
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toBeVisible();
  });

  test("BUG: front desk can save a child whose birth date is in the future", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Future", last: "Baby", born: iso(addDays(new Date(), 60)), sex: "Male", guardian: "Carla Baby", phone: "9170002222" });
    await saveBar(page).click();
    // A birth date in the future must be refused before the consent step.
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toHaveCount(0);
    await page.waitForTimeout(1000);
    await expect(page.getByRole("dialog", { name: "Parent's consent" })).toHaveCount(0);
  });

  test("front desk reloads in the middle of a registration and her typing is kept", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await page.getByLabel("First name").fill("Josefa");
    await page.getByLabel("Last name").fill("Mañalac");
    await page.reload();
    await expect(page.getByText(/We kept what you typed earlier/)).toBeVisible();
    await expect(page.getByLabel("First name")).toHaveValue("Josefa");
    await expect(page.getByLabel("Last name")).toHaveValue("Mañalac");
    await page.getByRole("button", { name: "Start over" }).click();
    await expect(page.getByLabel("First name")).toHaveValue("");
  });

  test("BUG: front desk double-clicks Save on the consent step and only one child is created", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await fillNewChild(page, { first: "Dobleng", last: "Klik", born: "2018-02-02", sex: "Male", guardian: "Tess Klik", phone: "9175556666" });
    await saveBar(page).click();
    const consent = page.getByRole("dialog", { name: "Parent's consent" });
    await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
    await consent.getByRole("button", { name: "Save patient" }).dblclick();
    await expect(page.getByRole("heading", { level: 1, name: "Dobleng Klik" })).toBeVisible();
    await openNav(page, "Patients");
    await page.getByRole("main").getByLabel("Search patients").fill("Klik");
    await expect(page.getByRole("link", { name: "Klik, Dobleng" })).toHaveCount(1);
  });

  test("front desk double-clicks Book and only one appointment is made", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(5);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Oral examination", dentist: "Dr. Miguel Santos" });
    await typeTime(page, dialog, { date: iso(day), time: "17:15", chair: "Chair 2" });
    await dialog.getByRole("button", { name: /^Book / }).dblclick();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await goToDay(page, day);
    await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "List" }).click();
    await expect(appointmentRow(page, "Calista Langworth", "5:15 PM")).toHaveCount(1);
    await expect(toast(page, /already booked/)).toHaveCount(0);
  });

  test("front desk closes the booking form with Escape and nothing is booked", async ({ page }) => {
    await signInFrontDesk(page);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(toast(page, "Appointment booked")).toHaveCount(0);
    // Opening it again starts fresh.
    await page.getByRole("button", { name: "New appointment" }).click();
    await expect(page.getByRole("dialog", { name: "New appointment" }).getByRole("combobox", { name: "Patient" })).toHaveValue("");
  });

  test("front desk books an appointment with the keyboard only", async ({ page }) => {
    await signInFrontDesk(page);
    await page.getByRole("button", { name: "New appointment" }).focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "New appointment" });
    const patient = dialog.getByRole("combobox", { name: "Patient" });
    await patient.focus();
    await page.keyboard.type("Langworth");
    await expect(page.getByRole("option", { name: /Langworth, Calista/ })).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(dialog.getByText(/Calista Langworth/)).toBeVisible();
    // Procedure chips and dentist chips are radio groups: Tab in, Space picks.
    await dialog.getByRole("radiogroup", { name: "What for" }).getByRole("radio").first().focus();
    await page.keyboard.press("Space");
    await expect(dialog.getByRole("radiogroup", { name: "What for" }).getByRole("radio").first()).toBeChecked();
    await dialog.getByRole("radiogroup", { name: "Dentist" }).getByRole("radio").first().focus();
    await page.keyboard.press("Space");
    const slot = dialog.getByRole("radiogroup", { name: "When" }).getByRole("radio").first();
    await expect(slot).toBeVisible();
    await slot.focus();
    await page.keyboard.press("Space");
    await dialog.getByRole("button", { name: /^Book / }).focus();
    await page.keyboard.press("Enter");
    await expect(toast(page, "Appointment booked")).toBeVisible();
  });

  test("front desk fills the new patient form with the keyboard only", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Patients");
    await page.getByRole("link", { name: "New patient" }).click();
    await page.getByLabel("First name").focus();
    await page.keyboard.type("Lito");
    await page.keyboard.press("Tab");
    await page.keyboard.type("Ramos");
    await expect(page.getByLabel("Last name")).toHaveValue("Ramos");
    await page.getByLabel("Date of birth").focus();
    await page.keyboard.type("03152019");
    await expect(page.getByLabel("Date of birth")).toHaveValue("2019-03-15");
    await page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: "Male", exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: "Male", exact: true })).toBeChecked();
  });

  test("message template refuses more than 480 characters", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Messages");
    await page.getByRole("tab", { name: "Templates" }).click();
    const body = page.getByLabel("Message", { exact: true });
    await body.fill("a".repeat(480));
    await expect(page.getByText(/480 characters · 3 text messages/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Save template" })).toBeEnabled();
    await body.fill("a".repeat(481));
    await expect(page.getByText("Keep it to 480 characters (3 text messages)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
    await page.getByRole("button", { name: "Undo changes" }).click();
    await expect(page.getByRole("button", { name: "Save template" })).toBeDisabled();
  });

  test("a recall reminder can't be queued twice for the same recall", async ({ page }) => {
    await signInFrontDesk(page);
    await openNav(page, "Recalls");
    const label = (await page.getByRole("button", { name: /^Send reminder about / }).nth(5).getAttribute("aria-label"))!;
    const send = page.getByRole("button", { name: label, exact: true });
    await send.click();
    await expect(toast(page, /Reminder queued for/)).toBeVisible();
    await send.click();
    await expect(toast(page, "A reminder is already queued for this")).toBeVisible();
  });

  test("front desk cancels with a very long reason containing special characters", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(6);
    const dialog = await startBooking(page, { patientQuery: "Gerlach", patientOption: /Gerlach, Savanna/, procedure: "Oral examination", dentist: "Dr. Miguel Santos" });
    await typeTime(page, dialog, { date: iso(day), time: "17:30", chair: "Chair 2" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    const sheet = await openAppointment(page, day, "Savanna Gerlach", "5:30 PM");
    await sheet.getByRole("button", { name: "Cancel appointment" }).click();
    const reason = `Lola's birthday sa Dasmariñas — <b>"ulit"</b> & 100% sure ${"x".repeat(400)}`;
    await sheet.getByLabel("Why is it cancelled?").fill(reason);
    await sheet.getByRole("button", { name: "Cancel appointment" }).click();
    await expect(toast(page, "Marked cancelled")).toBeVisible();
    // Shown as typed (no HTML), in the sheet's Cancel reason row.
    await expect(sheet.getByText(/Lola's birthday sa Dasmariñas — <b>"ulit"<\/b> & 100% sure/).first()).toBeVisible();
    await expect(sheet.locator("b")).toHaveCount(0);
  });

  test("front desk drags an appointment to a new time on the day calendar", async ({ page }) => {
    await signInFrontDesk(page);
    const day = openDay(3);
    const dialog = await startBooking(page, { patientQuery: "Langworth", patientOption: /Langworth, Calista/, procedure: "Oral examination", dentist: "Dr. Ana Reyes" });
    await typeTime(page, dialog, { date: iso(day), time: "17:00", chair: "Chair 1" });
    await dialog.getByRole("button", { name: /^Book / }).click();
    await expect(toast(page, "Appointment booked")).toBeVisible();
    await goToDay(page, day);
    // The one at 5:00 PM is the lowest Calista tile in the day.
    const tiles = page.getByRole("button", { name: /Calista Langworth/ });
    await tiles.first().waitFor();
    let event = tiles.first();
    let lowest = -1;
    for (const t of await tiles.all()) {
      await t.scrollIntoViewIfNeeded();
      const y = (await t.boundingBox())?.y ?? -1;
      if (y > lowest) [lowest, event] = [y, t];
    }
    await event.scrollIntoViewIfNeeded();
    const box = (await event.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    // Down half an hour, to 5:30 PM: the seed never books Chair 1 or Dr. Reyes after 5:00 PM (4:00 is taken on some days).
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 20, { steps: 8 });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    await expect(toast(page, "Appointment moved")).toBeVisible();
    await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "List" }).click();
    await expect(appointmentRow(page, "Calista Langworth", "5:00 PM")).toHaveCount(0);
    await expect(page.getByRole("main").getByRole("button").filter({ hasText: "Calista Langworth" }).filter({ hasText: "Oral examination · Chair 1" })).toHaveCount(1);
  });
});
