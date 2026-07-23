import { expect, test } from "@playwright/test";

test("serves the catalog from the configured base path", async ({ page }) => {
  const basePath = process.env.TAVERNARY_BASE_PATH ?? "";
  await page.goto(basePath ? `${basePath}/` : "/");
  await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
  await expect(page).not.toHaveTitle(/404/);
});
