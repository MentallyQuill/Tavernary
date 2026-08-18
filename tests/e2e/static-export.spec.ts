import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import { generatedProjectCount } from "../helpers/generated-catalog";
import { sitePath } from "../helpers/site-path";

const publishedKits = (
  JSON.parse(
    readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
  ) as { kits: Array<{ title: string }> }
).kits;
const frontendVocabulary = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "data/vocabularies/frontends.json"),
    "utf8",
  ),
) as { frontends: Array<{ label: string }> };
const generatedCatalog = JSON.parse(
  readFileSync(resolve(process.cwd(), "src/generated/catalog.json"), "utf8"),
) as {
  schemaVersion: number;
  projects: Array<{
    sourceStatus: string;
    tavernKeeper: { state: string; freshness: string } | null;
  }>;
};

test("exports the catalog schema-v6 scan-state contract", () => {
  expect(generatedCatalog.schemaVersion).toBe(7);
  expect(
    generatedCatalog.projects
      .filter(({ sourceStatus }) => sourceStatus === "manual")
      .every(
        ({ tavernKeeper }) =>
          tavernKeeper?.state === "unsupported" &&
          tavernKeeper.freshness === "unsupported",
      ),
  ).toBe(true);
});

test("serves the catalog from the configured base path", async ({ page }) => {
  await page.goto(sitePath());
  await expect(
    page.getByRole("heading", {
      name: `${generatedProjectCount} projects`,
    }),
  ).toBeVisible();
  await expect(page.locator(".project-card")).toHaveCount(
    generatedProjectCount,
  );
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

test("exports the support transparency page", async ({ page }) => {
  await page.goto(sitePath("/support/"));

  await expect(
    page.getByRole("heading", { name: "Support Tavernary" }),
  ).toBeVisible();
  await expect(page.getByText("$12/month", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/anything above the current month.*carries forward/i),
  ).toBeVisible();
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
  await expect(
    page.locator('.project-card .project-card-primary-link[href^="https://"]'),
  ).toHaveCount(generatedProjectCount);
  await expect(page.locator("body")).not.toContainText("submitted_at");
  await expect(page.locator("body")).not.toContainText("catalog_intake");
});

test("renders every configured frontend filter", async ({ page }) => {
  await page.goto(sitePath());
  const group = page.locator(".filter-panel").getByRole("group", {
    name: "Compatible frontend",
  });
  const hiddenCount = Math.max(frontendVocabulary.frontends.length - 3, 0);

  if (hiddenCount > 0) {
    await group
      .getByRole("button", { name: `Show ${hiddenCount} more` })
      .click();
  }
  for (const { label } of frontendVocabulary.frontends) {
    await expect(group.getByLabel(label, { exact: true })).toBeVisible();
  }
});

test("renders every published Kit", async ({ page }) => {
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();

  await expect(page.locator(".kit-card")).toHaveCount(publishedKits.length);
  for (const { title } of publishedKits) {
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
});
