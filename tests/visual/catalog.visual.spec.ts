import { expect, test, type Locator, type Page } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function stabilizeRefreshLabel(page: Page) {
  await page.locator(".catalog-toolbar p").evaluate((label) => {
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
      const standardHeight = (await firstCard.boundingBox())!.height;
      await page.getByRole("button", { name: "Use compact cards" }).click();

      await expect(page.locator("body")).toHaveClass(/compact-cards/);
      expect((await firstCard.boundingBox())!.height).toBeLessThan(
        standardHeight,
      );
      await expectWithinViewport(page, firstCard);
      await expectNoHorizontalOverflow(page);
    });
  }
}
