import { expect, test, type Page } from "@playwright/test";

/*
 * Pilot tests for DEMO_SCRIPT section 7 on a phone (Pixel 7): a clinic owner signs up from their mobile.
 * UI only: tapping, typing and reading the screen.
 */

test.describe.configure({ timeout: 120_000 });

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);
const field = (page: Page, label: string) => page.locator("main form").first().getByLabel(label, { exact: true });

async function expectWithinScreen(page: Page, what: ReturnType<Page["locator"]>) {
  const box = await what.boundingBox();
  expect(box, "on screen").toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
}

test.describe("happy paths", () => {
  test("a clinic owner signs up from a phone and sees the thank-you page", async ({ page }) => {
    const id = Math.random().toString(36).slice(2, 6).toUpperCase();
    const name = `Ngiting Pinoy ${id} Dental`;
    await page.goto("/get-started");
    await expect(page.getByRole("button", { name: "Send sign-up" })).toBeVisible();
    await field(page, "Clinic name").fill(name);
    await field(page, "Contact email").fill(`hi.${id.toLowerCase()}@pinoy.ph`);
    await field(page, "TIN").fill("987654321");
    await page.getByRole("radio", { name: /^Mid/ }).tap();
    await field(page, "Branch name").fill("Cebu");
    await field(page, "Address").fill("Osmeña Blvd, Cebu City");
    await field(page, "Phone").fill("0932 555 1234");
    await field(page, "Full name").fill("Dr. Jun Dela Peña");
    await field(page, "Email").fill(`jun.${id.toLowerCase()}@pinoy.ph`);
    await page.getByRole("checkbox", { name: /I'm authorised/ }).tap();
    await page.getByRole("button", { name: "Send sign-up" }).tap();
    await expect(page.getByRole("heading", { level: 1, name: `Thank you. ${name} is signed up` })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(`${name} · Mid plan · Use the default look`)).toBeVisible();
    await expectWithinScreen(page, page.getByRole("button", { name: "Copy reference" }));
    await expectWithinScreen(page, page.getByRole("region", { name: "Amount due" }));
  });
});

test.describe("edge cases", () => {
  test("every part of the form fits the phone's width, with the look options and the logo picker", async ({ page }) => {
    await page.goto("/get-started");
    await expect(page.getByRole("button", { name: "Send sign-up" })).toBeVisible();
    for (const r of [/^Small/, /^Mid/, /^Big/, /^Use my own/, /^Use the default look/, /^Design it for me/]) {
      await expectWithinScreen(page, page.getByRole("radio", { name: r }));
    }
    await page.getByRole("radio", { name: /^Use my own/ }).tap();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Logo/ }).tap();
    await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    await expectWithinScreen(page, page.getByRole("img", { name: "logo.png" }));
    await expectWithinScreen(page, page.getByLabel("Preview"));
    await expectWithinScreen(page, page.getByRole("combobox", { name: "Heading font" }));
  });

  test("the remove-logo button is at least 24 px to tap (WCAG 2.2 target size)", async ({ page }) => {
    await page.goto("/get-started");
    await expect(page.getByRole("button", { name: "Send sign-up" })).toBeVisible();
    await page.getByRole("radio", { name: /^Use my own/ }).tap();
    const chooser = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: /^Logo/ }).tap();
    await (await chooser).setFiles({ name: "logo.png", mimeType: "image/png", buffer: PNG });
    for (const target of [page.getByRole("button", { name: "Remove logo.png" })]) {
      const box = (await target.boundingBox())!;
      expect(Math.min(box.width, box.height), (await target.getAttribute("aria-label")) ?? undefined).toBeGreaterThanOrEqual(24);
    }
  });
});
