import { expect, test } from "@playwright/test";

test("keeps a closed desktop Kit Builder closed after refresh", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/?mode=kits");

  await page
    .getByRole("button", { name: "Collapse Kit Builder", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Open Kit Builder", exact: true }),
  ).toBeVisible();

  await page.reload();

  await expect(
    page.getByRole("button", { name: "Open Kit Builder", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Collapse Kit Builder",
      exact: true,
    }),
  ).toHaveCount(0);
});
