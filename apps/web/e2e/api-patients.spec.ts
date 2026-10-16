import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B4: patients, consents and the privacy notice against apps/api in `hybrid`. Skipped unless E2E_API=1. Start-up: a
 * fresh database seeded with B4's rows (`DEMO_LOGINS=true COOKIE_SECURE=false`), the API, and the web in `hybrid`.
 * Re-runnable against one database: every child carries a run stamp. Run it on its own (sign-ins are rate-limited).
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a hybrid web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 120_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const CHILD = `Bea${RUN}`;
/** Seven digits from this run, so the guardian's phone is this run's too. */
const DIGITS = String(Date.now() % 10_000_000).padStart(7, "0");
const PHONE = `917${DIGITS}`;
let childId = "";

/** Answered by apps/api, not MSW: Nest stamps every response with `x-request-id`; a mocked one never has it. */
const fromApi = async (response: Response) => !!(await response.allHeaders())["x-request-id"];
const loads = (page: Page, path: RegExp, method = "GET") =>
  page.waitForResponse((r) => path.test(new URL(r.url()).pathname) && r.request().method() === method);

async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  // The demo dentist works at two clinics: the record under test is Bulilit's.
  if (email === USERS.dentist) {
    await page.getByRole("region", { name: "Which clinic?" }).getByRole("button", { name: "Bulilit Smiles Pediatric Dental" }).click();
  }
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}
const openNav = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).first().getByRole("link", { name, exact: true }).click();

test("the patient list and a record come from the API", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const list = loads(page, /^\/api\/patient-summaries$/);
  await openNav(page, "Patients");
  expect(await fromApi(await list)).toBe(true);
  const record = loads(page, /^\/api\/patients\/[^/]+$/);
  const summary = loads(page, /^\/api\/patients\/[^/]+\/summary$/);
  await page.getByRole("main").getByRole("table").getByRole("row").nth(1).getByRole("link").first().click();
  const [r, s] = await Promise.all([record, summary]);
  expect([await fromApi(r), await fromApi(s)]).toEqual([true, true]);
  const phone = ((await r.json()) as { guardians: { phone?: string }[] }).guardians[0]!.phone;
  expect(phone).toBeTruthy(); // front desk holds patients.contact
});

test("registers a child with the parent's consent, then finds them by name and by phone", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  await openNav(page, "Patients");
  await page.getByRole("link", { name: "New patient" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New patient" })).toBeVisible();
  await page.getByLabel("First name").fill(CHILD);
  await page.getByLabel("Last name").fill("Mendoza");
  await page.getByLabel("Date of birth").fill("2020-07-02");
  await page.getByRole("radiogroup", { name: "Sex" }).getByRole("radio", { name: "Female", exact: true }).click();
  await page.getByRole("radiogroup", { name: "Relationship" }).getByRole("radio", { name: "Mother" }).click();
  await page.getByLabel("Full name").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("Rosa Mendoza");
  await page.getByLabel("Mobile number").fill(PHONE);
  await page.getByRole("radiogroup", { name: "Allergies" }).getByRole("radio", { name: "None known" }).click();
  await page.getByRole("radiogroup", { name: "Conditions or medications" }).getByRole("radio", { name: "None known" }).click();
  await page.locator("form").getByRole("button", { name: "Save patient", exact: true }).click();
  const consent = page.getByRole("dialog", { name: "Parent's consent" });
  await consent.getByRole("checkbox", { name: /received .* privacy notice/ }).check();
  const created = loads(page, /^\/api\/patients$/, "POST");
  await consent.getByRole("button", { name: "Save patient" }).click();
  const res = await created;
  expect([res.status(), await fromApi(res)]).toEqual([201, true]);
  childId = ((await res.json()) as { id: string }).id;
  await expect(page.getByRole("heading", { level: 1, name: `${CHILD} Mendoza` })).toBeVisible();

  for (const query of [CHILD.toLowerCase(), DIGITS]) {
    await page.getByRole("button", { name: /Find a patient/ }).click();
    const dialog = page.getByRole("dialog", { name: "Find a patient" });
    await dialog.getByLabel("Search patients").fill(query);
    await expect(dialog.getByRole("list", { name: "Matching patients" }).getByRole("link", { name: new RegExp(CHILD) })).toBeVisible();
    await page.keyboard.press("Escape");
  }
});

test("the API refuses a child without the parent's consent", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const body = {
    firstName: `No${RUN}`, lastName: "Consent", birthDate: "2020-07-02", sex: "female", address: "",
    guardians: [{ id: `g_${RUN}`, fullName: "Ana Consent", relationship: "Mother", phone: PHONE, isPrimary: true }],
    emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
    dentalHistory: { previousClinic: "", notes: "" },
  };
  const res = await page.request.post("/api/patients", { data: body });
  expect(res.status()).toBe(400);
  expect(JSON.stringify(await res.json())).toContain("privacyConsent");
  const found = await page.request.get(`/api/patients?q=no${RUN}`);
  expect(await found.json()).toEqual([]);
});

test("a dentist gets no contact fields, and front desk does", async ({ page, browser }) => {
  expect(childId).not.toBe("");
  await signInAs(page, USERS.dentist);
  const asDentist = await page.request.get(`/api/patients/${childId}`);
  const text = await asDentist.text();
  expect(asDentist.status()).toBe(200);
  expect(text).not.toContain(PHONE);
  expect(JSON.parse(text)).not.toHaveProperty("address");
  await page.goto(`/patients/${childId}`);
  await expect(page.getByRole("heading", { level: 1, name: `${CHILD} Mendoza` })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(PHONE.slice(-4))).toHaveCount(0);

  const desk = await browser.newPage();
  await signInAs(desk, USERS.frontdesk);
  expect(await (await desk.request.get(`/api/patients/${childId}`)).text()).toContain(PHONE);
  await desk.close();
});

test("the privacy notice is the API's, before sign-in too", async ({ page, browser }) => {
  await signInAs(page, USERS.owner);
  const notice = loads(page, /^\/api\/clinic\/privacy-notice$/);
  await page.goto("/settings");
  const res = await notice;
  expect(await fromApi(res)).toBe(true);
  const { version } = (await res.json()) as { version: number };
  const anonymous = await browser.newContext();
  const pub = await anonymous.request.get(new URL("/api/legal/notices/clinic_demo", page.url()).toString());
  expect([pub.status(), ((await pub.json()) as { version: number }).version]).toEqual([200, version]);
  await anonymous.close();
});
