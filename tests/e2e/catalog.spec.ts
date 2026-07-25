import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const catalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  projects: Array<{
    metadataStatus: string;
    sourceStatus: string;
    license: { status: string };
  }>;
};

const provisionalCount = catalog.projects.filter(
  ({ metadataStatus }) => metadataStatus === "provisional",
).length;
const sourcePendingCount = catalog.projects.filter(
  ({ sourceStatus }) => sourceStatus === "pending",
).length;
const pendingLicenseCount = catalog.projects.filter(
  ({ license }) => license.status === "pending",
).length;
const missingLicenseCount = catalog.projects.filter(
  ({ license }) => license.status === "missing",
).length;

test.beforeEach(async ({ page }) => {
  await page.goto(sitePath());
});

async function expectTooltipInsideViewport(
  page: import("@playwright/test").Page,
  trigger: import("@playwright/test").Locator,
) {
  await trigger.hover();
  const id = await trigger.getAttribute("aria-describedby");
  if (!id) throw new Error("Missing tooltip id");
  const tooltip = page.locator(`#${id}`);
  await expect(tooltip).toBeVisible();
  expect(
    await tooltip.evaluate(
      (element) => element.parentElement === document.body,
    ),
  ).toBe(true);
  const box = await tooltip.boundingBox();
  if (!box) throw new Error("Missing tooltip bounds");
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("Missing viewport");
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.y).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width - 8);
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height - 8);
}

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
    tracks: 10,
    activeBorder: "1px",
    afterContent: "none",
    justifyContent: "center",
    textAlign: "center",
  });

  await expect(page.locator(".category-navigation button")).toHaveCount(10);
  expect(
    await page
      .locator(".category-navigation button")
      .evaluateAll((buttons) =>
        buttons.map((button) => button.textContent?.trim()),
      ),
  ).toEqual([
    "All Projects",
    "Frontends",
    "System Presets",
    "Memory & Retrieval",
    "Generation & Reasoning",
    "Character & Worldbuilding",
    "RPG Systems & Suites",
    "Interface & Workflow",
    "Developer Infrastructure",
    "Uncategorized",
  ]);
});

test("uses the approved desktop workspace and matched toolbar controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const metrics = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>(".catalog-layout");
    const filters = document.querySelector<HTMLElement>(".filter-panel");
    const main = document.querySelector<HTMLElement>(".catalog-main");
    const toolbar = document.querySelector<HTMLElement>(".catalog-toolbar");
    const sort = document.querySelector<HTMLElement>(".sort-projects");
    if (!layout || !filters || !main || !toolbar || !sort) {
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
      sortHeight: Math.round(sort.getBoundingClientRect().height),
      filterRadius: getComputedStyle(filters).borderRadius,
      controlOrder: Array.from(
        toolbar.querySelectorAll("h1, .density-toggle, .sort-projects"),
      ).map((element) =>
        element.matches("h1")
          ? "count"
          : element.classList.contains("density-toggle")
            ? "density"
            : "sort",
      ),
    };
  });

  expect(metrics).toEqual({
    layoutLeft: 0,
    layoutWidth: 1440,
    filterWidth: 238,
    mainLeft: 238,
    sortHeight: 36,
    filterRadius: "0px",
    controlOrder: ["count", "density", "sort"],
  });
  await expect(page.locator(".view-tabs")).toHaveCount(0);
  const logo = page.locator(".brand-logo");
  await expect(logo).toHaveCSS("width", "52px");
  await expect(logo).toHaveCSS("height", "47px");
  await expect(logo).toHaveCSS("transform", "none");
});

test("uses one focus boundary for the main search", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search projects" });

  await search.focus();

  await expect(search).toHaveCSS("appearance", "none");
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(search).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".site-search")).toHaveCSS(
    "border-top-color",
    "rgb(87, 197, 163)",
  );
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
  ).toHaveCount(0);
  const frontendSearch = await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .boundingBox();
  expect(frontendSearch?.width).toBeGreaterThan(100);
  expect(frontendSearch?.height).toBe(32);
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

test("collapses capabilities to four rows and keeps selections visible", async ({
  page,
}) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Capabilities & characteristics",
  });
  const options = group.locator(".metadata-options");
  const disclosure = group.getByRole("button", { name: "Show more" });

  await expect(disclosure).toBeVisible();
  expect(
    await options.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);

  await disclosure.click();
  const selected = group.locator(".metadata-option").last();
  await selected.click();
  await expect(selected.getByRole("checkbox")).toBeChecked();
  await group.getByRole("button", { name: "Show fewer" }).click();

  expect(
    await selected.evaluate(
      (element) =>
        element.getBoundingClientRect().bottom <=
        element.parentElement!.getBoundingClientRect().bottom + 1,
    ),
  ).toBe(true);
});

test("keeps canonical frontends ordered and expands the remainder", async ({
  page,
}) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const labels = await group.locator("label").allTextContents();
  expect(
    labels.slice(0, 3).map((label) => label.replace(/\d+$/, "").trim()),
  ).toEqual(["SillyTavern", "Lumiverse", "Marinara Engine"]);
  await expect(group.getByLabel("Lumiverse")).toBeVisible();
  await expect(group.getByLabel("Lumiverse").locator("..")).toContainText("26");
  await expect(group.getByLabel("Sonder Engine")).toBeHidden();
  await group.getByRole("button", { name: "Show 1 more" }).click();
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
  await expect(group.getByRole("button", { name: "Show fewer" })).toBeVisible();
});

test("search and selected extras bypass frontend collapse", async ({
  page,
}) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const search = group.getByRole("searchbox");
  await search.fill("Sonder");
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
  await group.getByLabel("Sonder Engine").check();
  await search.fill("");
  await expect(group.getByLabel("Sonder Engine")).toBeVisible();
});

test("themes project-kind checkbox outlines", async ({ page }) => {
  const expected = {
    Frontend: "rgb(214, 40, 57)",
    Extension: "rgb(225, 138, 36)",
    "System Preset": "rgb(87, 197, 163)",
  };
  for (const [name, color] of Object.entries(expected)) {
    const input = page
      .locator(".filter-panel")
      .getByLabel(name, { exact: true });
    await expect(input).toHaveCSS("border-top-color", color);
    await input.check();
    await expect(input).toHaveCSS("background-color", color);
  }
});

test("searches, changes density, and accepts legacy view URLs", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "214 projects" }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(214);
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Recursion");
  await expect(page.getByRole("heading", { name: "1 project" })).toBeVisible();
  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(page.locator("body")).toHaveClass(/compact-cards/);
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${sitePath()}?view=new&search=Recursion`);
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
  await expect(
    page.getByRole("heading", { name: "214 projects" }),
  ).toBeVisible();
});

test("supports every sort and restores query state after reload", async ({
  page,
}) => {
  const sort = page.getByRole("combobox", { name: "Sort projects" });
  for (const value of ["recent", "sustained", "popularity", "alphabetical"]) {
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

test("shows the full launch catalog without default-query hidden records", async ({
  page,
}) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".project-card")).toHaveCount(214);
  await expect(page.locator('.project-card[href^="https://"]')).toHaveCount(
    214,
  );
  await expect(
    page.locator(".project-card").filter({ hasText: "Provisional details" }),
  ).toHaveCount(provisionalCount);
  await expect(
    page.locator(".project-card").filter({ hasText: "Source pending" }),
  ).toHaveCount(sourcePendingCount);
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

test("supports uncategorized, pending-license, and missing-license catalog filters at full scale", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Uncategorized", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "209 projects" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/category=uncategorized/);

  await page.getByLabel("Pending verification", { exact: true }).check();
  await expect(
    page.getByRole("heading", { name: `${pendingLicenseCount} projects` }),
  ).toBeVisible();
  await expect(page).toHaveURL(/license=pending/);
  await expect(
    page.locator(".project-card").filter({ hasText: "Pending" }),
  ).toHaveCount(pendingLicenseCount);

  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await page
    .getByRole("button", { name: "Remove Pending verification" })
    .click();
  await expect(
    page.getByRole("heading", { name: "214 projects" }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/license=/);

  await page.getByLabel("Missing license", { exact: true }).check();
  await expect(
    page.getByRole("heading", { name: `${missingLicenseCount} projects` }),
  ).toBeVisible();
  await expect(page).toHaveURL(/license=missing/);
});

test("matches the approved card anatomy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const card = page.locator(".project-card").first();

  await expect(page.locator(".project-card")).toHaveCount(214);
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
    ".license",
  ]) {
    await expect(repositoryCard.locator(selector)).toHaveAttribute(
      "aria-describedby",
      /.+/,
    );
  }
  const cardDescriptionId =
    await repositoryCard.getAttribute("aria-describedby");
  expect(cardDescriptionId).toBeTruthy();
  await expect(page.locator(`#${cardDescriptionId}`)).toContainText(
    /Community score:/,
  );
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
  await expect(repositoryCard).toHaveCSS("overflow", "hidden");
  await expect(
    page.getByRole("tooltip", {
      name: /^Approximate activity in \d+ of the last 12 weeks; baseline pending$/,
    }),
  ).toBeVisible();
  await repositoryCard.locator(".card-identity").hover();
  await expect(
    page.getByRole("tooltip", {
      name: "Generation & Reasoning Extension",
    }),
  ).toBeVisible();
  await repositoryCard.locator(".commit-age").hover();
  await expect(
    page.getByRole("tooltip", {
      name: /^Last source activity .+ \(.+\)$/,
    }),
  ).toBeVisible();
  await expect(repositoryCard.locator(".card-summary-tooltip")).toHaveCount(0);
  await repositoryCard.locator(".card-title").hover();
  await expect(
    page.getByRole("tooltip", {
      name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tooltip", { name: "Open Recursion" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("tooltip", {
      name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
    }),
  ).toBeHidden();
  await page.mouse.move(0, 0);
  await repositoryCard.focus();
  await expect(
    page.getByRole("tooltip", {
      name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
    }),
  ).toBeVisible();
  await repositoryCard.locator(".chip").first().hover();
  await expect(
    page.getByRole("tooltip", {
      name: /works with the sillytavern roleplay frontend/i,
    }),
  ).toBeVisible();
});

test("substantially reduces cards in compact mode", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const repositoryCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion", exact: true }),
  });
  const presetCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Purrfect Logic 4 Max Mini" }),
  });
  const standardHeight = (await repositoryCard.boundingBox())!.height;

  await page.getByRole("button", { name: "Use compact cards" }).click();

  const summary = repositoryCard.locator(".card-summary");
  await expect(summary).toBeVisible();
  await expect(summary).toHaveText(
    "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
  );
  await expect(summary).toHaveCSS("white-space", "nowrap");
  await expect(summary).toHaveCSS("text-overflow", "ellipsis");
  await expect(summary).toHaveCSS("overflow", "hidden");
  await expect(summary).toHaveCSS("color", "rgb(203, 214, 211)");
  await expect(repositoryCard.locator(".card-state-list")).toBeHidden();
  await expect(repositoryCard.locator(".community")).toBeHidden();
  await expect(repositoryCard.locator(".repository-size")).toBeHidden();
  await expect(repositoryCard.locator(".card-chips")).toBeHidden();
  await expect(repositoryCard.locator(".license")).toBeHidden();
  await expect(repositoryCard.locator(".activity-score")).toBeVisible();
  await expect(repositoryCard.locator(".commit-age")).toBeVisible();
  await expect(repositoryCard.locator(".card-identity")).toBeVisible();
  await expect(repositoryCard.locator(".card-title")).toBeVisible();
  await expect(presetCard.locator(".preset-size")).toBeHidden();
  await expect(repositoryCard.locator(".card-title")).toHaveCSS(
    "white-space",
    "nowrap",
  );
  await expect(repositoryCard.locator(".card-title")).toHaveCSS(
    "text-overflow",
    "ellipsis",
  );
  await expect(repositoryCard.locator(".card-title")).toHaveCSS(
    "overflow",
    "hidden",
  );
  const compactHeight = (await repositoryCard.boundingBox())!.height;
  expect(compactHeight).toBeLessThan(standardHeight * 0.5);
  await repositoryCard.locator(".card-title").hover();
  await expect(
    page.getByRole("tooltip", {
      name: "Adds structured planning and review stages to SillyTavern generation, with model routing for specialized reasoning lanes.",
    }),
  ).toBeVisible();
});

test("keeps tile tooltips inside the viewport portal", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const sillyTavern = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "SillyTavern", exact: true }),
  });
  const preset = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Purrfect Logic 4 Max Mini" }),
  });
  const recursion = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion", exact: true }),
  });
  const triggers = [
    page.locator(".project-card").first().locator(".card-identity"),
    sillyTavern.locator(".community"),
    recursion.locator(".repository-size"),
    preset.locator(".license"),
  ];

  for (const trigger of triggers) {
    await expectTooltipInsideViewport(page, trigger);
  }

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("dismisses tile tooltips with Escape and on mobile transition", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const trigger = page
    .locator(".project-card")
    .first()
    .locator(".card-identity");

  await trigger.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.mouse.move(0, 0);
  await trigger.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("keeps repository activity facts visible on mobile cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();

  const card = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion" }),
  });
  await expect(card.locator(".community")).toBeVisible();
  await expect(card.locator(".repository-size")).toBeVisible();
  await expect(card.locator(".activity-weeks")).toBeVisible();
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
    const controls = document.querySelector<HTMLElement>(
      ".catalog-primary-controls",
    );
    const sort = document.querySelector<HTMLElement>(".sort-projects");
    if (!main || !trigger || !controls || !sort) {
      throw new Error("Missing mobile layout");
    }
    return {
      mainLeft: Math.round(main.getBoundingClientRect().left),
      mainPaddingLeft: getComputedStyle(main).paddingLeft,
      triggerHeight: Math.round(trigger.getBoundingClientRect().height),
      controlDisplay: getComputedStyle(controls).display,
      sortHeight: Math.round(sort.getBoundingClientRect().height),
    };
  });
  expect(mobile).toEqual({
    mainLeft: 0,
    mainPaddingLeft: "13px",
    triggerHeight: 42,
    controlDisplay: "flex",
    sortHeight: 36,
  });
  await expect(page.locator(".view-tabs")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open filters" }),
  ).toBeVisible();
  expect(
    await page
      .locator(".catalog-toolbar")
      .evaluate((element) => element.scrollWidth - element.clientWidth),
  ).toBeLessThanOrEqual(0);
});
