import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog surface`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await page.locator(".project-grid").scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot(`catalog-${viewport.name}.png`, {
      fullPage: false,
      animations: "disabled",
    });
  });

  test(`${viewport.name} catalog first screen is bounded`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await expect(page).toHaveScreenshot(`catalog-${viewport.name}-bounded.png`, {
      fullPage: false,
      animations: "disabled",
    });
  });
}
