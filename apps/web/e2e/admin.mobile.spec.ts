import { expect, test, type Page } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/** The admin (Carmen Dela Cruz, Imus only) on a phone. UI only, like the desktop admin spec. */

async function signInAsAdmin(page: Page) {
  await signIn(page, USERS.admin);
  await expect(page).toHaveURL(/\/dashboard$/, { timeout: 15_000 });
  await expect(page.getByText(/Good (morning|afternoon|evening), Carmen/)).toBeVisible();
}

const quickBar = (page: Page) => page.getByRole("navigation", { name: "Quick" });

test.describe("happy paths", () => {
  test("admin on a phone reaches Settings through More and sees it read-only", async ({ page }) => {
    await signInAsAdmin(page);
    await expect(quickBar(page).getByRole("link")).toHaveText(["Dashboard", "Appointments", "Patients", "Billing"]);
    await quickBar(page).getByRole("button", { name: "More" }).click();
    await page.getByRole("dialog").getByRole("link", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.getByText("Read-only in this prototype.", { exact: false })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Plan" })).toHaveCount(0);
  });

  test("admin on a phone signs out from the top bar", async ({ page }) => {
    await signInAsAdmin(page);
    await page.getByRole("button", { name: /^Carmen Dela Cruz, Admin\. Account menu/ }).click();
    await page.getByRole("menuitem", { name: "Sign out" }).click();
    await page.getByRole("dialog", { name: "Sign out?" }).getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/, { timeout: 15_000 });
  });
});

test.describe("edge cases", () => {
  test("the phone tab bar's targets are at least 44 px tall", async ({ page }) => {
    await signInAsAdmin(page);
    const targets = quickBar(page).locator("a, button");
    await expect(targets).toHaveCount(5);
    for (const target of await targets.all()) {
      const box = await target.boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test("an Imus-only admin gets no branch picker in the phone's More sheet", async ({ page }) => {
    await signInAsAdmin(page);
    await quickBar(page).getByRole("button", { name: "More" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet.getByRole("link", { name: "Recalls", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Branch" })).toHaveCount(0);
  });
});
