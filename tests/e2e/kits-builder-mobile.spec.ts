import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("mobile Kit builder retains draft and explicit reorder controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  const addButtons = page.getByRole("button", { name: /Add .* to Kit/ });
  await addButtons.nth(0).click();
  await addButtons.nth(1).click();
  await addButtons.nth(2).click();
  await page.getByRole("button", { name: "Expand Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: /Move .* up/ }).nth(1),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Move .* up/ })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Expand Kit workspace" }),
  ).toBeFocused();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
