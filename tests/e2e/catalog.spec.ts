import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.beforeEach(async ({ page }) => {
  await page.goto(sitePath());
});

test("searches, changes density, and shows an empty New view", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Recursion");
  await expect(page.getByRole("heading", { name: "1 project" })).toBeVisible();
  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(page.locator("body")).toHaveClass(/compact-cards/);
  await page.getByRole("button", { name: "New" }).click();
  await expect(page.getByText("No projects match this view")).toBeVisible();
});

test("supports keyboard focus, composed filters, chip removal, and clear all", async ({
  page,
}) => {
  await page.keyboard.press("/");
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toBeFocused();
  await page.getByLabel("Extension", { exact: true }).check();
  await page.getByLabel("SillyTavern", { exact: true }).check();
  await expect(
    page.getByRole("button", { name: "Remove Extension" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Remove Extension" }).click();
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "5 projects" })).toBeVisible();
});

test("supports every sort and restores query state after reload", async ({
  page,
}) => {
  const sort = page.getByRole("combobox", { name: "Sort projects" });
  for (const value of ["recent", "strength", "popularity", "alphabetical"]) {
    await sort.selectOption(value);
    await expect(sort).toHaveValue(value);
  }

  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Recursion");
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toHaveValue("Recursion");
  await expect(page.getByRole("heading", { name: "1 project" })).toBeVisible();
});

test("uses canonical external URLs for project cards", async ({ page }) => {
  const recursion = page.getByRole("link", { name: /Recursion/ });
  await expect(recursion).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Recursion",
  );
  await expect(recursion).toHaveAttribute("target", "_blank");
  await expect(recursion).toHaveAttribute("rel", /noopener/);
});
