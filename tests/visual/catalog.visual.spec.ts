import { expect, test, type Page } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function stabilizeRefreshLabel(page: Page) {
  await page.locator(".catalog-toolbar p").evaluate((label) => {
    label.textContent = "Catalog refreshed recently";
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog surface`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await stabilizeRefreshLabel(page);
    await page.locator(".project-grid").scrollIntoViewIfNeeded();
    await expect(page).toHaveScreenshot(`catalog-${viewport.name}.png`, {
      fullPage: false,
      animations: "disabled",
    });
  });

  test(`${viewport.name} catalog first screen is bounded`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await stabilizeRefreshLabel(page);
    await expect(page).toHaveScreenshot(
      `catalog-${viewport.name}-bounded.png`,
      {
        fullPage: false,
        animations: "disabled",
      },
    );
  });

  if (viewport.name !== "tablet") {
    test(`${viewport.name} compact catalog surface`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(sitePath());
      await stabilizeRefreshLabel(page);
      await page.getByRole("button", { name: "Use compact cards" }).click();
      await expect(page).toHaveScreenshot(
        `catalog-${viewport.name}-compact.png`,
        {
          fullPage: false,
          animations: "disabled",
        },
      );
    });
  }
}
