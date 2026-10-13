import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

for (const [name, width] of [
  ["desktop", 1440],
  ["mobile", 390],
] as const) {
  test(`beveled color-mode switch in the ${name} header`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(sitePath());
    await expect(page.locator(".catalog-shell")).toHaveAttribute(
      "data-hydrated",
      "true",
    );
    await page.evaluate(() => document.fonts.ready);
    const header = page.locator(".site-header");
    await expect(header).toHaveScreenshot(`color-mode-${name}-standard.png`, {
      animations: "disabled",
    });
    await page.getByRole("switch", { name: "Colorblind mode" }).click();
    await expect(page.locator("html")).toHaveAttribute(
      "data-color-mode",
      "accessible",
    );
    await page.mouse.move(0, 0);
    await expect(header).toHaveScreenshot(`color-mode-${name}-accessible.png`, {
      animations: "disabled",
    });
  });
}
