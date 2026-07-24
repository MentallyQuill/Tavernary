import { expect, test } from "@playwright/test";

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page).toHaveScreenshot(`catalog-${viewport.name}.png`, {
      fullPage: true,
      animations: "disabled",
    });
  });
}
