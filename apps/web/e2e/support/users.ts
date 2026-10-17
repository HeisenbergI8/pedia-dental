import { expect, type Page } from "@playwright/test";

/** The demo accounts from DEMO_SCRIPT.md. All data is fake and lives in the browser. */
export const DEMO_PASSWORD = "pass123";

export const USERS = {
  owner: "owner@gmail.com",
  admin: "admin@gmail.com",
  dentist: "dentist@gmail.com",
  frontdesk: "frontdesk@gmail.com",
  parent: "parent@gmail.com",
  ngitiOwner: "owner@ngiti.demo",
  ipinOwner: "owner@ipin.demo",
  operator: "operator@primolar.demo",
} as const;

/** Signs in through the clinic sign-in form, typing like a person would. */
export async function signIn(page: Page, email: string, password: string = DEMO_PASSWORD) {
  await page.goto("/login");
  const form = page.getByRole("region", { name: "Sign in" });
  await form.getByLabel("Mobile number or email").fill(email);
  await form.getByLabel("Password", { exact: true }).fill(password);
  await form.getByRole("button", { name: "Sign in" }).click();
}

/** Signs in through Primolar's console sign-in form. */
export async function signInOperator(page: Page, email: string = USERS.operator, password: string = DEMO_PASSWORD) {
  await page.goto("/operator/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
}

/** Waits until the sign-in form is gone, i.e. the user has landed somewhere past it. */
export async function expectSignedIn(page: Page) {
  await expect(page).not.toHaveURL(/\/login$/, { timeout: 15_000 });
}

/**
 * The demo data is seeded from the browser's clock, so the day's patients and counts change with the time of day.
 * A test that names a seeded child or count pins the clock first (before the first page loads) so it holds at any hour.
 * The clock keeps running from here, like a real one.
 */
export const SEEDED_AT = new Date("2026-10-14T14:30:00+08:00");
export async function pinSeededDay(page: Page) {
  await page.clock.install({ time: SEEDED_AT });
}
