import { expect as baseExpect, test, type Locator, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B6: notes, growth and the treatment plan against apps/api in `hybrid`. Skipped unless E2E_API=1. Start-up: a fresh database
 * seeded with B6's rows (`DEMO_LOGINS=true COOKIE_SECURE=false`), the API, and the web in `hybrid` (B6 plan Step 7.2).
 * Re-runnable against one database: every run records on its own new child.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a hybrid web server: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const CHILD = `Nota${RUN}`;
let childId = "";

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

async function signInAs(page: Page, email: string) {
  await signIn(page, email);
  if (email === USERS.dentist) {
    await page.getByRole("region", { name: "Which clinic?" }).getByRole("button", { name: "Bulilit Smiles Pediatric Dental" }).click();
  }
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}

const tooth = (page: Page, n: number) => page.getByRole("button", { name: new RegExp(`^Tooth ${n}:`) });
async function openTooth(page: Page, n: number): Promise<Locator> {
  await tooth(page, n).focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("dialog", { name: new RegExp(`^Tooth ${n} ·`) });
  await expect(panel).toBeVisible();
  return panel;
}
async function choose(page: Page, combobox: string | RegExp, option: string | RegExp, scope: Locator = page.locator("body")) {
  await scope.getByRole("combobox", { name: combobox }).click();
  await page.getByRole("option", { name: option }).click();
}
const startVisit = (page: Page) =>
  viaApi(page, /^\/api\/patients\/[^/]+\/visits$/, "POST", 201, () => page.getByRole("button", { name: "Start visit as Ana Reyes" }).click());

test("front desk registers the child on the API", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const guardian = { id: `g_${RUN}`, fullName: "Ana Caro", relationship: "Mother", phone: `0917${String(Date.now() % 10_000_000).padStart(7, "0")}`, isPrimary: true };
  const res = await page.request.post("/api/patients", {
    data: {
      firstName: CHILD, lastName: "Reyes", birthDate: "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" },
      privacyConsent: { guardianId: guardian.id, photos: true, reminders: true, confirmed: true },
    },
  });
  expect(res.status()).toBe(201);
  childId = ((await res.json()) as { id: string }).id;
});


/** A tab of the open patient. Plan, Notes, Chart and Overview live in the URL (?tab=). */
const tab = (page: Page, name: string) => page.getByRole("tabpanel", { name });
async function pick(page: Page, field: Locator, option: string | RegExp) {
  await field.click();
  await page.getByRole("option", { name: option }).click();
}
const finishVisit = (page: Page) =>
  viaApi(page, /^\/api\/visits\/[^/]+\/complete$/, "POST", 200, () => page.getByRole("button", { name: "Finish visit" }).click());

test("a dentist plans a follow-up, signs its note, and the API keeps the note read-only (done-when)", async ({ page }) => {
  expect(childId).not.toBe("");
  await signInAs(page, USERS.dentist);
  const planRead = loads(page, /^\/api\/patients\/[^/]+\/plan$/);
  await page.goto(`/patients/${childId}?tab=plan`);
  expect(await fromApi(await planRead)).toBe(true);
  const plan = tab(page, "Plan");
  await pick(page, plan.getByLabel("Procedure"), "Follow-up");
  await viaApi(page, /^\/api\/patients\/[^/]+\/plan$/, "POST", 201, () => plan.getByRole("button", { name: "Add", exact: true }).click());
  await expect(plan.getByText("0 of 1 done")).toBeVisible();

  await page.goto(`/patients/${childId}?tab=chart`);
  await startVisit(page);
  await page.goto(`/patients/${childId}?tab=notes`);
  await page.getByRole("button", { name: "New note" }).click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await choose(page, "Template", "Follow-up visit", dialog);
  await choose(page, "Healing", "Satisfactory", dialog);
  await viaApi(page, /^\/api\/patients\/[^/]+\/notes$/, "POST", 201, () => dialog.getByRole("button", { name: "Save draft" }).click());
  await expect(dialog).toBeHidden();

  await page.getByRole("button", { name: "Edit or sign" }).click();
  const edit = page.getByRole("dialog", { name: /^Edit Follow-up visit/ });
  await choose(page, "Healing", "Delayed", edit);
  const signed = loads(page, /^\/api\/notes\/[^/]+\/sign$/, "POST");
  await viaApi(page, /^\/api\/notes\/[^/]+$/, "PUT", 200, () => edit.getByRole("button", { name: "Save and sign" }).click());
  const sign = await signed;
  expect([sign.status(), await fromApi(sign)]).toEqual([200, true]);
  const note = page.getByRole("article").filter({ hasText: "Follow-up visit" });
  await expect(note.getByText("Signed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit or sign" })).toHaveCount(0);

  const noteId = ((await sign.json()) as { id: string }).id;
  const put = await page.request.put(`/api/notes/${noteId}`, { data: { values: { healing: "Satisfactory" }, behavior: [] } });
  expect([put.status(), await put.text()]).toEqual([409, "A signed note can't be changed"]);
  expect((await page.request.post(`/api/notes/${noteId}/sign`)).status()).toBe(409);

  await page.goto(`/patients/${childId}?tab=plan`);
  await expect(tab(page, "Plan").getByText("1 of 1 done")).toBeVisible();
});

test("a habit recorded at one visit and stopped at a later one shows as stopped (done-when)", async ({ page }) => {
  await signInAs(page, USERS.dentist);
  await page.goto(`/patients/${childId}?tab=chart`);
  await expect(page.getByText("Visit in progress")).toBeVisible(); // the visit from the test above
  await page.goto(`/patients/${childId}`);
  await page.getByRole("button", { name: "Record for this visit" }).click();
  let dialog = page.getByRole("dialog", { name: "Growth and development" });
  await dialog.getByRole("checkbox", { name: "Thumb sucking" }).check();
  await dialog.locator("#thumb_sucking-start").fill("2025-01-15");
  await viaApi(page, /^\/api\/visits\/[^/]+\/growth$/, "PUT", 200, () => dialog.getByRole("button", { name: "Save" }).click());
  await expect(dialog).toBeHidden();
  await page.goto(`/patients/${childId}?tab=chart`);
  await finishVisit(page);

  await startVisit(page);
  await page.goto(`/patients/${childId}`);
  await page.getByRole("button", { name: "Record for this visit" }).click();
  dialog = page.getByRole("dialog", { name: "Growth and development" });
  await dialog.getByRole("checkbox", { name: "Thumb sucking" }).check();
  await dialog.locator("#thumb_sucking-start").fill("2025-01-15");
  await dialog.locator("#thumb_sucking-stop").fill("2025-06-01");
  await viaApi(page, /^\/api\/visits\/[^/]+\/growth$/, "PUT", 200, () => dialog.getByRole("button", { name: "Save" }).click());
  await expect(dialog).toBeHidden();

  const habits = page.getByRole("list", { name: "Oral habits" });
  await expect(habits.getByText("Thumb sucking")).toBeVisible();
  await expect(habits).toContainText(/Jan 15, 2025/);
  await expect(habits).toContainText(/Jun 1, 2025/);
  await page.reload();
  await expect(page.getByRole("list", { name: "Oral habits" })).toContainText(/Jun 1, 2025/);
  await page.goto(`/patients/${childId}?tab=chart`);
  await finishVisit(page);
});

test("the seeded example plan shows 3 of 6 done (done-when)", async ({ page }) => {
  await signInAs(page, USERS.dentist);
  const page1 = (await (await page.request.get("/api/patient-summaries?pageSize=100")).json()) as { rows: { id: string }[] };
  let example = "";
  for (const { id } of page1.rows) {
    const items = (await (await page.request.get(`/api/patients/${id}/plan`)).json()) as unknown[];
    if (items.length === 6) {
      example = id;
      break;
    }
  }
  expect(example).not.toBe("");
  const planRead = loads(page, /^\/api\/patients\/[^/]+\/plan$/);
  await page.goto(`/patients/${example}?tab=plan`);
  expect(await fromApi(await planRead)).toBe(true);
  await expect(tab(page, "Plan").getByText("3 of 6 done")).toBeVisible();
});
