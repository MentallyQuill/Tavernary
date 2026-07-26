import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

test("serves the catalog from the configured base path", async ({ page }) => {
  await page.goto(sitePath());
  await expect(
    page.getByRole("heading", { name: "211 projects" }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(211);
  await expect(page).not.toHaveTitle(/404/);
});

test("exports the supplied Tavernary artwork", async ({ page }) => {
  const response = await page.request.get(`${sitePath()}tavernary-trihex.png`);

  expect(response.ok()).toBe(true);
  expect(response.headers()["content-type"]).toBe("image/png");
});

test("serves every favicon declared on the About page", async ({ page }) => {
  await page.goto(sitePath("/about/"));

  const iconUrls = await page
    .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLLinkElement).href),
    );

  expect(iconUrls.length).toBeGreaterThan(0);
  for (const iconUrl of iconUrls) {
    const response = await page.request.get(iconUrl);
    expect(response.ok(), `${iconUrl} should resolve`).toBe(true);
  }
});

test("locks the built-in dark theme against Dark Reader recoloring", async ({
  page,
}) => {
  await page.goto(sitePath());
  await expect(page.locator('meta[name="darkreader-lock"]')).toHaveCount(1);
});

test("exports canonical project links without intake-only metadata", async ({
  page,
}) => {
  await page.goto(sitePath());
  await expect(page.locator('.project-card[href^="https://"]')).toHaveCount(
    211,
  );
  await expect(page.locator("body")).not.toContainText("submitted_at");
  await expect(page.locator("body")).not.toContainText("catalog_intake");
});
