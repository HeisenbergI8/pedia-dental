import { expect, test, type Page } from "@playwright/test";
import { USERS, expectSignedIn, signIn } from "./support/users";

/** Pilot tests on a phone (Pixel 7): plan limits and billing as an Owner sees them on the go. UI only. */

test.describe.configure({ timeout: 180_000 });
const SLOW = { timeout: 30_000 };
const STAFF_LIMIT = "Your Small plan includes 5 staff logins. Contact Primolar to upgrade.";
const OVERDUE = /Your Primolar payment is overdue\. Pay by \d{1,2} \w+ \d{4} to keep your clinic running\./;

async function signInOnPhone(page: Page, email: string) {
  await signIn(page, email);
  await expectSignedIn(page);
  await expect(page.getByRole("navigation", { name: "Quick" })).toBeVisible(SLOW);
}

/** Phones reach Settings through the More sheet in the bottom bar. */
async function openSettingsOnPhone(page: Page, tab: "Staff" | "Plan" | "Branches") {
  await page.getByRole("navigation", { name: "Quick" }).getByRole("button", { name: "More" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible(SLOW);
  await page.getByRole("tab", { name: tab }).click();
  await expect(page.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
}

test.describe("happy paths", () => {
  test("Ipin's Owner sees the overdue banner on a phone", async ({ page }) => {
    await signInOnPhone(page, USERS.ipinOwner);
    await expect(page.getByRole("status").filter({ hasText: OVERDUE })).toBeVisible();
  });

  test("Ngiti's Owner on a phone reads why Add staff is off", async ({ page }) => {
    await signInOnPhone(page, USERS.ngitiOwner);
    await openSettingsOnPhone(page, "Staff");
    const panel = page.getByRole("tabpanel", { name: "Staff" });
    await expect(panel.getByRole("button", { name: "Add staff" })).toBeDisabled(SLOW);
    await expect(panel.getByText(STAFF_LIMIT)).toBeVisible();
  });
});

test.describe("edge cases", () => {
  test("the payment history scrolls inside its box, not the whole page, on a phone", async ({ page }) => {
    await signInOnPhone(page, USERS.ipinOwner);
    await openSettingsOnPhone(page, "Plan");
    const panel = page.getByRole("tabpanel", { name: "Plan" });
    await expect(panel.getByRole("table", { name: "Payments to Primolar" })).toBeAttached(SLOW);
    const viewport = page.viewportSize()!;
    const box = (await panel.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test("the Deactivate button on a phone is big enough to tap", async ({ page }) => {
    await signInOnPhone(page, USERS.ngitiOwner);
    await openSettingsOnPhone(page, "Staff");
    const btn = page.getByRole("tabpanel", { name: "Staff" }).getByRole("button", { name: "Deactivate" }).first();
    await expect(btn).toBeVisible(SLOW);
    const box = (await btn.boundingBox())!;
    // WCAG 2.5.8 minimum target is 24x24 CSS px.
    expect(box.height).toBeGreaterThanOrEqual(24);
    expect(box.width).toBeGreaterThanOrEqual(24);
  });
});
