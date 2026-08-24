import { expect, test } from "@playwright/test";

import {
  collapsedFrontendOptions,
  frontendExpansionLabel,
  initiallyVisibleFrontendOptions,
  tagOptionsByFacet,
  tagSearchFixture,
} from "../helpers/generated-catalog";
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
  await expect(actions.getByRole("link", { name: "Help" })).toBeVisible();

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
  const support = page.getByRole("link", {
    name: "Buy Me a Ko-Fi",
  });
  await expect(support).toBeVisible();
  await expect(support.locator(".kofi-support-label")).toHaveCSS(
    "width",
    "1px",
  );
  const supportBox = await support.boundingBox();
  const submitBox = await submit.boundingBox();
  expect(supportBox).not.toBeNull();
  expect(submitBox).not.toBeNull();
  expect(supportBox!.width).toBe(34);
  expect(supportBox!.height).toBe(34);
  expect(supportBox!.x).toBeGreaterThanOrEqual(submitBox!.x + submitBox!.width);
  expect
    .soft(supportBox!.x - (submitBox!.x + submitBox!.width))
    .toBeLessThanOrEqual(4);
  expect(
    await submit.evaluate((element) => element.getBoundingClientRect().height),
  ).toBeLessThan(40);
});

test("keeps search help available within the mobile viewport", async ({
  page,
}) => {
  await page.goto(sitePath());

  await expect(page.locator(".site-search > kbd")).toBeHidden();
  const help = page.getByRole("button", { name: "Search help" });
  await expect(help).toBeVisible();
  const helpBox = await help.boundingBox();
  expect(helpBox).not.toBeNull();
  expect(helpBox!.x + helpBox!.width).toBeLessThanOrEqual(382);
  await help.click();

  const dialog = page.getByRole("dialog", { name: "Search basics" });
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(8);
  expect(box!.x + box!.width).toBeLessThanOrEqual(382);
});

test("keeps the mobile support action inside a 412px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto(sitePath());

  const support = page.getByRole("link", {
    name: "Buy Me a Ko-Fi",
  });
  const supportBox = await support.boundingBox();
  expect(supportBox).not.toBeNull();
  expect(supportBox!.width).toBe(34);
  expect(supportBox!.height).toBe(34);
  expect(supportBox!.x + supportBox!.width).toBeLessThanOrEqual(412);
});

test("opens the Tavernary support page from a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(sitePath());
  await page.getByRole("link", { name: "Buy Me a Ko-Fi" }).click();

  await expect(
    page.getByRole("heading", { name: "Support Tavernary", exact: true }),
  ).toBeVisible();

  const supportOnKofi = page
    .locator(".support-target")
    .getByRole("link", { name: "Support on Ko-fi" });
  await expect(supportOnKofi).toBeVisible();
  await expect(supportOnKofi).toHaveAttribute(
    "href",
    "https://ko-fi.com/mentallyquill",
  );

  const supportOnKofiBox = await supportOnKofi.boundingBox();
  expect(supportOnKofiBox).not.toBeNull();
  expect(supportOnKofiBox!.x).toBeGreaterThanOrEqual(0);
  expect(supportOnKofiBox!.x + supportOnKofiBox!.width).toBeLessThanOrEqual(
    320,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
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

  const modelGroup = dialog.getByRole("group", { name: "Model family" });
  const modelOptions = modelGroup.locator(".metadata-options");
  const modelContainment = await modelOptions.evaluate((element) => {
    const chips = Array.from(
      element.querySelectorAll<HTMLElement>(".filter-choice-chip"),
    ).filter((chip) => chip.getClientRects().length > 0);
    const bounds = element.getBoundingClientRect();
    return {
      bottom: bounds.bottom,
      chipBottoms: chips.map((chip) => chip.getBoundingClientRect().bottom),
    };
  });
  expect(modelContainment.chipBottoms.length).toBeGreaterThan(0);
  expect
    .soft(Math.max(...modelContainment.chipBottoms))
    .toBeLessThanOrEqual(modelContainment.bottom + 1);

  const development = dialog.getByRole("group", { name: "Development" });
  const countClearances = await development
    .locator("b")
    .evaluateAll((counts) => {
      const sheet = document.querySelector<HTMLElement>(".filter-sheet");
      if (!sheet) throw new Error("Missing Filter sheet");
      const scrollportRight =
        sheet.getBoundingClientRect().left +
        sheet.clientLeft +
        sheet.clientWidth;
      return counts.map(
        (count) => scrollportRight - count.getBoundingClientRect().right,
      );
    });
  expect.soft(Math.min(...countClearances)).toBeGreaterThanOrEqual(16);

  await expect(
    dialog.getByRole("searchbox", {
      name: "Search goals and traits",
    }),
  ).toBeVisible();
  await expect(dialog.locator(".tag-results-bounded")).toHaveCount(0);
  await expect(dialog.locator(".tag-browser-facets")).toHaveCSS(
    "overflow-y",
    "visible",
  );
  for (const facet of ["goal", "trait"] as const) {
    const group = dialog.getByRole("group", {
      name: facet === "goal" ? "Goals" : "Traits",
    });
    const visibleCount = await group.getByRole("checkbox").count();
    const hiddenCount = tagOptionsByFacet[facet].length - visibleCount;
    if (hiddenCount > 0) {
      await expect(
        group.getByRole("button", {
          name: `Show ${hiddenCount} more`,
        }),
      ).toBeVisible();
    }
  }
  const goals = dialog.getByRole("group", { name: "Goals" });
  const goalsDisclosure = goals.getByRole("button", {
    name: /Show \d+ more/u,
  });
  if ((await goalsDisclosure.count()) > 0) await goalsDisclosure.click();
  if (!tagSearchFixture) throw new Error("Missing tag search fixture");
  const tagSearch = dialog.getByRole("searchbox", {
    name: "Search goals and traits",
  });
  await tagSearch.fill(
    tagSearchFixture.aliases[0] ?? tagSearchFixture.description,
  );
  await expect(
    dialog.getByLabel(tagSearchFixture.label, { exact: true }),
  ).toBeVisible();
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
  for (const { label } of initiallyVisibleFrontendOptions) {
    await expect(group.getByLabel(label, { exact: true })).toBeVisible();
  }
  for (const { label } of collapsedFrontendOptions) {
    await expect(group.getByLabel(label, { exact: true })).toBeHidden();
  }
  await group.getByRole("button", { name: frontendExpansionLabel }).click();
  for (const { label } of collapsedFrontendOptions) {
    await expect(group.getByLabel(label, { exact: true })).toBeVisible();
  }
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
  await expect(summary).toHaveText(/\S+/);
  await expect(summary).toHaveCSS("white-space", "nowrap");
  await expect(summary).toHaveCSS("text-overflow", "ellipsis");
  await expect(summary).toHaveCSS("overflow", "hidden");

  await card.locator(".card-title").hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);
});

test("shows a noninteractive creator byline only on standard cards", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("MentallyQuill");

  const directive = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Directive", exact: true }),
  });
  const attribution = directive.locator(".card-attribution");
  await expect(attribution).toHaveText("by MentallyQuill");
  await expect(attribution).not.toHaveAttribute("tabindex");
  await expect(attribution.locator("a, button")).toHaveCount(0);

  await attribution.hover();
  await expect(page.getByRole("tooltip")).toHaveCount(0);

  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(attribution).toBeHidden();
});

test("keeps the project submission builder inside a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(sitePath("/submit/project/"));
  await page.getByLabel("Project Type").selectOption({ label: "Extension" });
  await page.getByLabel("Other or not listed").check();

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  expect(
    await page
      .getByRole("button", { name: "Review submission" })
      .evaluate((element) => element.getBoundingClientRect().height),
  ).toBeGreaterThanOrEqual(44);

  await page.getByLabel("Primary function").click();
  await page.getByRole("option", { name: /Interface and workflow/u }).click();
  await page
    .getByRole("textbox", { name: "Project URL" })
    .fill("https://github.com/example/extension");
  await page.getByLabel("Other frontend name").fill("Example Frontend");
  await page
    .getByLabel("Other frontend URL")
    .fill("https://github.com/example/frontend");
  await page.getByRole("button", { name: "Review submission" }).click();

  const primary = page.getByRole("button", { name: "Continue on GitHub" });
  const copy = page.getByRole("button", { name: "Copy GitHub form URL" });
  const [primaryBox, copyBox] = await Promise.all([
    primary.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(primaryBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(copyBox!.width).toBeGreaterThanOrEqual(44);
  expect(copyBox!.height).toBeGreaterThanOrEqual(44);
  expect(copyBox!.x).toBeGreaterThan(primaryBox!.x + primaryBox!.width);
  expect(
    Math.abs(
      primaryBox!.y +
        primaryBox!.height / 2 -
        (copyBox!.y + copyBox!.height / 2),
    ),
  ).toBeLessThanOrEqual(1);
  await expect(
    page.getByText(
      "Prefer to open it yourself? Copy the completed URL and paste it into your browser.",
    ),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("keeps search evidence and corrections inside a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(sitePath());
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("MentallyQuill");
  const directive = page.locator(".project-card").filter({
    has: page.getByRole("heading", { name: "Directive", exact: true }),
  });
  await expect(directive.locator(".search-match-evidence")).toHaveText(
    "Matched maintainer: MentallyQuill",
  );

  await search.fill("frankenstien");
  const correction = page.getByRole("button", {
    name: "Search for frankenstein",
  });
  await expect(correction).toBeVisible();
  const bounds = await correction.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
    };
  });
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("keeps Help controls and private reporting inside a 320px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(sitePath("/help/"));

  await expect(
    page.getByRole("link", { name: "Open private security reporting" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Report a website problem" }).click();
  await expect(page).toHaveURL(/\/help\/report-website\/?(?:\?|$)/u);
  await expect(page.getByRole("button", { name: "Review request" })).toHaveCSS(
    "min-height",
    "44px",
  );

  await expect
    .poll(async () => {
      try {
        return await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Execution context was destroyed")
        ) {
          return Number.POSITIVE_INFINITY;
        }
        throw error;
      }
    })
    .toBeLessThanOrEqual(0);
});

test("keeps the owner project selector usable at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(
    sitePath("/help/manage-project/?project=mentallyquill-directive"),
  );

  const project = page.getByLabel("Project", { exact: true });
  await expect(project).toHaveValue("Directive");
  const bounds = await project.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      viewport: document.documentElement.clientWidth,
    };
  });

  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport);
});

test("renders affected Kit projects as compact touch-safe choices", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto(sitePath("/help/report-kit/?kit=aiko-s-loadout-30"));
  await page.getByLabel("What is wrong?").selectOption("compatibility-problem");

  const choice = page
    .getByRole("group", { name: "Affected Kit projects" })
    .getByLabel("SillyTavern", { exact: true });
  const geometry = await choice.evaluate((element) => {
    const input = element.getBoundingClientRect();
    const label = element.closest("label")!.getBoundingClientRect();
    return {
      inputWidth: input.width,
      inputHeight: input.height,
      labelHeight: label.height,
    };
  });

  expect(geometry.inputWidth).toBeLessThanOrEqual(24);
  expect(geometry.inputHeight).toBeLessThanOrEqual(24);
  expect(geometry.labelHeight).toBeGreaterThanOrEqual(44);
});
