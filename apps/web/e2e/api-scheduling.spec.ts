import { expect as baseExpect, test, type Locator, type Page, type Response } from "@playwright/test";
import { addDays, format, isSunday } from "date-fns";
import { USERS, signIn } from "./support/users";

/**
 * B7: the schedule, follow-ups, Today and the parent's confirm and request against apps/api (the web in `disabled` since B13c1). Skipped unless
 * E2E_API=1. Start-up (B7 plan Step 9.2), on a fresh database (`db:seed` refuses a seeded one; no `migrate reset`):
 *   CREATE DATABASE pedia_dental_e2e_b7; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4110 DEMO_LOGINS=true COOKIE_SECURE=false pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=disabled API_PROXY_TARGET=http://localhost:4110 pnpm exec next dev --port 3160
 * Re-runnable against one database: every run books new children on a day of its own.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const [FIRST, SECOND, THIRD] = ["Sked", "Clash", "Pull"].map((n) => `${n}${RUN}`);
const ids: Record<string, string> = {};
/** A day of this run's own, months ahead and never a Sunday, so a second run books into an empty day. */
const DAY = (() => {
  let d = addDays(new Date(), 40 + (Date.now() % 1400)); // about four years of days: two runs rarely meet
  while (isSunday(d)) d = addDays(d, 1);
  return format(d, "yyyy-MM-dd");
})();

/** Answered by apps/api: Nest stamps `x-request-id`. MSW's passthrough also reports fromServiceWorker(), so not that. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
/** Waits for the request `act` causes, then proves the API answered it with `status`. */
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);

async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  if (email === USERS.dentist) {
    await page.getByRole("region", { name: "Which clinic?" }).getByRole("button", { name: "Bulilit Smiles Pediatric Dental" }).click();
  }
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}

/** Registers a child through the API with the signed-in front desk's session. */
async function register(page: Page, firstName: string) {
  const guardian = { id: `g_${firstName}`, fullName: "Rosa Sked", relationship: "Mother", phone: `0917${String(Date.now() % 10_000_000).padStart(7, "0")}`, isPrimary: true };
  const res = await page.request.post("/api/patients", {
    data: {
      firstName, lastName: "Reyes", birthDate: "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" },
      privacyConsent: { guardianId: guardian.id, photos: true, reminders: true, confirmed: true },
    },
  });
  expect(res.status()).toBe(201);
  ids[firstName] = ((await res.json()) as { id: string }).id;
}

/** The run's day on the calendar, in the List view (rows carry the start time). */
async function calendar(page: Page) {
  await page.goto(`/appointments?date=${DAY}`);
  await page.getByRole("group", { name: "Calendar view" }).getByRole("button", { name: "List" }).click();
}
/** The appointment's row on the calendar's List view, by child and start time. */
const row = (page: Page, child: string, time: string) => page.getByRole("main").getByRole("button").filter({ hasText: child }).filter({ hasText: time });

async function startBooking(page: Page, child: string, dentist: string) {
  await page.getByRole("button", { name: "New appointment" }).click();
  const dialog = page.getByRole("dialog", { name: "New appointment" });
  await dialog.getByRole("combobox", { name: "Patient" }).fill(child);
  await page.getByRole("option", { name: new RegExp(`^Reyes, ${child}`) }).first().click(); // not "add as a new patient"
  await dialog.getByRole("radiogroup", { name: "What for" }).getByRole("radio", { name: "Oral examination" }).click();
  await dialog.getByRole("radiogroup", { name: "Dentist" }).getByRole("radio", { name: dentist }).click();
  return dialog;
}
async function typeTime(page: Page, dialog: Locator, time: string) {
  const custom = dialog.getByRole("button", { name: "Pick another date or time" });
  if (await custom.isVisible()) await custom.click();
  await dialog.getByLabel("Date", { exact: true }).fill(DAY);
  await dialog.getByLabel("Start", { exact: true }).fill(time);
  await dialog.getByRole("combobox", { name: "Chair" }).click();
  await page.getByRole("option", { name: "Chair 3", exact: true }).click();
}
const APPOINTMENTS = /^\/api\/appointments$/;
const STATUS = /^\/api\/appointments\/[^/]+\/status$/;

test("front desk reads the calendar, books, is refused a clash, moves, confirms and checks in", async ({ page }) => {
  const read = loads(page, APPOINTMENTS);
  await signInAs(page, USERS.frontdesk);
  expect(await fromApi(await read)).toBe(true); // the landing calendar
  for (const child of [FIRST, SECOND, THIRD]) await register(page, child);

  await calendar(page);
  let dialog = await startBooking(page, FIRST, "Dr. Miguel Santos");
  await typeTime(page, dialog, "17:00");
  await viaApi(page, APPOINTMENTS, "POST", 201, () => dialog.getByRole("button", { name: /^Book / }).click());
  await expect(toast(page, "Appointment booked")).toBeVisible();
  await expect(dialog).toBeHidden();

  dialog = await startBooking(page, SECOND, "Dr. Ana Reyes");
  await typeTime(page, dialog, "17:00");
  await viaApi(page, APPOINTMENTS, "POST", 409, () => dialog.getByRole("button", { name: /^Book / }).click());
  await expect(toast(page, "Chair 3 is already booked at 5:00 PM")).toBeVisible(); // the form stays open
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");

  await calendar(page); // booking shows the day in the Day view
  await row(page, FIRST, "5:00 PM").click();
  let sheet = page.getByRole("dialog", { name: new RegExp(FIRST) });
  await sheet.getByRole("button", { name: "Reschedule" }).click();
  const move = page.getByRole("dialog", { name: "Reschedule appointment" });
  await move.getByLabel("Start", { exact: true }).fill("17:30");
  await viaApi(page, /^\/api\/appointments\/[^/]+$/, "PUT", 200, () => move.getByRole("button", { name: "Move appointment" }).click());
  await expect(toast(page, "Appointment moved")).toBeVisible();

  await page.reload();
  await expect(row(page, FIRST, "5:00 PM")).toHaveCount(0);
  await row(page, FIRST, "5:30 PM").click();
  sheet = page.getByRole("dialog", { name: new RegExp(FIRST) });
  await viaApi(page, STATUS, "POST", 200, () => sheet.getByRole("button", { name: "Confirm", exact: true }).click());
  await viaApi(page, STATUS, "POST", 200, () => sheet.getByRole("button", { name: "Check in" }).click());
  await expect(sheet.getByText("Arrived").first()).toBeVisible();
});

test("a dentist seats the child from the calendar and finishes; the list then counts a recent visit", async ({ page }) => {
  expect(ids[FIRST]).toBeTruthy();
  await signInAs(page, USERS.dentist);
  await calendar(page);
  await row(page, FIRST, "5:30 PM").click();
  const sheet = page.getByRole("dialog", { name: new RegExp(FIRST) });
  await viaApi(page, /^\/api\/patients\/[^/]+\/visits$/, "POST", 201, () => sheet.getByRole("button", { name: "Start visit" }).click());
  await expect(page).toHaveURL(new RegExp(`/patients/${ids[FIRST]}`));
  await viaApi(page, /^\/api\/visits\/[^/]+\/complete$/, "POST", 200, () => page.getByRole("button", { name: "Finish visit" }).click());

  await calendar(page);
  await expect(row(page, FIRST, "5:30 PM")).toContainText("Done");
  const list = loads(page, /^\/api\/patient-summaries$/);
  await page.goto(`/patients?filter=recent_visit&q=${FIRST}`);
  expect(await fromApi(await list)).toBe(true);
  await expect(page.getByRole("main").getByRole("link", { name: new RegExp(FIRST) }).first()).toBeVisible();

  // The third child's extraction, signed: its follow-up is what the front desk books next.
  const visit = await page.request.post(`/api/patients/${ids[THIRD]}/visits`, { data: { dentistId: "staff_reyes" } });
  expect(visit.status()).toBe(201);
  const visitId = ((await visit.json()) as { id: string }).id;
  const note = await page.request.post(`/api/patients/${ids[THIRD]}/notes`, {
    data: { visitId, templateId: "tpl_extraction", values: { teeth: [75], reason: "Caries, non-restorable" }, behavior: [] },
  });
  expect(note.status()).toBe(201);
  expect((await page.request.post(`/api/notes/${((await note.json()) as { id: string }).id}/sign`)).status()).toBe(200);
  expect((await page.request.post(`/api/visits/${visitId}/complete`)).status()).toBe(200);
});

test("front desk books the extraction's follow-up from the due list, and it leaves the list", async ({ page }) => {
  expect(ids[THIRD]).toBeTruthy();
  await signInAs(page, USERS.frontdesk);
  const due = loads(page, /^\/api\/due-items$/);
  await page.goto("/recall");
  expect(await fromApi(await due)).toBe(true);
  const book = page.getByRole("button", { name: new RegExp(`^Book follow-up after extraction for .*${THIRD}`) });
  await expect(book).toBeVisible();
  await book.click();
  const dialog = page.getByRole("dialog", { name: "New appointment" });
  await viaApi(page, APPOINTMENTS, "POST", 201, () => dialog.getByRole("button", { name: /^Book / }).click());
  await expect(toast(page, "Appointment booked")).toBeVisible();
  await expect(book).toHaveCount(0);
});

test("Today agrees with the calendar and the inbox, and the Owner reads all branches", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const report = loads(page, /^\/api\/reports\/today$/);
  await page.goto("/dashboard");
  const res = await report;
  expect(await fromApi(res)).toBe(true);
  const { today, counts } = (await res.json()) as { today: string; counts: { total: number; requests: number } };
  const from = new Date(`${today}T00:00:00+08:00`); // the clinic's day: this runner's own zone may be UTC
  const todays = (await (await page.request.get(`/api/appointments?from=${from.toISOString()}&to=${addDays(from, 1).toISOString()}`)).json()) as unknown[];
  const pending = (await (await page.request.get("/api/appointment-requests?status=pending")).json()) as unknown[];
  expect([counts.total, counts.requests]).toEqual([todays.length, pending.length]);
  await expect(page.getByRole("heading", { name: `Requests from parents (${pending.length})` })).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, USERS.owner);
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "Showing" }).first().click();
  await viaApi(page, /^\/api\/reports\/today$/, "GET", 200, () => page.getByRole("option", { name: "All branches" }).click());
});

test("the family parent confirms Mika's visit and asks for another; the front desk handles it", async ({ page }) => {
  await signIn(page, USERS.parent);
  const notice = page.getByRole("button", { name: "I've read this" });
  const portal = page.getByRole("group", { name: "Whose records to show" });
  await expect(notice.or(portal).first()).toBeVisible({ timeout: 45_000 });
  if (await notice.isVisible()) await notice.click();
  await expect(portal).toBeVisible();
  await page.goto("/portal/appointments");
  await page.getByRole("group", { name: "Whose records to show" }).getByRole("button", { name: "Mika" }).click();
  await expect(page.getByRole("heading", { name: "Mika's appointments" })).toBeVisible();
  const confirm = page.getByRole("button", { name: "Confirm visit" });
  const confirmed = page.getByText("Confirmed", { exact: true }).first();
  await expect(confirm.or(confirmed).first()).toBeVisible(); // loaded
  if (await confirm.isVisible()) await viaApi(page, STATUS, "POST", 200, () => confirm.click()); // a second run finds it confirmed
  await expect(confirmed).toBeVisible();

  await page.getByRole("combobox", { name: "Time of day" }).click();
  await page.getByRole("option", { name: "Morning" }).click();
  await page.getByLabel("What is the visit for?").fill(`Check-up ${RUN}`);
  await viaApi(page, /^\/api\/patients\/[^/]+\/appointment-requests$/, "POST", 201, () => page.getByRole("button", { name: "Send request" }).click());
  await expect(page.getByText(/We have your request for .+ \(morning\)\./)).toBeVisible();

  await page.context().clearCookies();
  await signInAs(page, USERS.frontdesk);
  await page.goto("/appointments");
  const request = page.getByRole("listitem").filter({ hasText: `Check-up ${RUN}` });
  await viaApi(page, /^\/api\/appointment-requests\/[^/]+\/handled$/, "POST", 200, () => request.getByRole("button", { name: "Mark handled" }).click());
  await expect(toast(page, "Marked handled")).toBeVisible();
  await expect(request).toHaveCount(0);
});
