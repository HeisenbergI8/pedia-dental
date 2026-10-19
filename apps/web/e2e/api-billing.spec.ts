import { expect as baseExpect, test, type Page, type Response } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/**
 * B8: billing, payments, deposits, voids and the financial dashboard against apps/api (the web in `disabled` since B13c1). Skipped unless
 * E2E_API=1. Start-up (B8 plan Step 10.2), on a fresh database (`db:seed` refuses a seeded one; no `migrate reset`):
 *   CREATE DATABASE pedia_dental_e2e_b8; then in apps/api: DATABASE_URL=… pnpm db:deploy && DEMO_LOGINS=true pnpm db:seed
 *   DATABASE_URL=… PORT=4120 DEMO_LOGINS=true COOKIE_SECURE=false pnpm dev:api
 *   NEXT_DIST_DIR=.next-hybrid NEXT_PUBLIC_API_MOCKING=disabled API_PROXY_TARGET=http://localhost:4120 pnpm exec next dev --port 3170
 * Re-runnable against one database: every run registers its own children. About 8 sign-ins a run.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ mode: "serial", timeout: 180_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

const RUN = Date.now().toString(36);
const [FULL, DEPOSIT, VOID] = ["Bill", "Hold", "Undo"].map((n) => `${n}${RUN}`);
const ids: Record<string, string> = {};

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
const peso = (n: number) => `₱${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

async function signInAs(page: Page, email: string) {
  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page.getByRole("button", { name: /Account menu/ }).first()).toBeVisible({ timeout: 45_000 });
}

/** A child whose plan items are done by signed notes, through the API as the admin (Admin and dentist). */
async function childWithDone(page: Page, firstName: string, plan: [string, number, number?][], notes: [string, Record<string, unknown>][]) {
  const json = async (res: Awaited<ReturnType<Page["request"]["post"]>>, status: number) => {
    expect(res.status(), await res.text()).toBe(status);
    return res.json() as Promise<{ id: string }>;
  };
  const guardian = { id: `g_${firstName}`, fullName: "Rosa Bill", relationship: "Mother", phone: `0917${String(Date.now() % 10_000_000).padStart(7, "0")}`, isPrimary: true };
  const child = await json(await page.request.post("/api/patients", {
    data: {
      firstName, lastName: "Reyes", birthDate: "2019-03-14", sex: "female", address: "", guardians: [guardian],
      emergencyContact: { name: "", phone: "" }, allergies: [], medicalConditions: [], medications: [], alerts: [],
      dentalHistory: { previousClinic: "", notes: "" }, privacyConsent: { guardianId: guardian.id, photos: true, reminders: true, confirmed: true },
    },
  }), 201);
  for (const [procedureCode, php, tooth] of plan) await json(await page.request.post(`/api/patients/${child.id}/plan`, { data: { procedureCode, fee: php * 100, tooth } }), 201);
  const visit = await json(await page.request.post(`/api/patients/${child.id}/visits`, { data: { dentistId: "staff_delacruz" } }), 201);
  for (const [templateId, values] of notes) {
    const note = await json(await page.request.post(`/api/patients/${child.id}/notes`, { data: { visitId: visit.id, templateId, values, behavior: [] } }), 201);
    await json(await page.request.post(`/api/notes/${note.id}/sign`), 200);
  }
  await json(await page.request.post(`/api/visits/${visit.id}/complete`), 200);
  ids[firstName] = child.id;
}
const NOTE_F: [string, Record<string, unknown>][] = [["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }]];

async function openBilling(page: Page, child: string) {
  const invoices = loads(page, /^\/api\/patients\/[^/]+\/invoices$/);
  await page.goto(`/patients/${ids[child]}?tab=billing`);
  expect(await fromApi(await invoices)).toBe(true);
  return page.getByRole("tabpanel");
}
const statement = (page: Page, label: string) => page.getByRole("tabpanel").locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
async function payDialog(page: Page, amount: number, method?: { name: string; ref: string }) {
  const dialog = page.getByRole("dialog", { name: "Record a payment" });
  await dialog.getByLabel("Amount received (₱)").fill(String(amount));
  if (method) {
    await dialog.getByLabel("Method").click();
    await page.getByRole("option", { name: method.name }).click();
    await dialog.getByLabel("Reference number").fill(method.ref);
  }
  return dialog;
}
const PAY = /^\/api\/invoices\/[^/]+\/payments$/;

test("the admin prepares three children with signed treatments, through the API", async ({ page }) => {
  await signInAs(page, USERS.admin);
  await childWithDone(page, FULL,
    [["prophylaxis", 1200], ["fluoride", 800], ["restoration", 2000, 51], ["restoration", 2000, 74], ["restoration", 2000, 84], ["follow_up", 500]],
    [["tpl_prophylaxis", { method: "Rubber cup and paste" }], ["tpl_fluoride", { agent: "5% NaF varnish", teeth: [] }],
      ["tpl_restoration", { teeth: [51, 74, 84], material: "Composite" }], ["tpl_follow_up", { healing: "Satisfactory" }]]);
  await childWithDone(page, DEPOSIT, [["fluoride", 800]], NOTE_F);
  await childWithDone(page, VOID, [["fluoride", 800]], NOTE_F);
});

test("front desk bills ₱8,500 and takes ₱5,000 in two payments, leaving ₱3,500 (done-when)", async ({ page }) => {
  expect(ids[FULL]).toBeTruthy();
  await signInAs(page, USERS.frontdesk);
  const tab = await openBilling(page, FULL);
  await viaApi(page, /^\/api\/patients\/[^/]+\/invoices$/, "POST", 201, () => tab.getByRole("button", { name: "Create invoice" }).click());
  await expect(toast(page, "Invoice created")).toBeVisible();

  await tab.getByRole("button", { name: "Record payment" }).first().click();
  let dialog = await payDialog(page, 3000);
  await viaApi(page, PAY, "POST", 201, () => dialog.getByRole("button", { name: "Record payment" }).click());
  await expect(toast(page, /Payment recorded · receipt AR-\d{6}/)).toBeVisible();
  await tab.getByRole("button", { name: "Record payment" }).first().click();
  dialog = await payDialog(page, 2000, { name: "GCash", ref: `GC-${RUN}` });
  await viaApi(page, PAY, "POST", 201, () => dialog.getByRole("button", { name: "Record payment" }).click());

  await expect(statement(page, "Total billed")).toHaveText(peso(8500));
  await expect(statement(page, "Paid")).toHaveText(peso(5000));
  await expect(statement(page, "Balance")).toHaveText(peso(3500));
  await expect(page.getByText(`${peso(3500)} due`)).toBeVisible(); // the pinned header, from the API
  for (const name of ["Refund", "Refund deposit", "Void"]) await expect(tab.getByRole("button", { name, exact: true })).toHaveCount(0); // decisions 2, 3
});

test("a payment sent twice with one Idempotency-Key is recorded once (done-when)", async ({ page }) => {
  // The form keeps its key for a retry whose answer was lost (lib/idempotency.ts, unit-tested); here the API's half:
  // the same request twice, as a retry sends it.
  await signInAs(page, USERS.frontdesk);
  const [bill] = (await (await page.request.get(`/api/patients/${ids[FULL]}/invoices`)).json()) as { id: string }[];
  const send = () => page.request.post(`/api/invoices/${bill!.id}/payments`, {
    headers: { "Idempotency-Key": `retry-${RUN}` }, data: { amount: 10000, method: "cash", receivedBy: "staff_cruz" },
  });
  const [first, second] = [await send(), await send()];
  expect([first.status(), second.status(), second.headers()["idempotent-replayed"]]).toEqual([201, 201, "true"]);
  expect(await second.json()).toEqual(await first.json());
  const tab = await openBilling(page, FULL);
  await expect(statement(page, "Balance")).toHaveText(peso(3400));
  await expect(tab.getByText("Cash payment", { exact: true })).toHaveCount(2); // ₱3,000 and this ₱100, once (not "GCash payment")
});

test("the admin refunds ₱500 with a reason", async ({ page }) => {
  await signInAs(page, USERS.admin);
  const tab = await openBilling(page, FULL);
  await tab.getByRole("button", { name: "Refund", exact: true }).first().click();
  const dialog = page.getByRole("dialog", { name: "Record a refund" });
  await dialog.getByLabel("Amount refunded (₱)").fill("500");
  await dialog.getByLabel("Reason for the refund").fill("Parent overpaid at the counter");
  await viaApi(page, PAY, "POST", 201, () => dialog.getByRole("button", { name: /Record refund/ }).click());
  await expect(statement(page, "Balance")).toHaveText(peso(3900));
});

test("front desk takes a deposit, pays a bill from it, and returns part of it", async ({ page }) => {
  await signInAs(page, USERS.frontdesk);
  const tab = await openBilling(page, DEPOSIT);
  await tab.getByRole("button", { name: "Take deposit" }).click();
  const dialog = page.getByRole("dialog", { name: "Take a deposit" });
  await dialog.getByLabel("Deposit received (₱)").fill("1000");
  await viaApi(page, /^\/api\/patients\/[^/]+\/deposits$/, "POST", 201, () => dialog.getByRole("button", { name: "Record deposit" }).click());
  await viaApi(page, /^\/api\/patients\/[^/]+\/invoices$/, "POST", 201, () => tab.getByRole("button", { name: "Create invoice" }).click());
  await tab.getByRole("button", { name: "Pay from deposit" }).click();
  const apply = page.getByRole("dialog", { name: "Pay from the deposit" });
  await viaApi(page, /^\/api\/invoices\/[^/]+\/apply-credit$/, "POST", 201, () => apply.getByRole("button", { name: "Pay from deposit" }).click());
  await expect(statement(page, "Balance")).toHaveText(peso(0));
  await tab.getByRole("button", { name: "Return to deposit" }).click();
  const back = page.getByRole("dialog", { name: "Return to the deposit" });
  await back.getByLabel(/Amount/).fill("300");
  await viaApi(page, /^\/api\/invoices\/[^/]+\/apply-credit$/, "POST", 201, () => back.getByRole("button", { name: "Return to deposit" }).click());
  await expect(statement(page, "Balance")).toHaveText(peso(300));
  await expect(statement(page, "Deposit on account")).toHaveText(peso(500));
});

test("the admin voids an untouched bill with a reason, and its treatment is billable again", async ({ page }) => {
  await signInAs(page, USERS.admin);
  const tab = await openBilling(page, VOID);
  await viaApi(page, /^\/api\/patients\/[^/]+\/invoices$/, "POST", 201, () => tab.getByRole("button", { name: "Create invoice" }).click());
  await tab.getByRole("button", { name: "Void", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Void this bill?" });
  await dialog.getByLabel("Why is it voided?").fill("Billed the wrong child");
  await viaApi(page, /^\/api\/invoices\/[^/]+\/void$/, "POST", 200, () => dialog.getByRole("button", { name: "Void bill" }).click());
  await expect(tab.getByRole("heading", { name: /· Voided$/ })).toBeVisible();
  await expect(tab.getByText(/: Billed the wrong child$/)).toBeVisible();
  await expect(tab.getByText("Ready to bill")).toBeVisible();
  await expect(statement(page, "Balance")).toHaveText(peso(0));
});

test("the day's collections and the dashboard come from the API and agree", async ({ page }) => {
  await signInAs(page, USERS.admin);
  const day = loads(page, /^\/api\/payments$/);
  await page.goto("/billing");
  const list = await day;
  expect(await fromApi(list)).toBe(true);
  const real = ((await list.json()) as { amount: number; method: string }[]).filter((p) => p.method !== "account_credit").reduce((s, p) => s + p.amount, 0);
  const finance = loads(page, /^\/api\/reports\/finance$/);
  await page.goto("/dashboard");
  expect(await fromApi(await finance)).toBe(true);
  await expect(page.locator("dt", { hasText: "Collected today" }).locator("xpath=following-sibling::dd[1]")).toHaveText(peso(real / 100));

  await signInAs(page, USERS.owner);
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "Showing" }).first().click();
  await viaApi(page, /^\/api\/reports\/finance$/, "GET", 200, () => page.getByRole("option", { name: "All branches" }).click());
});

test("the family parent reads their children's bills from the API", async ({ page }) => {
  await page.context().clearCookies();
  await signIn(page, USERS.parent);
  const notice = page.getByRole("button", { name: "I've read this" });
  const portal = page.getByRole("group", { name: "Whose records to show" });
  await expect(notice.or(portal).first()).toBeVisible({ timeout: 45_000 });
  if (await notice.isVisible()) await notice.click();
  const bills = loads(page, /^\/api\/patients\/[^/]+\/invoices$/);
  await page.goto("/portal/billing");
  expect(await fromApi(await bills)).toBe(true);
});
