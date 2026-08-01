import { expect, test, type Locator, type Page } from "@playwright/test";

import { generatedCatalog as catalog } from "../helpers/generated-catalog";
import { sitePath } from "../helpers/site-path";

const forkRelationshipChild =
  catalog.projects.find(({ id }) => id === "kritblade-vectfox") ??
  catalog.projects.find(
    ({ fork }) => fork?.status === "published" && fork.parentProjectId,
  );
const pendingScanProject = catalog.projects.find(
  ({ tavernKeeper }) => tavernKeeper?.state === "gray",
);
const hasScanFixture = process.env.TAVERNARY_SCAN_FIXTURE === "true";

if (!pendingScanProject) {
  throw new Error("Missing pending scan indicator fixture");
}

async function stabilizeRefreshLabel(page: Page) {
  await page
    .locator(".catalog-toolbar p")
    .filter({ hasText: "Catalog refreshed" })
    .evaluate((label) => {
      label.textContent = "Catalog refreshed recently";
    });
}

async function stabilizeRelationshipActivityAge(page: Page) {
  const ages = page.locator(".relationship-pair .commit-age");
  await expect(ages).toHaveCount(2);
  await ages.nth(0).evaluate((label) => {
    label.textContent = "2d ago";
  });
  await ages.nth(1).evaluate((label) => {
    label.textContent = "11d ago";
  });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectWithinViewport(
  page: Page,
  locator: Locator,
  { vertical = false }: { vertical?: boolean } = {},
) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  if (vertical) {
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
  }
}

for (const scenario of [
  { name: "desktop", width: 1440, height: 1000, compact: false },
  { name: "compact", width: 1440, height: 1000, compact: true },
  { name: "phone", width: 390, height: 844, compact: false },
] as const) {
  for (const title of [
    { name: "short", value: "Scan Title" },
    {
      name: "ellipsized",
      value:
        "An intentionally long catalog project title that must ellipsize before its scan indicator",
    },
  ] as const) {
    test(`scan indicator ${title.name} title stays inline and visible on ${scenario.name}`, async ({
      page,
    }) => {
      test.skip(
        !hasScanFixture,
        "Requires the dedicated TavernKeeper scan fixture",
      );
      await page.setViewportSize(scenario);
      await page.goto(
        `${sitePath()}?q=${encodeURIComponent(pendingScanProject.name)}${
          scenario.compact ? "&density=compact" : ""
        }`,
      );
      await stabilizeRefreshLabel(page);

      const card = page.locator(".project-card").first();
      const titleText = card.locator(".card-title");
      const trigger = card.locator(".tavernkeeper-scan-indicator-trigger");
      await expect(card).toBeVisible();
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await trigger.hover();
      const popover = page.getByRole("dialog", {
        name: "TavernKeeper Scan Results",
      });
      await expect(popover).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(popover).toHaveCount(0);
      await page.mouse.move(0, 0);
      await titleText.evaluate((element, nextTitle) => {
        element.textContent = nextTitle;
        element.scrollLeft = 0;
      }, title.value);
      await expect(titleText).toHaveText(title.value);

      const metrics = await card.evaluate((element) => {
        const titleElement = element.querySelector<HTMLElement>(".card-title");
        const triggerElement = element.querySelector<HTMLElement>(
          ".tavernkeeper-scan-indicator-trigger",
        );
        if (!titleElement || !triggerElement) {
          throw new Error("Missing scan title layout elements");
        }
        const cardBox = element.getBoundingClientRect();
        const titleBox = titleElement.getBoundingClientRect();
        const triggerBox = triggerElement.getBoundingClientRect();
        const titleStyle = getComputedStyle(titleElement);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Missing canvas text context");
        context.font = [
          titleStyle.fontStyle,
          titleStyle.fontVariant,
          titleStyle.fontWeight,
          titleStyle.fontSize,
          titleStyle.fontFamily,
        ].join(" ");
        return {
          cardRight: cardBox.right,
          titleClientWidth: titleElement.clientWidth,
          titleScrollWidth: titleElement.scrollWidth,
          triggerLeft: triggerBox.left,
          triggerRight: triggerBox.right,
          titleRight: titleBox.right,
          titleTextWidth: context.measureText(titleElement.textContent ?? "")
            .width,
        };
      });

      expect(metrics.triggerLeft).toBeGreaterThanOrEqual(metrics.titleRight);
      expect(metrics.triggerLeft - metrics.titleRight).toBeLessThanOrEqual(8);
      expect(metrics.triggerRight).toBeLessThanOrEqual(metrics.cardRight);
      expect(metrics.cardRight - metrics.triggerRight).toBeGreaterThanOrEqual(
        8,
      );
      if (title.name === "ellipsized")
        expect(metrics.titleTextWidth).toBeGreaterThan(
          metrics.titleClientWidth,
        );

      await expect(card).toHaveScreenshot(
        `scan-indicator-${scenario.name}-${title.name}.png`,
        { animations: "disabled", maxDiffPixels: 10 },
      );
      await trigger.hover();
      await expect(popover).toBeVisible();
      await expectWithinViewport(page, popover, { vertical: true });
      await expect(popover).toHaveScreenshot(
        `scan-popover-${scenario.name}-${title.name}.png`,
        { animations: "disabled", maxDiffPixels: 10 },
      );
    });
  }
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 1024, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog surface stays within the viewport`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await stabilizeRefreshLabel(page);

    const grid = page.locator(".project-grid");
    await grid.scrollIntoViewIfNeeded();
    await expect(grid).toBeVisible();
    expect(await page.locator(".project-card").count()).toBeGreaterThan(0);
    await expectWithinViewport(page, grid);
    await expectNoHorizontalOverflow(page);
  });

  test(`${viewport.name} first screen keeps its primary surfaces bounded`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());
    await stabilizeRefreshLabel(page);

    await expect(page.locator(".catalog-toolbar")).toBeVisible();
    await expectWithinViewport(page, page.locator(".catalog-main"));
    await expectNoHorizontalOverflow(page);
  });

  if (viewport.name !== "tablet") {
    test(`${viewport.name} compact mode reduces card height without overflow`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(sitePath());
      await stabilizeRefreshLabel(page);

      const firstCard = page.locator(".project-card").first();
      const directiveAttribution = page
        .locator(".project-card")
        .filter({
          has: page.getByRole("heading", {
            name: "Directive",
            exact: true,
          }),
        })
        .locator(".card-attribution");
      await expect(directiveAttribution).toBeVisible();
      const standardHeight = (await firstCard.boundingBox())!.height;
      await page.getByRole("button", { name: "Use compact cards" }).click();

      await expect(page.locator("body")).toHaveClass(/compact-cards/);
      await expect(directiveAttribution).toBeHidden();
      expect((await firstCard.boundingBox())!.height).toBeLessThan(
        standardHeight,
      );
      await expectWithinViewport(page, firstCard);
      await expectNoHorizontalOverflow(page);
    });
  }
}

for (const scenario of [
  { name: "desktop-standard", width: 1440, height: 1000, compact: false },
  { name: "desktop-compact", width: 1440, height: 1000, compact: true },
  { name: "mobile", width: 390, height: 844, compact: false },
] as const) {
  test(`fork relationship ${scenario.name} visual`, async ({ page }) => {
    test.skip(
      !forkRelationshipChild,
      "The controlled fork backfill has not been applied.",
    );
    await page.setViewportSize(scenario);
    const parameters = new URLSearchParams({
      relationship: forkRelationshipChild!.id,
      ...(scenario.compact ? { density: "compact" } : {}),
    });
    await page.goto(`${sitePath()}?${parameters}`);
    if (scenario.compact) {
      await expect(page.locator("body")).toHaveClass(/compact-cards/);
      await expect(
        page.locator(".relationship-pair .card-bottom").first(),
      ).toBeHidden();
    }
    await stabilizeRefreshLabel(page);
    await stabilizeRelationshipActivityAge(page);

    const pair = page.locator(".relationship-pair");
    await expect(pair).toBeVisible();
    await expect(pair.locator(".project-card")).toHaveCount(2);
    await expectNoHorizontalOverflow(page);
    await expect(pair).toHaveScreenshot(
      `fork-relationship-${scenario.name}.png`,
      {
        animations: "disabled",
        maxDiffPixels: 10,
      },
    );
  });
}

test("fork relationship stays in the aligned license utility row", async ({
  page,
}) => {
  test.skip(
    !forkRelationshipChild,
    "The controlled fork backfill has not been applied.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${sitePath()}?relationship=${forkRelationshipChild!.id}`);
  await stabilizeRefreshLabel(page);

  const pair = page.locator(".relationship-pair");
  const upstreamCard = pair.locator(".project-card").nth(0);
  const forkCard = pair.locator(".project-card").nth(1);
  const upstreamUtility = (await upstreamCard
    .locator(".card-utility")
    .boundingBox())!;
  const forkUtility = (await forkCard.locator(".card-utility").boundingBox())!;
  const licenseBox = (await pair
    .locator(".project-card-shell")
    .nth(1)
    .locator(".project-relationship-control .license")
    .boundingBox())!;
  const separatorBox = (await pair
    .locator(".project-relationship-separator")
    .nth(0)
    .boundingBox())!;
  const relationshipBox = (await pair
    .locator(".project-relationship-origin")
    .nth(0)
    .boundingBox())!;
  const kitBox = (await pair
    .locator(".project-card-shell")
    .nth(1)
    .locator(".project-kit-control-face")
    .boundingBox())!;

  expect((await upstreamCard.boundingBox())!.height).toBe(
    (await forkCard.boundingBox())!.height,
  );
  expect(forkUtility.y).toBeCloseTo(upstreamUtility.y, 0);
  expect(licenseBox.x + licenseBox.width).toBeLessThan(separatorBox.x);
  expect(separatorBox.x + separatorBox.width).toBeLessThan(relationshipBox.x);
  expect(relationshipBox.x + relationshipBox.width).toBeLessThanOrEqual(
    kitBox.x,
  );
});

test("fork relationship long names avoid control collisions", async ({
  page,
}) => {
  test.skip(
    !forkRelationshipChild,
    "The controlled fork backfill has not been applied.",
  );
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${sitePath()}?relationship=${forkRelationshipChild!.id}`);
  await stabilizeRefreshLabel(page);
  await page.locator(".relationship-pair").evaluate((pair) => {
    const headings = pair.querySelectorAll(".card-title");
    const origins = pair.querySelectorAll(".project-relationship-origin");
    headings[0]!.textContent =
      "An Exceptionally Long Immediate Upstream Project Name";
    headings[1]!.textContent = "An Equally Long Downstream Fork Project Name";
    origins.forEach((origin) => {
      origin.textContent =
        "Fork of An Exceptionally Long Immediate Upstream Project Name";
    });
  });
  await page
    .locator(".active-query button span")
    .first()
    .evaluate((token) => {
      token.textContent =
        "Fork: An Exceptionally Long Immediate Upstream Project Name → An Equally Long Downstream Fork Project Name";
    });

  const pair = page.locator(".relationship-pair");
  await expectNoHorizontalOverflow(page);
  await expect(page.locator(".catalog-main")).toHaveScreenshot(
    "fork-relationship-long-names.png",
    {
      animations: "disabled",
      maxDiffPixels: 800,
    },
  );
});
