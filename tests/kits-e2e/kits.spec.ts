import { expect, test } from "@playwright/test";

async function openKits(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
}

function cards(page: import("@playwright/test").Page) {
  return page.locator(".kit-card");
}

test("navigates, restores URLs, searches every indexed Kit field, and sorts", async ({
  page,
}) => {
  await openKits(page);
  const navigation = page.locator(".category-navigation button");
  await expect(navigation.nth(0)).toContainText("Kits");
  await expect(navigation.nth(1)).toContainText("All Projects");
  await expect(cards(page)).toHaveCount(8);

  const search = page.getByRole("searchbox", { name: "Search projects" });
  for (const term of [
    "Five Line",
    "distinctive phrase",
    "alpha-author",
    "Fixture Tool 04",
    "SillyTavern",
    "Memory",
  ]) {
    await search.fill(term);
    await expect(cards(page).first()).toBeVisible();
  }
  await search.fill("");

  const sort = page.getByRole("combobox", { name: "Sort Kits" });
  await expect(sort).toHaveValue("trending");
  for (const value of ["newest", "updated", "alphabetical"]) {
    await sort.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`sort=${value}`));
  }
  await sort.selectOption("alphabetical");
  await expect(cards(page).first()).toContainText("Alpha Kit");

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await expect(page).toHaveURL(/kit=alpha-kit-101/);
  await page.reload();
  await expect(
    page
      .getByLabel("Kit workspace")
      .getByRole("heading", { name: "Alpha Kit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(49);
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(
    page
      .getByLabel("Kit workspace")
      .getByRole("heading", { name: "Alpha Kit" }),
  ).toBeVisible();
});

test("applies every Kit filter and clears them", async ({ page }) => {
  await openKits(page);
  const filter = page.getByRole("complementary", { name: "Kit filters" });

  await filter.getByLabel("SillyTavern").check();
  await expect(cards(page).first()).toBeVisible();
  await filter.getByLabel("Memory").check();
  await expect(cards(page).first()).toBeVisible();
  await filter.getByLabel("Includes project").fill("fixture-tool-04");
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByLabel("Minimum projects").fill("4");
  await expect(page.getByRole("article", { name: "Alpha Kit" })).toHaveCount(0);
  await filter.getByLabel("Minimum projects").fill("3");
  await filter.getByLabel("Maximum projects").fill("3");
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByText("Tavernary Pick only").click();
  await expect(cards(page)).toHaveCount(1);
  await filter.getByRole("button", { name: "Clear Kit filters" }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("mobile Kit filters are visible, dismissible, and mode-local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
  await page.getByRole("button", { name: "Close Kit workspace" }).click();

  const filterButton = page.getByRole("button", { name: "Open filters" });
  await filterButton.click();
  const kitFilters = page.getByRole("dialog", { name: "Kit filters" });
  await expect(kitFilters).toBeVisible();
  await kitFilters.getByText("Tavernary Pick only").click();
  await expect(filterButton.locator("b")).toHaveText("1");
  await kitFilters.getByRole("button", { name: "Close Kit filters" }).click();
  await expect(filterButton).toBeFocused();

  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(kitFilters).toHaveCount(0);
  await filterButton.click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Kit filters" })).toHaveCount(
    0,
  );
});

test("inspects stacks, preserves caution rows, and builds contribution URLs", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => {
        throw new Error("Web Share must not be called");
      },
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openKits(page);
  await page.evaluate(() => {
    window.open = (url) => {
      window.sessionStorage.setItem("opened-url", String(url));
      return null;
    };
  });

  const longDescription = page
    .getByRole("article")
    .filter({ hasText: "Five Line Kit" })
    .locator(".kit-card-description");
  expect(
    await longDescription.evaluate(
      (element) => getComputedStyle(element).webkitLineClamp,
    ),
  ).toBe("5");

  await page
    .getByRole("article", { name: "Alpha Kit" })
    .getByRole("button", { name: "Report Kit" })
    .click();
  const cardReport = new URL(
    (await page.evaluate(() => sessionStorage.getItem("opened-url")))!,
  );
  expect(cardReport.searchParams.get("kit-id")).toBe("alpha-kit-101");
  expect(cardReport.searchParams.get("share-url")).toContain(
    "kit=alpha-kit-101",
  );

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const first = page.getByRole("button", {
    name: "Fixture Frontend project details",
  });
  const second = page.getByRole("button", {
    name: "Fixture Tool 02 project details",
  });
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(second).toHaveAttribute("aria-expanded", "true");

  await page
    .getByRole("button", { name: "Copy link", exact: true })
    .last()
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("mode=kits");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("kit=alpha-kit-101");

  const report = page.getByRole("link", { name: "Report Kit" });
  const withdrawal = page.getByRole("link", { name: "Request withdrawal" });
  for (const link of [report, withdrawal]) {
    const url = new URL((await link.getAttribute("href"))!);
    expect(url.searchParams.get("kit-id")).toBe("alpha-kit-101");
    expect(url.searchParams.get("share-url")).toContain("kit=alpha-kit-101");
  }

  await page.getByRole("button", { name: "Open Flagged Stack" }).click();
  await expect(
    page
      .getByRole("article", { name: "Flagged Stack" })
      .getByText("Contains flagged projects"),
  ).toBeVisible();
  const flagged = page.locator(".kit-project-stack li.flagged");
  await expect(flagged).toContainText("Fixture Flagged Tool");
  await expect(flagged.locator("a")).toHaveCount(0);
});

test("supports create, duplicate, edit, add, order, and collapsed persistence", async ({
  page,
}) => {
  await openKits(page);
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await expect(page.getByRole("heading", { name: "Create Kit" })).toBeVisible();

  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  const add = page.getByRole("button", { name: /Add .* to Kit/ });
  await add.nth(0).click();
  await add.nth(1).click();
  await add.nth(2).click();
  const rows = page.locator(".kit-builder-row");
  const secondName = await rows.nth(1).locator("strong").textContent();
  await rows
    .nth(1)
    .getByRole("button", { name: /Move .* up/ })
    .click();
  await expect(rows.nth(0).locator("strong")).toHaveText(secondName!);

  await page.getByRole("button", { name: "Collapse workspace" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Expand Kit workspace" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand Kit workspace" }).click();

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("heading", { name: "Create Kit" })).toBeVisible();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Kit" })).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile workspace traps focus, returns it, and exposes explicit order controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  const opener = page.getByRole("button", { name: "Open Alpha Kit" });
  await opener.click();
  await expect(
    page.getByRole("complementary", { name: "Kit workspace" }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Kit workspace" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    page.getByRole("button", { name: /Move .* up/ }).nth(1),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
