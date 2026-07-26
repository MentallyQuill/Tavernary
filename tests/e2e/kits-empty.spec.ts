import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("switches between projects and the empty Kits catalog", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(page.getByText("No Kits have been published yet")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort Kits" })).toHaveValue(
    "trending",
  );
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(211);
});
