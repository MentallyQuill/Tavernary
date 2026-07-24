import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("serves the catalog from the configured base path", async ({ page }) => {
  await page.goto(sitePath());
  await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
  await expect(page).not.toHaveTitle(/404/);
});
