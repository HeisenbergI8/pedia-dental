import { expect as baseExpect, test, type Page } from "@playwright/test";
import { USERS, signIn } from "./support/users";

/** Dr. Ana Reyes on a phone (Pixel 7 project): the record's section picker and the half-mouth chart. */
test.describe.configure({ timeout: 120_000 });
const expect = baseExpect.configure({ timeout: 20_000 });

async function signInAtBulilit(page: Page) {
  await signIn(page, USERS.dentist);
  await page.getByRole("region", { name: "Which clinic?" }).getByRole("button", { name: "Bulilit Smiles Pediatric Dental" }).click();
  await expect(page).toHaveURL(/\/appointments/, { timeout: 60_000 });
}

/** On a phone the nav is behind a menu; find Patients the way a person would. */
async function openAvery(page: Page) {
  const patients = page.getByRole("link", { name: "Patients" });
  if (!(await patients.first().isVisible())) await page.getByRole("button", { name: /menu/i }).first().click();
  await patients.first().click();
  await page.getByRole("searchbox", { name: "Search patients" }).fill("Avery Toy");
  await expect(page.getByText("1 patient matches")).toBeVisible();
  await page.getByRole("link", { name: /Toy, Avery|Avery Toy/ }).first().click();
  await expect(page.getByRole("heading", { name: "Avery Toy", level: 1 })).toBeVisible();
}

test.describe("happy paths", () => {
  test("dentist on a phone switches record sections with the Section picker", async ({ page }) => {
    await signInAtBulilit(page);
    await openAvery(page);
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.getByRole("option", { name: "Chart" }).click();
    await expect(page).toHaveURL(/tab=chart/);
    await expect(page.getByRole("group", { name: "Side of the mouth" })).toBeVisible();
  });

  test("dentist on a phone charts a finding on the patient's left side", async ({ page }) => {
    await signInAtBulilit(page);
    await openAvery(page);
    await page.getByRole("button", { name: /^Start visit/ }).first().click();
    await expect(page.getByText("Visit in progress")).toBeVisible();
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.getByRole("option", { name: "Chart" }).click();
    await page.getByRole("group", { name: "Side of the mouth" }).getByRole("button", { name: "Patient's left" }).click();
    await page.getByRole("button", { name: /^Tooth 36:/ }).click();
    const panel = page.getByRole("dialog", { name: /^Tooth 36 ·/ });
    await panel.getByRole("button", { name: "Save finding" }).click();
    await expect(page.getByText("Finding saved on tooth 36")).toBeVisible();
  });
});

test.describe("edge cases", () => {
  test("tooth buttons on a phone are at least 44px tall to tap", async ({ page }) => {
    await signInAtBulilit(page);
    await openAvery(page);
    await page.getByRole("combobox", { name: "Section" }).click();
    await page.getByRole("option", { name: "Chart" }).click();
    const box = await page.getByRole("button", { name: /^Tooth 16:/ }).boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.width).toBeGreaterThanOrEqual(24);
  });
});
