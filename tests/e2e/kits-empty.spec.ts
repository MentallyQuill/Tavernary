import { expect, test } from "@playwright/test";

import {
  generatedCatalog,
  generatedProjectCount,
} from "../helpers/generated-catalog";
import { sitePath } from "../helpers/site-path";

const publishedKitCount = generatedCatalog.kits.length;

test("switches between projects and the published Kits catalog", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(page.locator(".kit-card")).toHaveCount(publishedKitCount);
  await expect(
    page.getByRole("heading", { name: "Ultimate Harry Potter" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort Kits" })).toHaveValue(
    "trending",
  );
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );
});
