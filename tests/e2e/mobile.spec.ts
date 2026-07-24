import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.use({ viewport: { width: 390, height: 844 } });

test("uses mobile browse and filter sheets without page overflow", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Generation and reasoning" }).click();
  await expect(
    page.getByRole("button", { name: /Browse categories/ }),
  ).toContainText("Generation");

  const filters = page.getByRole("button", { name: "Open filters" });
  await filters.click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/sheet-open/);
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(filters).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/sheet-open/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
