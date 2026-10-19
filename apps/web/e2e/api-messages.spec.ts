import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B9: parent messages against apps/api (the web in `disabled` since B13c1). Skipped unless E2E_API=1. Start-up (B9 plan Step 9.3), on a fresh
 * database (`db:seed` refuses a seeded one):
 *   CREATE DATABASE pedia_dental_e2e_b9; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4130 DEMO_LOGINS=true COOKIE_SECURE=false BACKGROUND_WORK=true OUTBOX_POLL_MS=500 pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=disabled API_PROXY_TARGET=http://localhost:4130 pnpm exec next dev --port 3180
 * No SEMAPHORE_API_KEY: the log driver sends. Texts outside 8 AM–8 PM Manila stay "Queued", so checks accept either.
 * Re-runnable against one database: every run registers its own children. 7 sign-ins a run.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const [TXT, QUIET, LAND, BDAY] = ["Txt", "Quiet", "Land", "Bday"].map((n) => `${n}${RUN}`);
const ids: Record<string, string> = {};
const appts: Record<string, string> = {};

/** Answered by apps/api: Nest stamps `x-request-id`. MSW's passthrough also reports fromServiceWorker(), so not that. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);
async function viaApi(page: Page, path: RegExp, method: string, status: number, act: () => Promise<unknown>) {
  const [res] = await Promise.all([loads(page, path, method), act()]);
  expect([res.status(), await fromApi(res)]).toEqual([status, true]);
  return res;
}
/** Sending hours in Manila (decision 4): outside them the worker holds texts, so "Sent" can't be expected. */
const sendingHours = () => {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Manila" }).format(new Date()));
  return h >= 8 && h < 20;
};

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}

const json = async (res: Awaited<ReturnType<Page["request"]["post"]>>, status: number) => {
  expect(res.status(), await res.text()).toBe(status);
  return res.json() as Promise<{ id: string }>;
};
/** A child registered through the API by whoever is signed in. */
async function register(page: Page, firstName: string, opts: { phone?: string; reminders?: boolean; birthDate?: string } = {}) {
  const guardian = { id: `g_${firstName}`, fullName: `Rosa ${firstName}`, relationship: "Mother", phone: opts.phone ?? "09171234567", isPrimary: true };
  const child = await json(await page.request.post("/api/patients", {
    data: {
      firstName, lastName: "Texto", birthDate: opts.birthDate ?? "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" },
      privacyConsent: { guardianId: guardian.id, photos: true, reminders: opts.reminders ?? true, confirmed: true },
    },
  }), 201);
  ids[firstName] = child.id;
  return child.id;
}
/** Weekday mornings about a year out, a different one per run and per booking, so re-runs never clash. */
let booked = 0;
function slot() {
  const day = new Date(Date.now() + (300 + (Number.parseInt(RUN, 36) % 97) * 2 + booked) * 86_400_000);
  while (day.getUTCDay() === 0 || day.getUTCDay() === 6) day.setUTCDate(day.getUTCDate() + 1);
  const at = `${day.toISOString().slice(0, 10)}T${String(9 + (booked++ % 8)).padStart(2, "0")}:00:00+08:00`;
  return new Date(at).toISOString();
}
async function book(page: Page, patientId: string) {
  const data = { patientId, dentistId: "staff_reyes", chairId: "chair_3", startsAt: slot(), durationMin: 30, reason: "Check-up" };
  return (await json(await page.request.post("/api/appointments", { data }), 201)).id;
}

/** The log, from the API; a row for one child and kind, paging through "Show more" until it's there. */
async function openLog(page: Page) {
  await viaApi(page, /^\/api\/messages$/, "GET", 200, () => page.goto("/messages"));
}
async function row(page: Page, child: string, kind: string) {
  const found = page.getByRole("listitem").filter({ hasText: kind }).filter({ hasText: child });
  const more = page.getByRole("button", { name: /^Show \d+ more$/ });
  for (let i = 0; i < 40 && !(await found.first().isVisible()); i++) {
    if (!(await more.isVisible())) break;
    await more.click();
  }
  await expect(found.first()).toBeVisible();
  return found;
}

test("a booking queues a confirmation and a reminder, and the worker sends the confirmation", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  await register(page, TXT);
  appts[TXT] = await book(page, ids[TXT]!);
  await openLog(page);
  await expect((await row(page, TXT, "Appointment confirmation")).first()).toContainText(/Queued|Sent/);
  await expect((await row(page, TXT, "Appointment reminder")).first()).toContainText("Queued");
  if (!sendingHours()) return; // outside 8 AM–8 PM the worker holds it until morning (decision 4)
  await expect(async () => {
    await page.reload();
    await expect((await row(page, TXT, "Appointment confirmation")).first()).toContainText("Sent", { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
});

test("cancelling withdraws the reminder", async ({ page }) => {
  expect(appts[TXT]).toBeTruthy();
  await signInAs(page, USERS.frontdesk);
  await json(await page.request.post(`/api/appointments/${appts[TXT]}/status`, { data: { status: "cancelled", cancelReason: "Family travel" } }), 200);
  await openLog(page);
  await expect((await row(page, TXT, "Appointment reminder")).first()).toContainText("Withdrawn");
});

test("a family that said no to reminders gets nothing, and a later no withdraws what waits", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  await register(page, QUIET, { reminders: false });
  await book(page, ids[QUIET]!);
  const quiet = await page.request.get(`/api/messages?patientId=${ids[QUIET]}`);
  expect([quiet.status(), !!quiet.headers()["x-request-id"], await quiet.json()]).toEqual([200, true, []]);

  await book(page, ids[TXT]!);
  await json(await page.request.post(`/api/patients/${ids[TXT]}/privacy-choices`, { data: { reminders: false } }), 200);
  await openLog(page);
  await page.getByRole("button", { name: /^Queued/ }).click(); // nothing of TXT's still waits
  await expect(page.getByRole("listitem").filter({ hasText: TXT })).toHaveCount(0);
  await expect(page.getByRole("listitem").filter({ hasText: QUIET })).toHaveCount(0);
});

test("a guardian with no mobile number gets a failed text that says why", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  await register(page, LAND, { phone: "0281234567" });
  await book(page, ids[LAND]!);
  await openLog(page);
  const confirmation = (await row(page, LAND, "Appointment confirmation")).first();
  await expect(confirmation).toContainText("Failed");
  await expect(confirmation).toContainText("No phone number");
});

test("Today's Send greeting queues a birthday text once", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const manilaToday = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(new Date());
  await register(page, BDAY, { birthDate: `${Number(manilaToday.slice(0, 4)) - 5}${manilaToday.slice(4)}` });
  await viaApi(page, /^\/api\/reports\/today$/, "GET", 200, () => page.goto("/dashboard"));
  const birthday = page.getByRole("listitem").filter({ hasText: BDAY });
  await viaApi(page, /^\/api\/patients\/[^/]+\/birthday-greeting$/, "POST", 201, () => birthday.getByRole("button", { name: "Send greeting" }).click());
  await expect(birthday.getByText(/Greeting (queued|sent)/)).toBeVisible();
  await expect(birthday.getByRole("button", { name: "Send greeting" })).toHaveCount(0);
  const again = await page.request.post(`/api/patients/${ids[BDAY]}/birthday-greeting`);
  expect([again.status(), await again.text()]).toEqual([409, `${BDAY} already has a birthday greeting this year`]);
});

test("the admin sends a recall text from the due list", async ({ page }) => {
  await signInAs(page, USERS.admin);
  await viaApi(page, /^\/api\/due-items$/, "GET", 200, () => page.goto("/recall"));
  const send = page.getByRole("button", { name: /^Send reminder about / });
  const count = await send.count();
  expect(count).toBeGreaterThan(0);
  // A seeded item may already have a reminder waiting from an earlier run (409): try them in turn until one is new.
  for (let i = 0; i < count; i++) {
    const [res] = await Promise.all([loads(page, /^\/api\/due-items\/[^/]+\/message$/, "POST"), send.nth(i).click()]);
    expect(await fromApi(res)).toBe(true);
    if (res.status() === 201) {
      const { patientId, kind } = (await res.json()) as { patientId: string; kind: string };
      const log = await page.request.get(`/api/messages?patientId=${patientId}`);
      expect((await log.json() as { kind: string; status: string }[]).some((m) => m.kind === kind && m.status === "queued")).toBe(true);
      return;
    }
    expect(res.status()).toBe(409);
  }
  throw new Error("Every seeded due item already has a reminder waiting");
});

test("the parent's care messages load from the API", async ({ page }) => {
  await signIn(page, USERS.parent);
  const notice = page.getByRole("button", { name: "I've read this" });
  const portal = page.getByRole("group", { name: "Whose records to show" });
  await expect(notice.or(portal).first()).toBeVisible({ timeout: 45_000 });
  if (await notice.isVisible()) await notice.click();
  await viaApi(page, /^\/api\/messages$/, "GET", 200, () => page.goto("/portal/care"));
});
