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

test("tablet draft pill", async ({ page }) => {
  await openKits(page, { width: 1024, height: 900 });
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "Collapse workspace" }).click();
  await expect(page).toHaveScreenshot("kits-tablet-draft-pill.png", {
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
  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page).toHaveScreenshot("kits-mobile-draft-pill.png");

  for (let count = 0; count < 3; count += 1) {
    await page
      .getByRole("button", { name: /Add .* to Kit/ })
      .first()
      .click();
  }
  await page
    .getByRole("button", { name: "Open draft with 3 projects" })
    .click();
  await expect(page).toHaveScreenshot("kits-mobile-builder-three.png");

  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.locator(".kit-workspace-body").evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(page).toHaveScreenshot("kits-mobile-builder-long-scrolled.png");

  await page.getByRole("button", { name: "Close Kit workspace" }).click();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await expect(
    page.getByRole("heading", { name: "Kit workspace" }),
  ).toBeInViewport();
  await expect(
    page.getByRole("button", { name: "Close Kit workspace" }),
  ).toBeInViewport();
  await expect(page).toHaveScreenshot("kits-mobile-inspect.png");
});
