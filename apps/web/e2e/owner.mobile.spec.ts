import { expect as baseExpect, test, type Page } from "@playwright/test";
const expect = baseExpect.configure({ timeout: 20_000 });
test.describe.configure({ timeout: 120_000 });
import { USERS, signIn } from "./support/users";

/* The Owner on a phone (Pixel 7): the same Settings work, through the bottom bar's More menu. UI only. */

async function openSettingsOnPhone(page: Page, tab: "Clinic" | "Branches" | "Staff" | "Plan") {
  await signIn(page, USERS.owner);
  await expect(page.getByRole("button", { name: /Account menu/ })).toBeVisible({ timeout: 45_000 });
  const quick = page.getByRole("navigation", { name: "Quick" });
  await expect(async () => {
    await quick.getByRole("button", { name: "More" }).click();
    await page.getByRole("link", { name: "Settings" }).click();
    await expect(page).toHaveURL(/\/settings/, { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: tab }).click();
  await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
}

test.describe("happy paths", () => {
  test("owner checks the plan's usage on a phone", async ({ page }) => {
    await openSettingsOnPhone(page, "Plan");
    const plan = page.getByRole("tabpanel", { name: "Plan" });
    await expect(plan.getByRole("heading", { name: "You're on the Mid plan" })).toBeVisible();
    await expect(plan.getByText("2 of 3")).toBeVisible();
    await expect(plan.getByText("5 of 20")).toBeVisible();
  });

  test("owner adds a staff login on a phone and can read and dismiss the temporary password", async ({ page }) => {
    await openSettingsOnPhone(page, "Staff");
    await page.getByRole("button", { name: "Add staff" }).click();
    const dialog = page.getByRole("dialog", { name: "Add a staff login" });
    await dialog.getByLabel("Full name").fill("Juana Dela Cruz");
    await dialog.getByLabel("Email").fill("juana@bulilitsmiles.ph");
    await dialog.getByRole("checkbox", { name: "Imus" }).check();
    await dialog.getByRole("button", { name: "Add staff" }).click();
    const done = page.getByRole("dialog", { name: "Juana Dela Cruz is added" });
    await expect(done.getByText("Temporary password", { exact: true })).toBeInViewport();
    await done.getByRole("button", { name: "I've passed it on" }).click();
    await expect(done).toBeHidden();
    await expect(page.getByText(/^6 of 20 staff logins/)).toBeVisible();
  });
});

test.describe("edge cases", () => {
  test("the payment history scrolls inside its box instead of widening the phone screen", async ({ page }) => {
    await openSettingsOnPhone(page, "Plan");
    const viewport = page.viewportSize()!;
    const billing = page.getByRole("heading", { name: "Billing" });
    await billing.scrollIntoViewIfNeeded();
    const box = await page.getByRole("tabpanel", { name: "Plan" }).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    await expect(page.getByRole("button", { name: "Download invoice PRM-INV-00008" })).toBeAttached();
  });

  test("Settings tabs and the staff Deactivate buttons are big enough to tap", async ({ page }) => {
    await openSettingsOnPhone(page, "Staff");
    for (const name of ["Clinic", "Branches", "Staff", "Plan"]) {
      const box = await page.getByRole("tab", { name }).boundingBox();
      expect(box!.height, `${name} tab height`).toBeGreaterThanOrEqual(24);
    }
    const deactivate = page.getByRole("button", { name: "Deactivate" }).first();
    await deactivate.scrollIntoViewIfNeeded();
    const box = await deactivate.boundingBox();
    expect(box!.height, "Deactivate button height").toBeGreaterThanOrEqual(24);
  });
});
