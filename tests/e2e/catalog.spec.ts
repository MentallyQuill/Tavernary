import { expect, test } from "@playwright/test";

import {
  collapsedFrontendOptions,
  frontendExpansionLabel,
  frontendOptions,
  generatedCatalog as catalog,
  generatedKitCount,
  generatedProjectCount,
  generatedProjectSearchCount,
  initiallyVisibleFrontendOptions,
  kitCountLabel,
  metadataFilterChipCount,
  projectCountLabel,
  tagOptionsByFacet,
  tagSearchFixture,
} from "../helpers/generated-catalog";
import { sitePath } from "../helpers/site-path";

const claudePresetCount = catalog.projects.filter(
  ({ kind, preset }) =>
    kind === "preset" &&
    (preset?.modelFamilies.some(({ id }) => id === "claude") ?? false),
).length;
const recursionSearchCount = generatedProjectSearchCount("recursion");
const newViewCount = catalog.projects.filter(
  ({ catalogedAt, catalogCohort }) => {
    const age =
      new Date(catalog.generatedAt).getTime() - new Date(catalogedAt).getTime();
    return (
      catalogCohort === "standard" &&
      Number.isFinite(age) &&
      age >= 0 &&
      age <= 30 * 24 * 60 * 60 * 1000
    );
  },
).length;
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
const forkRelationshipChild =
  catalog.projects.find(({ id }) => id === "kritblade-vectfox") ??
  catalog.projects.find(
    ({ fork }) => fork?.status === "published" && fork.parentProjectId,
  );
const forkRelationshipParent = forkRelationshipChild?.fork?.parentProjectId
  ? catalog.projects.find(
      ({ id }) => id === forkRelationshipChild.fork?.parentProjectId,
    )
  : null;
const delistedForkChild =
  catalog.projects.find(
    ({ id, fork }) =>
      id === "aikohanasaki-sillytavern-worldinfolocks" &&
      fork?.status === "not-listed",
  ) ??
  catalog.projects.find(
    ({ fork }) =>
      fork?.status === "not-listed" && fork.parentProjectId === null,
  );
const freakySearchProject = catalog.projects.find(
  ({ id }) => id === "reddit-1v9u18m",
);
if (!freakySearchProject) {
  throw new Error("Missing reddit-1v9u18m search relevance fixture");
}
const pendingScanProject = catalog.projects.find(
  ({ tavernKeeper }) => tavernKeeper?.state === "gray",
);
const unsupportedScanProject = catalog.projects.find(
  ({ tavernKeeper }) => tavernKeeper?.state === "unsupported",
);
const hasScanFixture = process.env.TAVERNARY_SCAN_FIXTURE === "true";
const freakySearchProjectName = displayedProjectName(freakySearchProject.name);

function displayedProjectName(name: string) {
  const withoutPrefix = name.replace(/^sillytavern[\s_-]+/i, "");
  return withoutPrefix || name;
}

test.beforeEach(async ({ page }) => {
  await page.goto(sitePath());
  await expect(page.locator(".catalog-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 15_000 },
  );
});

test("keeps summaries clamped at standard and compact card widths", async ({
  page,
}) => {
  const expectedSummary =
    "Fixture coordinates persistent memories for SillyTavern conversations. It reviews recent context, selects useful details, and supplies focused guidance that keeps characters and unfolding scenes consistent over time.";
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const summary = page.locator(".project-card .card-summary").first();
    await summary.evaluate((element, text) => {
      element.textContent = text;
    }, expectedSummary);
    await expect(summary).toHaveText(expectedSummary);
    await expect(summary).toHaveCSS("-webkit-line-clamp", "4");
    await expect(summary).toHaveCSS("overflow", "hidden");
    const dimensions = await summary.evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
    expect(dimensions.scrollHeight).toBeLessThanOrEqual(
      dimensions.clientHeight,
    );
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Use compact cards" }).click();
  const compactSummary = page.locator(".project-card .card-summary").first();
  await compactSummary.evaluate((element, text) => {
    element.textContent = text;
  }, expectedSummary);
  await expect(compactSummary).toHaveText(expectedSummary);
  await expect(compactSummary).toHaveCSS("white-space", "nowrap");
  await expect(compactSummary).toHaveCSS("text-overflow", "ellipsis");
  await expect(compactSummary).toHaveCSS("overflow", "hidden");
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
    "Kits",
    "All Projects",
    "Frontends",
    "System Presets",
    "Memory & Retrieval",
    "Generation & Reasoning",
    "Character & Worldbuilding",
    "RPG Systems & Suites",
    "Interface & Workflow",
    "Developer Infrastructure",
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
  await expect(logo).toHaveCSS("height", "52px");
  await expect(logo).toHaveCSS("transform", "none");
});

test("lets desktop Filters end in page flow while Kit Builder stays sticky", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const filters = page.locator(".filter-panel");
  await filters
    .getByRole("group", { name: "Project kind" })
    .getByLabel("Frontend", { exact: true })
    .check();
  await filters
    .getByRole("group", { name: "Completion format" })
    .getByText("Chat Completion", { exact: true })
    .click();
  await expect(page.locator(".project-card")).toHaveCount(0);

  const selectedState = await filters.evaluate((element) => {
    const footer = element.querySelector<HTMLElement>(".filter-legal");
    if (!footer) throw new Error("Missing Filters legal footer");
    const panelBounds = element.getBoundingClientRect();
    return {
      alignSelf: getComputedStyle(element).alignSelf,
      overflowY: getComputedStyle(element).overflowY,
      panelBottom: panelBounds.bottom,
      footerBottom: footer.getBoundingClientRect().bottom,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(selectedState.alignSelf).toBe("start");
  expect(selectedState.overflowY).toBe("visible");
  expect(selectedState.footerBottom).toBeLessThanOrEqual(
    selectedState.panelBottom + 1,
  );
  expect(selectedState.scrollHeight).toBeLessThanOrEqual(
    selectedState.clientHeight + 1,
  );

  await filters.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".project-card").first()).toBeVisible();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  const scrolledState = await page.evaluate(() => {
    const filterPanel = document.querySelector<HTMLElement>(".filter-panel");
    const kitBuilder =
      document.querySelector<HTMLElement>(".kit-builder-panel");
    if (!filterPanel || !kitBuilder) throw new Error("Missing desktop sidebar");
    return {
      filterBottom: filterPanel.getBoundingClientRect().bottom,
      kitPosition: getComputedStyle(kitBuilder).position,
    };
  });
  expect(scrolledState.filterBottom).toBeLessThan(0);
  expect(scrolledState.kitPosition).toBe("sticky");
});

test("uses one focus boundary for the main search", async ({ page }) => {
  const search = page.getByRole("searchbox", { name: "Search projects" });

  await expect(search).toHaveAttribute(
    "placeholder",
    "Search projects or creators…",
  );
  await search.focus();

  await expect(search).toHaveCSS("appearance", "none");
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(search).toHaveCSS("box-shadow", "none");
  await expect(page.locator(".site-search")).toHaveCSS(
    "border-top-color",
    "rgb(45, 212, 191)",
  );

  const shortcut = page.locator(".site-search > kbd");
  const help = page.getByRole("button", { name: "Search help" });
  const helpIcon = help.locator('[data-icon="search-help"]');
  await expect(shortcut).toBeVisible();
  await expect(help).toBeVisible();
  await expect(helpIcon).toBeVisible();
  const searchBox = await page.locator(".site-search").boundingBox();
  const shortcutBox = await shortcut.boundingBox();
  const helpBox = await help.boundingBox();
  const helpIconBox = await helpIcon.boundingBox();
  expect(searchBox).not.toBeNull();
  expect(shortcutBox).not.toBeNull();
  expect(helpBox).not.toBeNull();
  expect(helpIconBox).not.toBeNull();
  expect(helpBox!.width).toBeCloseTo(24, 0);
  expect(helpBox!.height).toBeCloseTo(24, 0);
  expect(
    helpBox!.x - (shortcutBox!.x + shortcutBox!.width),
  ).toBeLessThanOrEqual(6);
  expect(
    searchBox!.x + searchBox!.width - (helpBox!.x + helpBox!.width),
  ).toBeLessThanOrEqual(10);
  expect(
    Math.abs(
      helpBox!.x +
        helpBox!.width / 2 -
        (helpIconBox!.x + helpIconBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(0.5);
  expect(
    Math.abs(
      helpBox!.y +
        helpBox!.height / 2 -
        (helpIconBox!.y + helpIconBox!.height / 2),
    ),
  ).toBeLessThanOrEqual(0.5);

  await help.click();
  await expect(
    page.getByRole("dialog", { name: "Search basics" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(help).toBeFocused();
  await page.keyboard.press("/");
  await expect(search).toBeFocused();
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
      name: "Search goals and traits",
    }),
  ).toBeVisible();
  const frontendSearch = await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .boundingBox();
  expect(frontendSearch?.width).toBeGreaterThan(100);
  expect(frontendSearch?.height).toBe(32);
  await expect(page.getByText("Project kind", { exact: true })).toBeVisible();
  await expect(page.getByText("Goals & traits", { exact: true })).toBeVisible();
  await expect(page.locator(".metadata-options").first()).toHaveCSS(
    "display",
    "flex",
  );
  await expect(page.getByText("Model family", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Completion format", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".metadata-options .filter-choice-chip"),
  ).toHaveCount(metadataFilterChipCount);

  await page
    .getByRole("searchbox", { name: "Search compatible frontends" })
    .fill("Marinara");
  const frontendFilters = page.locator(".filter-panel");
  await expect(frontendFilters.getByLabel("Marinara Engine")).toBeVisible();
  await expect(
    frontendFilters.getByLabel("SillyTavern", { exact: true }),
  ).toBeHidden();
});

test("filters Presets and Kits by model family with shareable state", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "System Presets", exact: true })
    .click();
  const presetModelGroup = page
    .locator(".filter-panel")
    .getByRole("group", { name: "Model family" });
  await presetModelGroup.getByText("Claude", { exact: true }).click();
  await expect(
    presetModelGroup.getByLabel("Claude", { exact: true }),
  ).toBeChecked();
  await expect(
    presetModelGroup
      .getByLabel("Claude", { exact: true })
      .locator("xpath=ancestor::label"),
  ).toContainText(`Claude${claudePresetCount}`);

  await expect(
    page.getByRole("heading", { name: projectCountLabel(claudePresetCount) }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wandlight", exact: true }),
  ).toBeVisible();
  const wandlightCard = page.getByRole("link", {
    name: "Wandlight",
    exact: true,
  });
  const wandlightProjectCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Wandlight", exact: true }),
  });
  for (const label of ["Model-Agnostic", "Claude", "GPT", "GLM", "DeepSeek"]) {
    await expect(
      wandlightProjectCard.getByText(label, { exact: true }),
    ).toBeVisible();
  }
  await expect(wandlightCard).toHaveAccessibleDescription(
    /Supported model families: Model-Agnostic, Claude, GPT, GLM, DeepSeek\./u,
  );
  await expect(page).toHaveURL(/model=claude/u);

  await page.reload();
  await expect(
    page.getByRole("heading", { name: projectCountLabel(claudePresetCount) }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Kits", exact: true }).click();
  const kitModelGroup = page
    .locator(".filter-panel")
    .getByRole("group", { name: "Model family" });
  await kitModelGroup.getByText("Claude", { exact: true }).click();
  await expect(
    kitModelGroup.getByLabel("Claude", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("heading", { name: "Ultimate Harry Potter", exact: true }),
  ).toBeVisible();
});

test("ranks and progressively discloses goals and traits", async ({ page }) => {
  if (!tagSearchFixture) throw new Error("Missing tag search fixture");

  const browser = page.locator(".filter-panel .filter-tag-browser");
  const search = browser.getByRole("searchbox", {
    name: "Search goals and traits",
  });

  const initialCounts = { goal: 0, trait: 0 };
  for (const facet of ["goal", "trait"] as const) {
    const group = browser.getByRole("group", {
      name: facet === "goal" ? "Goals" : "Traits",
    });
    const visibleLabels = await group
      .getByRole("checkbox")
      .evaluateAll((inputs) =>
        inputs.map((input) => input.getAttribute("aria-label")),
      );
    initialCounts[facet] = visibleLabels.length;
    expect(visibleLabels).toEqual(
      tagOptionsByFacet[facet]
        .slice(0, visibleLabels.length)
        .map(({ label }) => label),
    );
    const hiddenCount = tagOptionsByFacet[facet].length - visibleLabels.length;
    if (hiddenCount > 0) {
      await expect(
        group.getByRole("button", {
          name: `Show ${hiddenCount} more`,
        }),
      ).toBeVisible();
    }
  }

  const goals = browser.getByRole("group", { name: "Goals" });
  const traits = browser.getByRole("group", { name: "Traits" });
  const goalsHidden = tagOptionsByFacet.goal.length - initialCounts.goal;
  await goals.getByRole("button", { name: `Show ${goalsHidden} more` }).click();
  await expect(goals.getByRole("checkbox")).toHaveCount(
    tagOptionsByFacet.goal.length,
  );
  await expect(goals.getByRole("button", { name: "Show fewer" })).toBeVisible();
  await expect(traits.getByRole("checkbox")).toHaveCount(initialCounts.trait);

  await search.fill(
    tagSearchFixture.aliases[0] ?? tagSearchFixture.description,
  );
  const selected = browser.getByLabel(tagSearchFixture.label, { exact: true });
  await expect(selected).toBeVisible();
  await selected.locator("xpath=ancestor::label").click();
  await expect(selected).toBeChecked();
  await expect(page).toHaveURL(new RegExp(`tag=${tagSearchFixture.id}`, "u"));

  await search.fill("no tag matches this deliberate query");
  await expect(selected).toHaveCount(0);
  await expect(
    browser.getByRole("button", {
      name: `Remove ${tagSearchFixture.label}`,
    }),
  ).toBeVisible();

  await browser
    .getByRole("button", {
      name: `Remove ${tagSearchFixture.label}`,
    })
    .click();
  await expect(
    browser.getByText("No matching goals or traits.", { exact: true }),
  ).toBeVisible();
  await expect(browser.locator(".tag-results-bounded")).toHaveCount(0);
  await expect(browser.locator(".tag-browser-facets")).toHaveCSS(
    "overflow-y",
    "visible",
  );
});

test("uses subtle selection and contained keyboard focus for filter chips", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "System Presets", exact: true })
    .click();
  const presetModelGroup = page
    .locator(".filter-panel")
    .getByRole("group", { name: "Model family" });
  const glm = presetModelGroup.getByLabel("GLM", { exact: true });
  const glmChoice = glm.locator("xpath=ancestor::label");
  await glmChoice.click();
  const glmChip = glmChoice.locator(".filter-choice-chip");

  expect(await glm.evaluate((input) => input.matches(":focus-visible"))).toBe(
    false,
  );
  await expect(glmChip).toHaveCSS("background-color", "rgb(21, 59, 57)");
  await expect(glmChip).toHaveCSS("border-top-width", "1px");

  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  expect(await glm.evaluate((input) => input.matches(":focus-visible"))).toBe(
    true,
  );
  expect(
    await glmChip.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toContain("inset");

  const bounds = await glmChip.evaluate((element) => {
    const chip = element.getBoundingClientRect();
    const options = element
      .closest(".metadata-options")!
      .getBoundingClientRect();
    return {
      left: chip.left >= options.left,
      top: chip.top >= options.top,
      right: chip.right <= options.right,
      bottom: chip.bottom <= options.bottom,
    };
  });
  expect(bounds).toEqual({
    left: true,
    top: true,
    right: true,
    bottom: true,
  });
});

test("keeps canonical frontends ordered and expands the remainder", async ({
  page,
}) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const labels = await group.locator("label").allTextContents();
  expect(labels.map((label) => label.replace(/\d+$/, "").trim())).toEqual(
    initiallyVisibleFrontendOptions.map(({ label }) => label),
  );
  for (const { label, count } of initiallyVisibleFrontendOptions) {
    const option = group.getByLabel(label, { exact: true });
    await expect(option).toBeVisible();
    await expect(option.locator("..")).toContainText(String(count));
  }
  for (const { label } of collapsedFrontendOptions) {
    await expect(group.getByLabel(label, { exact: true })).toBeHidden();
  }
  await group.getByRole("button", { name: frontendExpansionLabel }).click();
  expect(
    (await group.locator("label").allTextContents()).map((label) =>
      label.replace(/\d+$/, "").trim(),
    ),
  ).toEqual(frontendOptions.map(({ label }) => label));
  for (const { label, count } of collapsedFrontendOptions) {
    const option = group.getByLabel(label, { exact: true });
    await expect(option).toBeVisible();
    await expect(option.locator("..")).toContainText(String(count));
  }
  await expect(group.getByRole("button", { name: "Show fewer" })).toBeVisible();
});

test("search and selected extras bypass frontend collapse", async ({
  page,
}) => {
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const selectedExtra = collapsedFrontendOptions.at(-1);
  if (!selectedExtra) throw new Error("Missing collapsed frontend fixture");
  const search = group.getByRole("searchbox");
  await search.fill(selectedExtra.label);
  await expect(
    group.getByLabel(selectedExtra.label, { exact: true }),
  ).toBeVisible();
  await group.getByLabel(selectedExtra.label, { exact: true }).check();
  await search.fill("");
  await expect(
    group.getByLabel(selectedExtra.label, { exact: true }),
  ).toBeVisible();
});

test("uses neutral kind-checkbox outlines and teal checked fills", async ({
  page,
}) => {
  for (const name of ["Frontend", "Extension", "System Preset"]) {
    const input = page
      .locator(".filter-panel")
      .getByLabel(name, { exact: true });
    await expect(input).toHaveCSS("border-top-color", "rgb(80, 97, 104)");
    await input.check();
    await expect(input).toHaveCSS("background-color", "rgb(45, 212, 191)");
  }
});

test("searches, changes density, and accepts legacy view URLs", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", {
      name: `${generatedProjectCount} projects`,
    }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Recursion");
  await expect(
    page.getByRole("heading", {
      name: projectCountLabel(recursionSearchCount),
    }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("preset freaky");
  await expect(
    page.getByRole("heading", {
      name: freakySearchProjectName,
      exact: true,
    }),
  ).toBeVisible();
  const freakyCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", {
      name: freakySearchProjectName,
      exact: true,
    }),
  });
  await expect(freakyCard.locator(".search-match-evidence")).toHaveText(
    /^Matched source:/u,
  );
  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(page.locator("body")).toHaveClass(/compact-cards/);
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toHaveCount(0);
  await page.goto(`${sitePath()}?view=new&search=Recursion`);
  await expect(
    page.getByRole("heading", { name: projectCountLabel(newViewCount) }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(newViewCount);
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toHaveValue("");
});

test("shares plus OR searches with normal clause behavior", async ({
  page,
}) => {
  const search = page.getByRole("searchbox", { name: "Search projects" });

  await search.fill("vectfox+summaryception");

  await expect(
    page.getByRole("heading", { name: "VectFox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Summaryception",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/q=vectfox%2Bsummaryception/iu);

  await page.reload();

  await expect(search).toHaveValue("vectfox+summaryception");
  await expect(
    page.getByRole("heading", { name: "VectFox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Summaryception",
      exact: true,
    }),
  ).toBeVisible();

  await search.fill("Stab's Directives+Directive");

  await expect(
    page.getByRole("heading", {
      name: "Stab's Directives",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Directive", exact: true }),
  ).toBeVisible();

  await search.fill("Stab's Directives+vectfox");

  await expect(
    page.getByRole("heading", {
      name: "Stab's Directives",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "VectFox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Directive", exact: true }),
  ).toHaveCount(0);
});

test("searches Kits by noncontiguous structured fields", async ({ page }) => {
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: kitCountLabel(generatedKitCount) }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("aiko loadout");

  await expect(
    page.getByRole("heading", { name: kitCountLabel(1) }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Aiko's Loadout", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".kit-card")).toHaveCount(1);
  const kitSort = page.getByRole("combobox", { name: "Sort Kits" });
  await expect(kitSort).toHaveValue("relevance");
  await kitSort.selectOption("newest");
  await search.fill("aiko loadout memorybooks");
  await expect(kitSort).toHaveValue("relevance");

  await search.fill("");
  await expect(kitSort).toHaveValue("trending");
  await expect(kitSort.getByRole("option", { name: "Relevance" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("heading", { name: kitCountLabel(generatedKitCount) }),
  ).toBeVisible();
  await expect(page.locator(".kit-card")).toHaveCount(generatedKitCount);
});

test("searches by repository owner and discloses creator attribution", async ({
  page,
}) => {
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("MentallyQuill");

  const directive = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Directive", exact: true }),
  });
  const attribution = directive.locator(".card-attribution");
  await expect(directive).toBeVisible();
  await expect(attribution).toHaveText("by MentallyQuill");
  await expect(directive.locator(".search-match-evidence")).toHaveText(
    "Matched maintainer: MentallyQuill",
  );

  await attribution.hover();
  await expect(
    page.getByRole("tooltip", {
      name: "Owner: MentallyQuill",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(attribution).toBeHidden();
});

test("explains filtered search matches, corrections, and settled result counts", async ({
  page,
}) => {
  const search = page.getByRole("searchbox", { name: "Search projects" });
  const status = page.locator('.catalog-main > [role="status"]');
  await search.pressSequentially("preset freaky");
  await expect(status).toHaveText(/\d+ projects? shown/u);

  await page.getByRole("button", { name: "Frontends", exact: true }).click();
  await expect(
    page.getByText(/search matches? (?:is|are) hidden by filters/u),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(search).toHaveValue("preset freaky");
  await expect(
    page.getByRole("heading", {
      name: freakySearchProjectName,
      exact: true,
    }),
  ).toBeVisible();

  await search.fill("frankenstien");
  const correction = page.getByRole("button", {
    name: "Search for frankenstein",
  });
  await expect(correction).toBeVisible();
  await expect(search).toHaveValue("frankenstien");
  await correction.click();
  await expect(search).toHaveValue("frankenstein");
  await expect(page).toHaveURL(/q=frankenstein/u);
});

test("supports keyboard focus, composed filters, chip removal, and clear all", async ({
  page,
}) => {
  await page.keyboard.press("/");
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toBeFocused();
  await page.getByLabel("Extension", { exact: true }).check();
  const frontendGroup = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const selectedFrontend = collapsedFrontendOptions[0];
  if (!selectedFrontend) throw new Error("Missing collapsed frontend fixture");
  await frontendGroup
    .getByRole("button", { name: frontendExpansionLabel })
    .click();
  await frontendGroup
    .getByLabel(selectedFrontend.label, { exact: true })
    .check();
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
    page.getByRole("heading", {
      name: `${generatedProjectCount} projects`,
    }),
  ).toBeVisible();
});

test("fork relationship preserves filters and keeps parent-first order", async ({
  page,
}) => {
  test.skip(
    !forkRelationshipChild || !forkRelationshipParent,
    "The controlled fork backfill has not been applied.",
  );
  const child = forkRelationshipChild!;
  const parent = forkRelationshipParent!;
  const childName = displayedProjectName(child.name);
  const parentName = displayedProjectName(parent.name);
  const frontend = child.frontends[0];
  if (!frontend) throw new Error("Fork fixture needs a frontend.");

  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill(childName);
  if (collapsedFrontendOptions.some(({ id }) => id === frontend.id)) {
    await page
      .locator(".filter-panel")
      .getByRole("button", { name: frontendExpansionLabel })
      .click();
  }
  await page
    .locator(".filter-panel")
    .getByLabel(frontend.label, { exact: true })
    .check();
  const preservedSearch = page.url();

  await page
    .getByRole("button", {
      name: `View relationship between ${parentName} and ${childName}`,
    })
    .click();

  await expect(page.locator(".project-grid")).toHaveClass(/relationship-pair/);
  await expect(page.locator(".project-card h2")).toHaveText([
    parentName,
    childName,
  ]);
  const relationshipToken = page.getByRole("button", {
    name: `Remove fork relationship between ${parentName} and ${childName}`,
  });
  await expect(relationshipToken).toHaveText(
    `Fork: ${parentName} → ${childName}`,
  );
  await expect(
    page.getByRole("button", { name: `Remove Search: ${childName}` }),
  ).toHaveCount(0);

  await relationshipToken.click();
  await expect(page).toHaveURL(preservedSearch);
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toHaveValue(childName);
  await expect(
    page.locator(".filter-panel").getByLabel(frontend.label, { exact: true }),
  ).toBeChecked();

  await page
    .getByRole("button", {
      name: `View relationship between ${parentName} and ${childName}`,
    })
    .click();
  await page
    .getByLabel("Active filters")
    .getByRole("button", { name: "Clear all" })
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );

  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill(childName);
  await page
    .getByRole("button", {
      name: `View relationship between ${parentName} and ${childName}`,
    })
    .click();
  await page
    .locator(".filter-panel")
    .getByRole("button", {
      name: "Clear all",
    })
    .click();
  await expect(page).toHaveURL(/\/$/);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${sitePath()}?relationship=${child.id}`);
  await expect(page.locator(".project-card h2")).toHaveText([
    parentName,
    childName,
  ]);
});

test("delisted fork parent remains name-only and stale scope normalizes", async ({
  page,
}) => {
  test.skip(
    !delistedForkChild?.fork,
    "The controlled fork backfill has not been applied.",
  );
  const child = delistedForkChild!;
  const parentName = child.fork!.parentName;
  const childName = displayedProjectName(child.name);
  const card = page.locator(".project-card-shell").filter({
    has: page.getByRole("heading", { name: childName, exact: true }),
  });

  await expect(card).toContainText(`Fork of ${parentName}`);
  await expect(card).toContainText("Upstream not listed");
  await expect(
    card.getByRole("button", { name: /View relationship/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: parentName })).toHaveCount(0);

  await page.goto(
    `${sitePath()}?q=${encodeURIComponent(childName)}&relationship=${child.id}`,
  );
  await expect(page).toHaveURL(
    new RegExp(`\\?q=${encodeURIComponent(childName)}$`),
  );
  await expect(page.getByRole("heading", { name: childName })).toBeVisible();
  await expect(page.locator(".relationship-pair")).toHaveCount(0);
});

test("supports every sort and restores query state after reload", async ({
  page,
}) => {
  const sort = page.getByRole("combobox", { name: "Sort projects" });
  await expect(sort.getByRole("option", { name: "Relevance" })).toHaveCount(0);
  for (const value of ["recent", "sustained", "popularity", "alphabetical"]) {
    await sort.selectOption(value);
    await expect(sort).toHaveValue(value);
  }

  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Recursion");
  await expect(sort).toHaveValue("relevance");
  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search projects" }),
  ).toHaveValue("Recursion");
  await expect(
    page.getByRole("heading", {
      name: projectCountLabel(recursionSearchCount),
    }),
  ).toBeVisible();
  await expect(sort).toHaveValue("relevance");
});

test("keeps search sort and order coherent through reload and history", async ({
  page,
}) => {
  const searchUrl = `${sitePath()}?q=preset+freaky`;
  await page.goto(searchUrl);
  const search = page.getByRole("searchbox", { name: "Search projects" });
  const sort = page.getByRole("combobox", { name: "Sort projects" });
  const cardTitles = page.locator(".project-card h2");

  await expect(search).toHaveValue("preset freaky");
  await expect(sort).toHaveValue("relevance");
  await expect(cardTitles.first()).toHaveText(freakySearchProjectName);
  const relevanceOrder = await cardTitles.allTextContents();

  await page.goto(`${searchUrl}&sort=popularity`);
  await expect(sort).toHaveValue("popularity");
  const popularityOrder = await cardTitles.allTextContents();
  await page.reload();
  await expect(search).toHaveValue("preset freaky");
  await expect(sort).toHaveValue("popularity");
  await expect(cardTitles).toHaveText(popularityOrder);

  await search.fill("preset freaky claude");
  await expect(sort).toHaveValue("relevance");
  await expect(page).not.toHaveURL(/sort=/u);
  const editedOrder = await cardTitles.allTextContents();

  await page.goBack();
  await expect(page).toHaveURL(new RegExp("q=preset(?:\\+|%20)freaky$", "u"));
  await expect(search).toHaveValue("preset freaky");
  await expect(sort).toHaveValue("relevance");
  await expect(cardTitles).toHaveText(relevanceOrder);

  await page.goForward();
  await expect(search).toHaveValue("preset freaky claude");
  await expect(sort).toHaveValue("relevance");
  await expect(cardTitles).toHaveText(editedOrder);
});

test("shows the full launch catalog without default-query hidden records", async ({
  page,
}) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );
  await expect(
    page.locator('.project-card .project-card-primary-link[href^="https://"]'),
  ).toHaveCount(generatedProjectCount);
  await expect(
    page.locator(".project-card").filter({ hasText: "Provisional details" }),
  ).toHaveCount(provisionalCount);
  await expect(
    page.locator(".project-card").filter({ hasText: "Source pending" }),
  ).toHaveCount(sourcePendingCount);
});

test(
  "hydrates unscanned and unsupported scan states without nesting card controls",
  { tag: "@tavernkeeper" },
  async ({ page }) => {
    test.skip(
      !hasScanFixture,
      "Requires the dedicated TavernKeeper scan fixture",
    );
    await expect(page.locator(".catalog-shell")).toHaveAttribute(
      "data-hydrated",
      "true",
    );
    if (!pendingScanProject || !unsupportedScanProject) {
      throw new Error("Missing scan-state catalog fixtures");
    }
    const indicator = page
      .getByRole("button", {
        name: "TavernKeeper scan: Not assessed.",
      })
      .first();
    const pendingCard = indicator.locator(
      "xpath=ancestor::div[contains(@class, 'project-card-shell')]",
    );

    await expect(indicator).toBeVisible();
    await expect(indicator).toHaveCSS("color", "rgb(130, 144, 153)");
    await indicator.click();
    const panel = page.getByRole("dialog", {
      name: "TavernKeeper Scan Results",
    });
    await expect(
      panel.getByRole("heading", { name: "TavernKeeper Scan Results" }),
    ).toHaveText("TavernKeeper Scan Results");
    await expect(panel.locator("p")).toHaveCount(1);
    await expect(panel.locator("p").first()).toHaveText(
      "This project hasn't been scanned by TavernKeeper.",
    );
    await expect(
      panel.getByRole("link", { name: "View full report" }),
    ).toHaveCount(0);
    await panel.hover();
    await expect(panel).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    const pendingPrimaryLink = pendingCard.locator(
      ".project-card-primary-link",
    );
    await pendingPrimaryLink.focus();
    await page.keyboard.press("Tab");
    await expect(indicator).toBeFocused();
    await expect(panel).toBeVisible();
    await page.locator("h1").click();
    await expect(panel).toHaveCount(0);

    const unsupportedCard = page.locator(".project-card-shell").filter({
      has: page.getByRole("heading", {
        name: displayedProjectName(unsupportedScanProject.name),
        exact: true,
      }),
    });
    const unsupportedIndicator = unsupportedCard.locator(
      ".tavernkeeper-scan-indicator-trigger",
    );
    await expect(unsupportedIndicator).toHaveAttribute(
      "aria-label",
      "TavernKeeper scan: Unsupported source.",
    );
    await expect(unsupportedIndicator).toHaveCSS("color", "rgb(40, 99, 94)");
    await unsupportedIndicator.click();
    await expect(panel.locator("p").first()).toHaveText(
      "TavernKeeper scanning is not supported for this project's source.",
    );
    await page.keyboard.press("Escape");
    await expect(page.locator("a button, button a")).toHaveCount(0);
    await expect(
      pendingCard.locator(".project-card-primary-link"),
    ).toHaveAttribute("href", /^https:\/\//u);
    await expect(
      pendingCard.locator(".project-card-primary-link"),
    ).toHaveAttribute("target", "_blank");

    const primaryLink = pendingCard.locator(".project-card-primary-link");
    const primaryHref = await primaryLink.getAttribute("href");
    if (!primaryHref) throw new Error("Missing primary project URL");
    await page
      .context()
      .route(primaryHref, (route) =>
        route.fulfill({ body: "External project" }),
      );
    const newPage = page.context().waitForEvent("page");
    await primaryLink.click();
    const openedPage = await newPage;
    await expect(openedPage).toHaveURL(primaryHref);
    await openedPage.close();

    const kitControl = pendingCard.locator(".project-kit-control");
    await kitControl.click();
    await expect(kitControl).toHaveAttribute("aria-pressed", "true");

    const relationship = page
      .locator(".project-relationship-control button")
      .first();
    await expect(relationship).toBeVisible();
  },
);

test(
  "hydrates current and stale risk colors with contextual history links",
  { tag: "@tavernkeeper" },
  async ({ page }) => {
    test.skip(
      !hasScanFixture,
      "Requires the dedicated TavernKeeper scan fixture",
    );
    await expect(page.locator(".catalog-shell")).toHaveAttribute(
      "data-hydrated",
      "true",
    );
    for (const [
      state,
      accessibleCopy,
      stateCopy,
      stale,
      historyBlocks,
      dangerBasis,
    ] of [
      [
        "teal",
        "Low concern; current.",
        "The reviewed behavior matches the extension's stated purpose, with no material concerns.",
        false,
        12,
        null,
      ],
      [
        "teal",
        "Low concern; stale assessment.",
        "The reviewed behavior matches the extension's stated purpose, with no material concerns. This assessment covers an older commit. An updated scan is pending.",
        true,
        0,
        null,
      ],
      [
        "red",
        "Immediate danger; current.",
        "The combined reviewed behavior could expose credentials to an untrusted endpoint.",
        false,
        0,
        "Credible malicious or compromised behavior",
      ],
    ] as const) {
      const indicator = page
        .getByRole("button", {
          name: `TavernKeeper scan: ${accessibleCopy}`,
        })
        .first();

      await expect(indicator).toHaveCSS(
        "color",
        {
          teal: "rgb(45, 212, 191)",
          red: "rgb(248, 81, 73)",
        }[state],
      );
      await page.mouse.move(0, 0);
      await indicator.hover();
      await expect(indicator).toHaveAttribute("aria-expanded", "true");
      const panel = page.getByRole("dialog", {
        name: "TavernKeeper Scan Results",
      });
      await panel.hover();
      await expect(
        panel.getByRole("heading", { name: "TavernKeeper Scan Results" }),
      ).toHaveText("TavernKeeper Scan Results");
      await expect(panel.locator(".tavernkeeper-summary")).toHaveText(
        stateCopy,
      );
      await expect(
        panel.locator(".tavernkeeper-assessment-counts span"),
      ).toHaveCount(3);
      await expect(panel.locator(".tavernkeeper-scan-details div")).toHaveCount(
        dangerBasis ? 3 : 2,
      );
      if (dangerBasis) {
        await expect(panel.locator(".tavernkeeper-scan-details")).toContainText(
          `Danger basis${dangerBasis}`,
        );
      }
      await expect(
        panel.locator(".tavernkeeper-malicious-evidence"),
      ).toHaveCount(0);
      await expect(
        indicator.locator(".tavernkeeper-freshness-clock"),
      ).toHaveCount(stale ? 1 : 0);
      await expect(panel.locator(".tavernkeeper-scan-details")).toContainText(
        /ScannedJuly (?:13|30|31), 2026 · [0-9a-f]{7}/u,
      );
      await expect(panel.locator(".tavernkeeper-scan-details")).toContainText(
        /AssessedJuly (?:13|30|31), 2026 by Tavernary/u,
      );
      const sourceTreeLink = panel.getByRole("link", {
        name: /Browse scanned source at commit [0-9a-f]{40} on GitHub/u,
      });
      await expect(sourceTreeLink).toHaveAttribute(
        "href",
        /^https:\/\/github\.com\/[^/]+\/[^/]+\/tree\/[0-9a-f]{40}$/u,
      );
      await expect(sourceTreeLink).toHaveAttribute("target", "_blank");
      await expect(sourceTreeLink).toHaveAttribute("rel", /\bnoopener\b/u);
      const reportLink = panel.getByRole("link", { name: "View full report" });
      await expect(reportLink).toHaveAttribute(
        "href",
        /^https:\/\/mentallyquill\.github\.io\/TavernKeeper\/reports\/github\/\d+\/[0-9a-f]{40}\/5\/[0-9a-f]{64}\/$/u,
      );
      await expect(reportLink).toHaveAttribute("target", "_blank");
      await expect(reportLink).toHaveAttribute("rel", /\bnoopener\b/u);
      await expect(
        panel.getByRole("link", { name: "View scan history" }),
      ).toHaveAttribute(
        "href",
        /\/security\/tavernkeeper\/history\/github-\d+\/?$/u,
      );
      await expect(panel.locator(".tavernkeeper-history-strip i")).toHaveCount(
        historyBlocks,
      );
      await expect(indicator).toHaveClass(
        new RegExp(`tavernkeeper-scan-indicator-${state}`),
      );
      await page.keyboard.press("Escape");
    }
  },
);

test("uses canonical external URLs for project cards", async ({ page }) => {
  const recursion = page.getByRole("link", { name: "Recursion", exact: true });
  await expect(recursion).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Recursion",
  );
  await expect(recursion).toHaveAttribute("target", "_blank");
  await expect(recursion).toHaveAttribute("rel", /noopener/);
});

test("supports pending-license and missing-license catalog filters at full scale", async ({
  page,
}) => {
  await page.getByLabel("Pending verification", { exact: true }).check();
  await expect(
    page.getByRole("heading", {
      name: projectCountLabel(pendingLicenseCount),
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(/license=pending/);
  await expect(
    page.locator(".project-card").filter({ hasText: "Pending" }),
  ).toHaveCount(pendingLicenseCount);

  await page
    .getByRole("button", { name: "Remove Pending verification" })
    .click();
  await expect(
    page.getByRole("heading", {
      name: `${generatedProjectCount} projects`,
    }),
  ).toBeVisible();
  await expect(page).not.toHaveURL(/license=/);

  await page.getByLabel("Missing license", { exact: true }).check();
  await expect(
    page.getByRole("heading", { name: projectCountLabel(missingLicenseCount) }),
  ).toBeVisible();
  await expect(page).toHaveURL(/license=missing/);
});

test("matches the approved card anatomy", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const card = page
    .locator(".project-card-shell:not(.has-relationship-control) .project-card")
    .first();

  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );
  await expect(card.locator("h2")).toHaveCSS("font-family", /Inter/);
  await expect(card.locator(".card-bottom")).toHaveCSS(
    "border-top-style",
    "solid",
  );
  await expect(page.locator(".project-card .license").first()).toHaveCSS(
    "border-top-width",
    "0px",
  );
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
  ).toEqual({ columns: 3, gap: "12px" });
  expect(
    await card.evaluate((element) => {
      return getComputedStyle(element, "::before").content;
    }),
    "kind stripes were removed from the reference design",
  ).toBe("none");
});

test("keeps dense project-card header facts from overlapping", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  await page.reload();

  const measuredCards = page
    .locator(".project-card")
    .filter({ has: page.locator(".activity-score") });
  expect(await measuredCards.count()).toBeGreaterThan(0);
  expect(
    await measuredCards.evaluateAll((cards) =>
      cards.every((card) => {
        const identity = card
          .querySelector(".card-identity")!
          .getBoundingClientRect();
        const development = card
          .querySelector(".development")!
          .getBoundingClientRect();
        const separatedHorizontally = identity.right + 8 <= development.left;
        const separatedVertically = identity.bottom <= development.top;
        return (
          card.getBoundingClientRect().width >= 320 &&
          (separatedHorizontally || separatedVertically)
        );
      }),
    ),
  ).toBe(true);
});

test("omits inapplicable metadata from curated external preset cards", async ({
  page,
}) => {
  const presetCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", {
      name: "Pura's Director v15.0",
      exact: true,
    }),
  });

  await expect(presetCard.locator(".preset-version")).toHaveText("v15.0");
  await expect(presetCard.locator(".preset-publication")).toHaveCount(0);
  await expect(presetCard.locator(".preset-size")).toHaveCount(0);
  await expect(presetCard.locator(".card-state-list")).toHaveCount(0);
  await expect(presetCard.locator(".license")).toHaveText("Missing");

  const descriptionId = await presetCard.getAttribute("aria-describedby");
  expect(descriptionId).toBeTruthy();
  const description = page.locator(`#${descriptionId}`);

  for (const label of [
    "Manual source",
    "Activity unavailable",
    "Release unavailable",
    "Popularity unavailable",
    "Repository size unavailable",
  ]) {
    await expect(presetCard).not.toContainText(label);
    await expect(description).not.toContainText(label);
  }
});

test("explains every card fact with hover help", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const repositoryCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Recursion" }),
  });
  const presetCard = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "LE_EMOTIONALISM 1.1.5" }),
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

  for (const selector of [".preset-version", ".preset-size"]) {
    await expect(presetCard.locator(selector)).toHaveAttribute(
      "aria-describedby",
      /.+/,
    );
  }
  await expect(presetCard.locator(".preset-publication")).toHaveCount(0);

  const activityScore = repositoryCard.locator(".activity-score");
  const activityLabel = await activityScore.getAttribute("aria-label");
  expect(activityLabel).toBeTruthy();
  await activityScore.hover();
  await expect(repositoryCard).toHaveCSS("overflow", "hidden");
  await expect(
    page.getByRole("tooltip", {
      name: activityLabel!,
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
  const summaryText = (
    await repositoryCard.locator(".card-summary").textContent()
  )?.trim();
  expect(summaryText).toBeTruthy();
  await repositoryCard.locator(".card-title").hover();
  await expect(
    page.getByRole("tooltip", {
      name: summaryText!,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("tooltip", { name: "Open Recursion" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("tooltip", {
      name: summaryText!,
    }),
  ).toBeHidden();
  await page.mouse.move(0, 0);
  await repositoryCard.locator(".project-card-primary-link").focus();
  await expect(
    page.getByRole("tooltip", {
      name: summaryText!,
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
  await expect(summary).toHaveText(/\S+/);
  const summaryText = (await summary.textContent())!.trim();
  await expect(summary).toHaveCSS("white-space", "nowrap");
  await expect(summary).toHaveCSS("text-overflow", "ellipsis");
  await expect(summary).toHaveCSS("overflow", "hidden");
  await expect(summary).toHaveCSS("color", "rgb(168, 179, 186)");
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
      name: summaryText,
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
  await expect(card.locator(".activity-score > b")).toHaveText("Activity");
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
      mainRight: Math.round(main.getBoundingClientRect().right),
      columns: getComputedStyle(grid).gridTemplateColumns.split(" ").length,
      workspaceLeft: Math.round(
        document
          .querySelector<HTMLElement>(".kit-builder-panel")!
          .getBoundingClientRect().left,
      ),
      topLinkDisplay: getComputedStyle(
        document.querySelector<HTMLElement>(".header-actions .top-link")!,
      ).display,
    };
  });
  expect(tablet).toEqual({
    filterWidth: 210,
    mainLeft: 210,
    mainRight: 828,
    columns: 1,
    workspaceLeft: 828,
    topLinkDisplay: "block",
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
    triggerHeight: 44,
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
