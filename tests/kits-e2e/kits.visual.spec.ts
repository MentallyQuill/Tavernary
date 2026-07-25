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

async function selectProject(
  page: import("@playwright/test").Page,
  projectName: string,
) {
  await page.getByRole("button", { name: `Add ${projectName} to Kit` }).click();
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
  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");
  await expect(page).toHaveScreenshot("kits-desktop-selection-dock.png", {
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add 3 projects to Kit" }).click();
  await page.waitForTimeout(1700);
  await expect(page).toHaveScreenshot("kits-desktop-builder-rail-count.png", {
    fullPage: true,
  });
});

test("reduced-motion card selection keeps explicit visual states", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/");
  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 02");
  await page.getByRole("button", { name: "Add 2 projects to Kit" }).click();
  await page.waitForTimeout(1700);
  await selectProject(page, "Fixture Tool 03");
  await expect(page).toHaveScreenshot(
    "kits-desktop-reduced-motion-card-states.png",
    { fullPage: true },
  );
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

  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");
  await selectProject(page, "Fixture Tool 04");
  await expect(page).toHaveScreenshot("kits-mobile-selection-dock.png");
  await page.getByRole("button", { name: "Add 3 projects to Kit" }).click();
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

test("320px mobile card footer keeps the Kit control, chips, and license clear", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");
  await expect(page).toHaveScreenshot("kits-mobile-320-card-footer.png");
});
