import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { USERS, signIn, signInOperator } from "./support/users";

/**
 * B2d: sign-in against apps/api. Since B13c1 the gate runs against a `disabled` web (no MSW, no bridge cookie); run it
 * once more with E2E_MOCKING=hybrid against a `hybrid` web to check the pd_mock_session / pd_mock_operator bridge
 * (lib/session-cookies.ts). Skipped unless E2E_API=1, so the usual run against the MSW demo is unchanged. Both servers are started by hand: the command block in
 * .claude/plans/feature-chunk-b2d-web-cutover-plan/ (Step 4.1). The Ipin owner is left out: its grace period and
 * pause are the mock's alone until B12.
 */
test.skip(!process.env.E2E_API, "Needs apps/api and a web server on it: E2E_API=1 E2E_BASE_URL=…");
test.describe.configure({ timeout: 120_000 });

const accountMenu = (page: Page) => page.getByRole("button", { name: /Account menu/ }).first();

/** The web's NEXT_PUBLIC_API_MOCKING for this run (B13c1): `disabled` by default, `hybrid` to test the bridge. */
const MODE = process.env.E2E_MOCKING === "hybrid" ? "hybrid" : "disabled";

/** The API's session cookie (httpOnly: no script wrote it); in hybrid, the bridge naming the same login, for MSW. */
async function expectApiSession(context: BrowserContext, bridge: RegExp, real = "pd_session", mock = "pd_mock_session") {
  const jar = await context.cookies();
  expect(jar.find((c) => c.name === real), real).toMatchObject({ httpOnly: true });
  const mine = jar.find((c) => c.name === mock);
  if (MODE === "hybrid") expect(mine?.value, mock).toMatch(bridge);
  else expect(mine, `${mock} is written only in hybrid`).toBeUndefined();
}

/** Past sign-in, and still there after a reload: one 401 from MSW (no bridge) would sign the user out to /login. */
async function expectStaysSignedIn(page: Page) {
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });
  await expect(accountMenu(page)).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await expect(page).not.toHaveURL(/\/login$/);
  await expect(accountMenu(page)).toBeVisible({ timeout: 30_000 });
}

const STAFF = [
  ["owner", USERS.owner, "Bulilit Smiles", /^demo\.clinic_demo\.[^.]+$/],
  ["admin", USERS.admin, "Bulilit Smiles", /^demo\.clinic_demo\.[^.]+$/],
  ["front desk", USERS.frontdesk, "Bulilit Smiles", /^demo\.clinic_demo\.[^.]+$/],
  ["Ngiti owner", USERS.ngitiOwner, "Ngiti Kids", /^demo\.clinic_ngiti\.[^.]+$/],
] as const;

for (const [who, email, clinic, bridge] of STAFF) {
  test(`the ${who} signs in against the API and MSW serves the rest`, async ({ page, context }) => {
    await signIn(page, email);
    await expectStaysSignedIn(page);
    await expectApiSession(context, bridge);
    // GET /clinic, from the API: the clinic's name, as its logo (alt text) or as text when it has none.
    const name = new RegExp(clinic);
    await expect(page.getByAltText(name).or(page.getByText(name)).first()).toBeVisible({ timeout: 30_000 });
  });
}

for (const clinic of ["Bulilit", "Ngiti"] as const) {
  test(`the dentist at two clinics picks ${clinic} on the chooser`, async ({ page, context }) => {
    await signIn(page, USERS.dentist);
    const chooser = page.getByRole("region", { name: "Which clinic?" });
    await expect(chooser).toBeVisible({ timeout: 30_000 });
    await chooser.getByRole("button", { name: new RegExp(clinic) }).click();
    await expectStaysSignedIn(page);
    await expectApiSession(context, clinic === "Bulilit" ? /^demo\.clinic_demo\./ : /^demo\.clinic_ngiti\./);
  });
}

test("the parent signs in, and the portal's children come from MSW", async ({ page, context }) => {
  await signIn(page, USERS.parent);
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 45_000 });
  // The notice step is the API's (GET /auth/acknowledgement); a re-run against the same database has acknowledged it.
  const hello = page.getByRole("heading", { name: "Hello, Aliya" });
  const notice = page.getByRole("button", { name: "I've read this" });
  await expect(hello.or(notice)).toBeVisible({ timeout: 30_000 });
  if (await notice.isVisible()) await notice.click();
  await expect(hello).toBeVisible({ timeout: 30_000 }); // the children: MSW, through the bridge
  await expectApiSession(context, /^demo\.clinic_demo\.guardian\./);
});

test("the Owner switches branch, and the API keeps it across a reload", async ({ page }) => {
  await signIn(page, USERS.owner);
  await expectStaysSignedIn(page);
  const branch = page.getByRole("combobox", { name: "Branch" });
  await expect(branch).toHaveText(/Imus/, { timeout: 30_000 }); // the first branch by position (B2c)
  await branch.click();
  await page.getByRole("option", { name: /Dasmariñas/ }).click();
  await expect(branch).toHaveText(/Dasmariñas/, { timeout: 30_000 }); // GET /clinic read pd_branch
  await page.reload();
  await expect(branch).toHaveText(/Dasmariñas/, { timeout: 30_000 });
});

test("signing out ends the API session and clears the bridge", async ({ page, context }) => {
  await signIn(page, USERS.admin);
  await expectStaysSignedIn(page);
  await accountMenu(page).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 30_000 });
  await expect.poll(async () => (await context.cookies()).map((c) => c.name).filter((n) => n === "pd_session" || n === "pd_mock_session")).toEqual([]);
});

test("the operator signs in on pd_operator, and the console's routes (the API since B12) see it", async ({ page, context }) => {
  await signInOperator(page);
  const heading = page.getByRole("heading", { name: "Clinic accounts", level: 1 });
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expectApiSession(context, /^operator\.[^.]+$/, "pd_operator", "pd_mock_operator");
  expect((await context.cookies()).some((c) => c.name === "pd_session")).toBe(false);
  await expect(page.getByText("Bulilit Smiles Pediatric Dental").first()).toBeVisible({ timeout: 30_000 }); // GET /operator/accounts
  await page.reload();
  await expect(heading).toBeVisible({ timeout: 30_000 });
});
