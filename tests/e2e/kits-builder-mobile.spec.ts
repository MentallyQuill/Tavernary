import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("mobile Kits builder stays browse-first and retains its draft pill", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit workspace" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Open draft with 0 projects" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  for (let count = 1; count <= 3; count += 1) {
    await page
      .getByRole("button", { name: /Add .* to Kit/ })
      .first()
      .click();
    await expect(
      page.getByRole("button", {
        name: `Open draft with ${count} projects`,
      }),
    ).toBeVisible();
  }
  await expect(page.locator(".add-to-kit:disabled")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Open draft with 3 projects" })
    .click();
  await expect(
    page.getByRole("button", { name: /Move .* up/ }).nth(1),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Move .* up/ })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Open draft with 3 projects" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
