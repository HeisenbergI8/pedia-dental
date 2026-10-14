import { test } from "@playwright/test";
import { USERS, expectSignedIn, signIn } from "./support/users";

test("front desk can sign in through the form", async ({ page }) => {
  await signIn(page, USERS.frontdesk);
  await expectSignedIn(page);
});
