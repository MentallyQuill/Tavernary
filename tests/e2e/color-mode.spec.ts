import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function waitForHydration(page: import("@playwright/test").Page) {
  await expect(page.locator(".catalog-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
  );
}

test("remembers colorful colorblind mode across reloads and other site pages", async ({
  page,
}) => {
  await page.goto(sitePath());
  await waitForHydration(page);
  const toggle = page.getByRole("switch", { name: "Enhanced contrast" });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".kind-frontend .card-identity").first()).toHaveCSS(
    "color",
    "rgb(214, 40, 57)",
  );

  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  await expect(page.locator(".kind-frontend .card-identity").first()).toHaveCSS(
    "color",
    "rgb(210, 231, 247)",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("tavernary:color-mode")),
  ).toBe("accessible");

  await page.reload();
  await waitForHydration(page);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await page.goto(sitePath("/about/"));
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  await page.goto(sitePath());
  await waitForHydration(page);
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.focus();
  await toggle.press("Enter");
  await page.reload();
  await waitForHydration(page);
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  await expect(page.locator(".kind-frontend .card-identity").first()).toHaveCSS(
    "color",
    "rgb(214, 40, 57)",
  );
});

test("applies the remembered palette before hydration even when application scripts are blocked", async ({
  page,
}) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("tavernary:color-mode", "accessible");
    } catch {
      /* about:blank has no origin */
    }
  });
  await page.route("**/_next/static/**/*.js*", (route) => route.abort());
  await page.goto(sitePath());
  await expect(page.locator("html")).toHaveAttribute(
    "data-color-mode",
    "accessible",
  );
  await expect(page.locator(".catalog-shell")).not.toHaveAttribute(
    "data-hydrated",
    "true",
  );
  await expect(page.locator(".kind-frontend .card-identity").first()).toHaveCSS(
    "color",
    "rgb(210, 231, 247)",
  );
});

for (const width of [1440, 1300, 1299, 1051, 1050, 1024, 768, 760, 390, 320]) {
  test(`keeps the contrast switch and Companion callout usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(sitePath());
    await waitForHydration(page);
    const toggle = page.getByRole("switch", { name: "Enhanced contrast" });
    await expect(toggle).toBeVisible();
    const companion = page.getByRole("link", { name: /^Tavernary Companion/ });
    await expect(companion).toBeVisible();
    await expect(
      companion.getByText(
        "Extension for SillyTavern and ST-compatible frontends.",
      ),
    ).toBeVisible();
    const companionBox = await companion.boundingBox();
    expect(companionBox).not.toBeNull();
    expect(companionBox!.height).toBeGreaterThanOrEqual(44);
    expect(companionBox!.x).toBeGreaterThanOrEqual(0);
    expect(companionBox!.x + companionBox!.width).toBeLessThanOrEqual(width);
    const switchBox = await toggle.boundingBox();
    const searchBox = await page.locator(".site-search").boundingBox();
    expect(switchBox).not.toBeNull();
    expect(searchBox).not.toBeNull();
    expect(switchBox!.width).toBeGreaterThanOrEqual(44);
    expect(switchBox!.height).toBeGreaterThanOrEqual(44);
    expect(switchBox!.x).toBeGreaterThanOrEqual(
      searchBox!.x + searchBox!.width,
    );
    expect(switchBox!.x + switchBox!.width).toBeLessThanOrEqual(width);
    expect(
      Math.abs(
        switchBox!.y +
          switchBox!.height / 2 -
          searchBox!.y -
          searchBox!.height / 2,
      ),
    ).toBeLessThanOrEqual(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
