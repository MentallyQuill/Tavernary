import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test.beforeEach(async ({ page }) => {
  await page.goto(sitePath());
});

test("uses the approved category strip", async ({ page }) => {
  const metrics = await page.locator(".category-navigation").evaluate((nav) => {
    const active = nav.querySelector("button.active");
    if (!active) throw new Error("Missing active category");
    const navStyle = getComputedStyle(nav);
    const activeStyle = getComputedStyle(active);
    const afterStyle = getComputedStyle(active, "::after");

    return {
      display: navStyle.display,
      height: Math.round(nav.getBoundingClientRect().height),
      tracks: navStyle.gridTemplateColumns.split(" ").length,
      activeBorder: activeStyle.borderTopWidth,
      afterContent: afterStyle.content,
      justifyContent: activeStyle.justifyContent,
      textAlign: activeStyle.textAlign,
    };
  });

  expect(metrics).toEqual({
    display: "grid",
    height: 50,
    tracks: 9,
    activeBorder: "1px",
    afterContent: "none",
    justifyContent: "center",
    textAlign: "center",
  });
});

test("uses the approved desktop workspace and matched toolbar controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const metrics = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>(".catalog-layout");
    const filters = document.querySelector<HTMLElement>(".filter-panel");
    const main = document.querySelector<HTMLElement>(".catalog-main");
    const tabs = document.querySelector<HTMLElement>(".view-tabs");
    const sort = document.querySelector<HTMLElement>(".sort-projects");
    if (!layout || !filters || !main || !tabs || !sort) {
      throw new Error("Missing desktop catalog controls");
    }

    const layoutBox = layout.getBoundingClientRect();
    const filterBox = filters.getBoundingClientRect();
    const mainBox = main.getBoundingClientRect();
    return {
      layoutLeft: Math.round(layoutBox.left),
      layoutWidth: Math.round(layoutBox.width),
      filterWidth: Math.round(filterBox.width),
      mainLeft: Math.round(mainBox.left),
      tabsHeight: Math.round(tabs.getBoundingClientRect().height),
      sortHeight: Math.round(sort.getBoundingClientRect().height),
      filterRadius: getComputedStyle(filters).borderRadius,
    };
  });

  expect(metrics).toEqual({
    layoutLeft: 0,
    layoutWidth: 1440,
    filterWidth: 238,
    mainLeft: 238,
    tabsHeight: 36,
    sortHeight: 36,
    filterRadius: "0px",
  });
});

test("uses the approved desktop filter controls", async ({ page }) => {
  await expect(
    page.getByRole("button", { name: "System Presets", exact: true }),
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
  const frontendSearch = await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .boundingBox();
  const metadataSearch = await page
    .getByRole("searchbox", {
      name: "Search capabilities and characteristics",
    })
    .boundingBox();
  expect(frontendSearch?.width).toBeGreaterThan(100);
  expect(frontendSearch?.height).toBe(32);
  expect(metadataSearch?.width).toBeGreaterThan(100);
  expect(metadataSearch?.height).toBe(36);
  await expect(page.getByText("Project kind", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Capabilities & characteristics", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".metadata-options")).toHaveCSS("display", "flex");
  await expect(page.locator(".metadata-filter-chip")).toHaveCount(10);

  await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .fill("Marinara");
  const frontendFilters = page.locator(".filter-panel");
  await expect(frontendFilters.getByLabel("Marinara Engine")).toBeVisible();
  await expect(
    frontendFilters.getByLabel("SillyTavern", { exact: true }),
  ).toBeHidden();
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
  const recursion = page.getByRole("link", { name: "Recursion", exact: true });
  await expect(recursion).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Recursion",
  );
  await expect(recursion).toHaveAttribute("target", "_blank");
  await expect(recursion).toHaveAttribute("rel", /noopener/);
});

test("matches the approved card anatomy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const card = page.locator(".project-card").first();

  await expect(page.locator(".project-card")).toHaveCount(5);
  await expect(card.locator("h2")).toHaveCSS("font-family", /Inter/);
  await expect(card.locator(".card-bottom")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  await expect(card.locator(".license")).toHaveCSS("border-top-width", "0px");
  await expect(card.locator(".function-symbol")).toHaveCSS("width", "23px");
  await expect(card.locator(".function-symbol")).toHaveCSS("height", "23px");
  await expect(card.locator(".function-symbol")).toHaveCSS(
    "border-top-width",
    "0px",
  );
  await expect(card.locator(".function-symbol")).toHaveCSS(
    "border-radius",
    "0px",
  );
  await expect(card.locator(".function-symbol svg")).toHaveCSS("width", "23px");
  await expect(card.locator("h2")).toHaveCSS("font-size", "17px");
  await expect(card.locator(".card-summary")).toHaveCSS("font-size", "11px");
  expect(
    await page.locator(".project-grid").evaluate((grid) => ({
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      gap: getComputedStyle(grid).gap,
    })),
  ).toEqual({ columns: 4, gap: "12px" });
  expect(
    await card.evaluate((element) => {
      return getComputedStyle(element, "::before").content;
    }),
    "kind stripes were removed from the reference design",
  ).toBe("none");
});

test("explains every card fact with hover help", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const repositoryCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion" }),
  });
  const presetCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Purrfect Logic 4 Max Mini" }),
  });

  for (const selector of [
    ".card-identity",
    ".activity-score",
    ".commit-age",
    ".community",
    ".repository-size",
    ".card-title",
    ".card-summary-tooltip",
    ".license",
  ]) {
    await expect(repositoryCard.locator(selector)).toHaveAttribute(
      "aria-describedby",
      /.+/,
    );
  }
  expect(await repositoryCard.locator(".chip").count()).toBeGreaterThan(0);
  for (const chip of await repositoryCard.locator(".chip").all()) {
    await expect(chip).toHaveAttribute("aria-describedby", /.+/);
  }
  expect(
    Number.parseInt(
      await repositoryCard
        .locator(".commit-age")
        .evaluate((element) => getComputedStyle(element).fontWeight),
      10,
    ),
  ).toBeGreaterThanOrEqual(700);

  for (const selector of [
    ".preset-version",
    ".preset-publication",
    ".preset-size",
  ]) {
    await expect(presetCard.locator(selector)).toHaveAttribute(
      "aria-describedby",
      /.+/,
    );
  }

  await repositoryCard.locator(".activity-score").hover();
  await expect(repositoryCard).toHaveCSS("overflow", "visible");
  await expect(
    repositoryCard.getByRole("tooltip", {
      name: /six bars show two-week commit totals/i,
    }),
  ).toBeVisible();
  await repositoryCard.locator(".commit-age").hover();
  await expect(
    repositoryCard.getByRole("tooltip", {
      name: /last meaningful commit/i,
    }),
  ).toBeVisible();
  await repositoryCard.locator(".chip").first().hover();
  await expect(
    repositoryCard.getByRole("tooltip", {
      name: /works with the sillytavern roleplay frontend/i,
    }),
  ).toBeVisible();
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

test("matches the approved tablet and mobile breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 900 });
  await page.reload();
  const tablet = await page.evaluate(() => {
    const filters = document.querySelector<HTMLElement>(".filter-panel");
    const main = document.querySelector<HTMLElement>(".catalog-main");
    const grid = document.querySelector<HTMLElement>(".project-grid");
    if (!filters || !main || !grid) throw new Error("Missing tablet layout");
    return {
      filterWidth: Math.round(filters.getBoundingClientRect().width),
      mainLeft: Math.round(main.getBoundingClientRect().left),
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      topLinkDisplay: getComputedStyle(
        document.querySelector<HTMLElement>(".header-actions .top-link")!,
      ).display,
    };
  });
  expect(tablet).toEqual({
    filterWidth: 210,
    mainLeft: 210,
    columns: 2,
    topLinkDisplay: "none",
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  const mobile = await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>(".catalog-main");
    const trigger = document.querySelector<HTMLElement>(
      ".mobile-category-trigger",
    );
    const controls = document.querySelector<HTMLElement>(".catalog-controls");
    const tabs = document.querySelector<HTMLElement>(".view-tabs");
    const sort = document.querySelector<HTMLElement>(".sort-projects");
    if (!main || !trigger || !controls || !tabs || !sort) {
      throw new Error("Missing mobile layout");
    }
    return {
      mainLeft: Math.round(main.getBoundingClientRect().left),
      mainPaddingLeft: getComputedStyle(main).paddingLeft,
      triggerHeight: Math.round(trigger.getBoundingClientRect().height),
      controlColumns: getComputedStyle(controls).gridTemplateColumns,
      tabsHeight: Math.round(tabs.getBoundingClientRect().height),
      sortHeight: Math.round(sort.getBoundingClientRect().height),
    };
  });
  expect(mobile).toEqual({
    mainLeft: 0,
    mainPaddingLeft: "13px",
    triggerHeight: 42,
    controlColumns: "34px 198px 120px",
    tabsHeight: 36,
    sortHeight: 36,
  });
});
