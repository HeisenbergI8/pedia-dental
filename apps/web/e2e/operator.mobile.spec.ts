import { expect, test, type Page } from "@playwright/test";
import { signInOperator } from "./support/users";

/* The operator console on a phone (Pixel 7). UI only. */

test.describe.configure({ timeout: 120_000 });

async function openConsole(page: Page) {
  await signInOperator(page);
  await expect(page.getByRole("heading", { name: "Clinic accounts", level: 1 })).toBeVisible({ timeout: 30_000 });
}

test.describe("happy paths", () => {
  test("operator on a phone sees each clinic as a card with its plan and Owner", async ({ page }) => {
    await openConsole(page);
    const list = page.getByRole("list", { name: "Clinic accounts" });
    await expect(list).toBeVisible();
    const ipin = list.getByRole("listitem").filter({ has: page.getByRole("link", { name: "Ipin Kids Dental" }) });
    await expect(ipin).toContainText("Small");
    await expect(ipin).toContainText("Dr. Lara Santiago");
  });

  test("operator on a phone records Ipin's overdue payment", async ({ page }) => {
    await openConsole(page);
    await page.getByRole("link", { name: "Ipin Kids Dental" }).click();
    await expect(page.getByRole("heading", { name: "Ipin Kids Dental", level: 1 })).toBeVisible();
    await expect(page.getByText("Overdue, in grace")).toBeVisible();
    await page.getByRole("button", { name: "Record payment" }).click();
    const dialog = page.getByRole("dialog", { name: "Record payment" });
    await dialog.getByRole("button", { name: "Record payment" }).click();
    await expect(page.getByText("Payment recorded for Ipin Kids Dental")).toBeVisible();
    await expect(page.getByText("Overdue, in grace")).toHaveCount(0);
  });
});

test.describe("edge cases", () => {
  test("the console's main controls are big enough to tap on a phone", async ({ page }) => {
    await openConsole(page);
    for (const control of [
      page.getByRole("button", { name: "Sign out" }),
      page.getByRole("button", { name: "New clinic account" }),
      page.getByRole("navigation", { name: "Console" }).getByRole("link", { name: "Sign-ups" }),
    ]) {
      const box = await control.boundingBox();
      expect(box, "control is on screen").not.toBeNull();
      expect(box!.height, "at least 24px tall (WCAG 2.5.8)").toBeGreaterThanOrEqual(24);
    }
  });

  test("the new clinic form fits a phone screen and can be cancelled", async ({ page }) => {
    await openConsole(page);
    await page.getByRole("button", { name: "New clinic account" }).click();
    const dialog = page.getByRole("dialog", { name: "New clinic account" });
    await expect(dialog.getByLabel("Clinic name")).toBeVisible();
    const box = await dialog.boundingBox();
    const viewport = page.viewportSize()!;
    expect(box!.width).toBeLessThanOrEqual(viewport.width);
    await dialog.getByRole("button", { name: "Cancel" }).scrollIntoViewIfNeeded();
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
  });
});
