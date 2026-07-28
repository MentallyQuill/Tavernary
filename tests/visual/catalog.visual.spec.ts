import { expect, test, type Locator, type Page } from "@playwright/test";

import { generatedCatalog as catalog } from "../helpers/generated-catalog";
import { sitePath } from "../helpers/site-path";

const forkRelationshipChild =
  catalog.projects.find(({ id }) => id === "kritblade-vectfox") ??
  catalog.projects.find(
    ({ fork }) => fork?.status === "published" && fork.parentProjectId,
  );

async function stabilizeRefreshLabel(page: Page) {
  await page
    .locator(".catalog-toolbar p")
    .filter({ hasText: "Catalog refreshed" })
    .evaluate((label) => {
      label.textContent = "Catalog refreshed recently";
    });
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
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
