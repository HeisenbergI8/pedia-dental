import { expect as baseExpect, test, type Locator, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B5: visits and the dental chart against apps/api (the web in `disabled` since B13c1). Skipped unless E2E_API=1. Start-up: a fresh database
 * seeded with B5's rows (`DEMO_LOGINS=true COOKIE_SECURE=false`), the API, and the web in `disabled` (plan Step 7.2).
 * Re-runnable against one database: every run charts its own new child.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const CHILD = `Caro${RUN}`;
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

test("a dentist charts caries on 74-O, restores it at a later visit, and sees both in history (done-when)", async ({ page }) => {
  expect(childId).not.toBe("");
  await signInAs(page, USERS.dentist);
  const chart = loads(page, /^\/api\/patients\/[^/]+\/chart$/);
  const visits = loads(page, /^\/api\/patients\/[^/]+\/visits$/);
  await page.goto(`/patients/${childId}?tab=chart`);
  expect([await fromApi(await chart), await fromApi(await visits)]).toEqual([true, true]);

  await startVisit(page);
  await expect(page.getByText("Visit in progress")).toBeVisible();
  let panel = await openTooth(page, 74);
  await panel.getByRole("checkbox", { name: "Occlusal (O)" }).check();
  await viaApi(page, /^\/api\/patients\/[^/]+\/chart$/, "POST", 201, () => panel.getByRole("button", { name: "Save finding" }).click());
  await page.keyboard.press("Escape");
  await expect(tooth(page, 74)).toHaveAccessibleName("Tooth 74: O caries");

  await viaApi(page, /^\/api\/visits\/[^/]+\/complete$/, "POST", 200, () => page.getByRole("button", { name: "Finish visit" }).click());
  await expect(page.getByText(/Last visit/)).toBeVisible(); // the header's summary, refetched from the API

  await startVisit(page);
  panel = await openTooth(page, 74);
  await choose(page, "Condition", "Restored", panel);
  await panel.getByRole("checkbox", { name: "Occlusal (O)" }).check();
  await viaApi(page, /^\/api\/patients\/[^/]+\/chart$/, "POST", 201, () => panel.getByRole("button", { name: "Save finding" }).click());
  await expect(panel.getByText("Restored · O")).toBeVisible();
  await expect(panel.getByText("Caries · O")).toBeVisible(); // both in the tooth's history
  await page.keyboard.press("Escape");
  await expect(tooth(page, 74)).toHaveAccessibleName("Tooth 74: O restored");

  // As of the first visit: newest first in the picker, the current one marked "(current)".
  await choose(page, "Chart as of", /^Visit of (?!.*current)/);
  await expect(tooth(page, 74)).toHaveAccessibleName("Tooth 74: O caries");
  await choose(page, "Chart as of", "Latest");
});

test("a dentist records one sealant on two teeth in one request, and a reload reads it back from the API", async ({ page }) => {
  await signInAs(page, USERS.dentist);
  await page.goto(`/patients/${childId}?tab=chart`);
  await expect(page.getByText("Visit in progress")).toBeVisible(); // the second visit from the test above
  await page.getByRole("button", { name: "Select several" }).click();
  for (const n of [16, 26]) {
    await tooth(page, n).focus();
    await page.keyboard.press("Enter");
  }
  await page.getByRole("button", { name: "Record finding" }).click();
  const sheet = page.getByRole("dialog", { name: "2 teeth" });
  await choose(page, "Condition", "Sealant", sheet);
  await viaApi(page, /^\/api\/patients\/[^/]+\/chart\/batch$/, "POST", 201, () => sheet.getByRole("button", { name: /Save/ }).click());
  await page.reload();
  await expect(tooth(page, 16)).toHaveAccessibleName(/Tooth 16: .*sealant/i);
  await expect(tooth(page, 26)).toHaveAccessibleName(/Tooth 26: .*sealant/i);

  const entries = (await (await page.request.get(`/api/patients/${childId}/chart`)).json()) as { tooth: number }[];
  expect(entries.map((e) => e.tooth).sort()).toEqual([16, 26, 74, 74]);
  await viaApi(page, /^\/api\/visits\/[^/]+\/complete$/, "POST", 200, () => page.getByRole("button", { name: "Finish visit" }).click());
});
