import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.use({ viewport: { width: 390, height: 844 } });

test("matches the approved mobile header hierarchy", async ({ page }) => {
  await page.goto(sitePath());

  const brand = page.getByRole("link", { name: "Tavernary home" });
  await expect(brand.locator(".brand-name")).toHaveCSS(
    "color",
    "rgb(225, 138, 36)",
  );
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "./tavernary-logo.png",
  );
  await expect(page.locator(".header-primary-actions")).toContainText(
    "Submit Project",
  );
  await expect(page.locator(".header-secondary-actions")).toContainText(
    "About",
  );
  await expect(page.locator(".header-secondary-actions")).toContainText("Help");

  const browse = page.getByRole("button", { name: "Browse categories" });
  await expect(browse).toContainText("All Projects");
  await expect(browse.locator('[data-icon="chevron"]')).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Open filters" })
      .locator('[data-icon="filter-lines"]'),
  ).toBeVisible();
  await expect(
    page
      .getByRole("button", { name: "Use compact cards" })
      .locator('[data-icon="collapse"]'),
  ).toBeVisible();

  const submit = page.getByRole("link", { name: "Submit Project" });
  expect(
    await submit.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(40);
});

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
