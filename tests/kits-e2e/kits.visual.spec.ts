import { expect, test } from "@playwright/test";

async function openKits(
  page: import("@playwright/test").Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  if (viewport.width <= 760) {
    await page.getByRole("button", { name: "Browse categories" }).click();
  }
  await page.getByRole("button", { name: "Kits", exact: true }).click();
}

async function longPress(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
) {
  await locator.scrollIntoViewIfNeeded();
  const box = (await locator.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();
}

test("desktop ordinary grid and selected workspace", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await expect(page).toHaveScreenshot("kits-desktop-grid.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await expect(page).toHaveScreenshot("kits-desktop-selected.png", {
    fullPage: true,
  });
});

test("Kit controls and dual range states", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await expect(page).toHaveScreenshot("kits-controls-range-default.png", {
    fullPage: true,
  });
  await page.getByRole("slider", { name: "Minimum projects" }).fill("3");
  await page.getByRole("slider", { name: "Maximum projects" }).fill("3");
  await expect(page).toHaveScreenshot("kits-controls-range-constrained.png", {
    fullPage: true,
  });
});

test("tablet collapsed builder rail", async ({ page }) => {
  await openKits(page, { width: 1024, height: 900 });
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "Collapse Kit Builder" }).click();
  await expect(page).toHaveScreenshot("kits-tablet-builder-rail.png", {
    fullPage: true,
  });
});

test("desktop selection dock and persistent builder count", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await page.getByRole("button", { name: "Collapse Kit Builder" }).click();
  await expect(page).toHaveScreenshot("kits-desktop-builder-rail-empty.png", {
    fullPage: true,
  });
  const frontendShell = page
    .locator(".project-card-shell")
    .filter({ has: page.locator(".project-card.kind-frontend") })
    .first();
  const extensionShells = page
    .locator(".project-card-shell")
    .filter({ has: page.locator(".project-card.kind-extension") });
  await longPress(page, frontendShell);
  await extensionShells.nth(0).click();
  await extensionShells.nth(1).click();
  await expect(page).toHaveScreenshot("kits-desktop-selection-dock.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add to Kit" }).click();
  await page.waitForTimeout(1700);
  await expect(page).toHaveScreenshot("kits-desktop-builder-rail-count.png", {
    fullPage: true,
  });
});

test("desktop create and 50-project builder", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await expect(page).toHaveScreenshot("kits-desktop-create.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page).toHaveScreenshot("kits-desktop-50-projects.png", {
    fullPage: true,
  });
});

test("desktop flagged caution state", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Open Flagged Stack" }).click();
  await expect(page).toHaveScreenshot("kits-desktop-flagged.png", {
    fullPage: true,
  });
});

test("mobile browse, filters, draft, builder, long stack, and inspection", async ({
  page,
}) => {
  await openKits(page, { width: 390, height: 844 });
  await expect(page).toHaveScreenshot("kits-mobile-browse.png");

  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(page).toHaveScreenshot("kits-mobile-filters.png");
  await page.getByRole("button", { name: "Close Kit filters" }).click();

  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page).toHaveScreenshot("kits-mobile-draft-pill.png");

  const mobileExtensionShells = page
    .locator(".project-card-shell")
    .filter({ has: page.locator(".project-card.kind-extension") });
  await longPress(page, mobileExtensionShells.nth(0));
  await mobileExtensionShells.nth(1).click();
  await mobileExtensionShells.nth(2).click();
  await expect(page).toHaveScreenshot("kits-mobile-selection-dock.png");
  await page.getByRole("button", { name: "Add to Kit" }).click();
  await expect(
    page.locator(".kit-draft-access-status", {
      hasText: "3 projects added",
    }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("kits-mobile-projects-added.png");
  await page.waitForTimeout(1700);
  await expect(page).toHaveScreenshot("kits-mobile-draft-settled.png");
  await page
    .getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    })
    .click();
  await expect(page).toHaveScreenshot("kits-mobile-builder-three.png");

  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.locator(".kit-builder-panel-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page).toHaveScreenshot("kits-mobile-builder-long-scrolled.png");

  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await expect(
    page.getByRole("heading", { name: "Kit Builder" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Close Kit Builder" }),
  ).toBeInViewport();
  await expect(page).toHaveScreenshot("kits-mobile-inspect.png");
});
