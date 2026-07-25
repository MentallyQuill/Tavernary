import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.use({ viewport: { width: 390, height: 844 } });

test.describe("server-rendered mobile shell", () => {
  test.use({ javaScriptEnabled: false });

  test("does not flash the desktop Kit Builder before hydration", async ({
    page,
  }) => {
    await page.goto(sitePath());

    await expect(page.locator(".site-header")).toBeVisible();
    await expect(page.locator(".kit-builder-panel")).toBeHidden();
  });
});

test("matches the approved mobile header hierarchy", async ({ page }) => {
  await page.goto(sitePath());

  const brand = page.getByRole("link", { name: "Tavernary home" });
  await expect(brand.locator(".brand-name")).toHaveCSS(
    "color",
    "rgb(225, 138, 36)",
  );
  await expect(brand.locator("img")).toHaveAttribute(
    "src",
    "./tavernary-trihex.png",
  );
  await expect(brand.locator("img")).toHaveCSS("width", "48px");
  await expect(brand.locator("img")).toHaveCSS("height", "48px");
  await expect(brand.locator("img")).toHaveCSS("transform", "none");
  const actions = page.locator(".header-actions");
  await expect(actions).toContainText("Submit Project");
  await expect(actions).toContainText("About");
  await expect(actions).toContainText("Help");
  await expect(actions.getByRole("link", { name: "About" })).toBeHidden();
  await expect(actions.getByRole("link", { name: "Help" })).toBeHidden();

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
  await page.getByRole("button", { name: "Generation & Reasoning" }).click();
  await expect(
    page.getByRole("button", { name: /Browse categories/ }),
  ).toContainText("Generation");

  const filters = page.getByRole("button", { name: "Open filters" });
  await filters.click();
  const dialog = page.getByRole("dialog", { name: "Filters" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("body")).toHaveClass(/sheet-open/);
  await expect(
    dialog.getByRole("searchbox", {
      name: "Search capabilities and characteristics",
    }),
  ).toHaveCount(0);
  const capabilityOptions = dialog
    .getByRole("group", { name: "Capabilities & characteristics" })
    .locator(".metadata-options");
  expect(
    await capabilityOptions
      .locator("label")
      .evaluateAll(
        (labels) =>
          new Set(
            labels.map((label) =>
              Math.round(label.getBoundingClientRect().top),
            ),
          ).size,
      ),
  ).toBeLessThanOrEqual(4);
  await page.getByRole("button", { name: "Close filters" }).click();
  await expect(filters).toBeFocused();
  await expect(page.locator("body")).not.toHaveClass(/sheet-open/);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("expands canonical mobile frontends", async ({ page }) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Open filters" }).click();
  const group = page
    .getByRole("dialog", { name: "Filters" })
    .getByRole("group", { name: "Compatible frontend" });
  await expect(group.getByLabel("SillyTavern", { exact: true })).toBeVisible();
  await expect(group.getByLabel("Lumiverse")).toBeVisible();
  await expect(group.getByLabel("Marinara Engine")).toBeVisible();
  await expect(group.getByLabel("Sonder Engine")).toBeHidden();
  await group.getByRole("button", { name: "Show 1 more" }).click();
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
});

test("shows compact summaries without rendering mobile tooltips", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Use compact cards" }).click();

  const card = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion", exact: true }),
  });
  const summary = card.locator(".card-summary");

  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(
    "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  );
  await expect(summary).toHaveCSS("white-space", "nowrap");
  await expect(summary).toHaveCSS("text-overflow", "ellipsis");
  await expect(summary).toHaveCSS("overflow", "hidden");

  await card.locator(".card-title").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});
