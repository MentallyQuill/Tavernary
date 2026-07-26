import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as { projects: unknown[] };
const projectCount = catalog.projects.length;

test("switches between projects and the published Kits catalog", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
  await expect(page.locator(".project-card")).toHaveCount(0);
  await expect(page.locator(".kit-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Ultimate Harry Potter" }),
  ).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Sort Kits" })).toHaveValue(
    "trending",
  );
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(projectCount);
});
