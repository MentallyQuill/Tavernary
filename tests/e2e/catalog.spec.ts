import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.beforeEach(async ({ page }) => {
  await page.goto(sitePath());
});

test("uses the approved desktop filter controls", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "System Presets 2" }),
  ).toBeVisible();
  await expect(page.getByText("Filters", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("searchbox", { name: "Search compatible frontends" }),
  ).toBeVisible();
  await expect(
    page.getByRole("searchbox", {
      name: "Search capabilities and characteristics",
    }),
  ).toBeVisible();
  for (const searchbox of await page
    .locator(".filter-panel .filter-search")
    .all()) {
    const dimensions = await searchbox.boundingBox();
    expect(dimensions?.width).toBeGreaterThan(100);
    expect(dimensions?.height).toBe(32);
  }
  await expect(page.getByText("Project kind", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Capabilities & characteristics", { exact: true }),
  ).toBeVisible();

  await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .fill("Marinara");
  await expect(page.getByLabel("Marinara Engine")).toBeVisible();
  await expect(page.getByLabel("SillyTavern")).toBeHidden();
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
  await page
    .getByLabel("Active filters")
    .getByRole("button", { name: "Clear all" })
    .click();
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

test("matches the approved card anatomy", async ({ page }) => {
  const card = page.locator(".project-card").first();

  await expect(page.locator(".project-card")).toHaveCount(5);
  await expect(card.locator("h2")).toHaveCSS("font-family", /Inter/);
  await expect(card.locator(".card-bottom")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  await expect(card.locator(".license")).toHaveCSS("border-top-width", "0px");
  expect(
    await card.evaluate((element) => {
      return getComputedStyle(element, "::before").content;
    }),
    "kind stripes were removed from the reference design",
  ).toBe("none");
});

test("keeps repository activity facts visible on mobile cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const card = page.locator(".project-card").first();
  await expect(card.locator(".community")).toBeVisible();
  await expect(card.locator(".repository-size")).toBeVisible();
  await expect(card.locator(".activity-bars")).toBeVisible();
});
