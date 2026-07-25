import { expect, test, type Locator, type Page } from "@playwright/test";

async function openKits(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  if (viewport.width <= 760) {
    await page.getByRole("button", { name: "Browse categories" }).click();
  }
  await page.getByRole("button", { name: "Kits", exact: true }).click();
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
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test("desktop Kit workspace and catalog do not overlap", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const workspace = page.getByRole("complementary", { name: "Kit Builder" });
  const catalog = page.locator(".catalog-main");
  await expect(workspace).toBeVisible();
  const workspaceBox = (await workspace.boundingBox())!;
  const catalogBox = (await catalog.boundingBox())!;
  expect(catalogBox.x + catalogBox.width).toBeLessThanOrEqual(
    workspaceBox.x + 1,
  );
  await expectNoHorizontalOverflow(page);
});

test("tablet collapsed Kit Builder remains bounded", async ({ page }) => {
  await openKits(page, { width: 1024, height: 900 });
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "Collapse Kit Builder" }).click();

  const workspace = page.locator(".kit-builder-panel");
  await expect(workspace).toHaveClass(/collapsed/);
  await expectWithinViewport(page, workspace);
  await expectNoHorizontalOverflow(page);
});

test("mobile Kit surfaces remain visible and bounded through navigation", async ({
  page,
}) => {
  await openKits(page, { width: 390, height: 844 });
  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(
    page.getByRole("dialog", { name: "Kit filters" }),
  ).toBeInViewport();
  await page.getByRole("button", { name: "Close Kit filters" }).click();

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const workspace = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(workspace).toBeVisible();
  await expectWithinViewport(page, workspace);
  await expectNoHorizontalOverflow(page);
});

test("320px card footer keeps metadata clear of the Kit control", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");

  const shell = page.locator(".project-card-shell").first();
  const license = shell.locator(".license");
  const control = shell.locator(".project-kit-control-hit");
  const shellBox = (await shell.boundingBox())!;
  const licenseBox = (await license.boundingBox())!;
  const controlBox = (await control.boundingBox())!;

  expect(licenseBox.x + licenseBox.width).toBeLessThanOrEqual(controlBox.x);
  expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
    shellBox.x + shellBox.width + 1,
  );
  expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
    shellBox.y + shellBox.height + 1,
  );
  await expectNoHorizontalOverflow(page);
});
