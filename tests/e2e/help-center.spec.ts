import { expect, test } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

async function interceptHelpWindow(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (url: string | URL) => {
        (window as Window & { openedHelpUrl?: string }).openedHelpUrl =
          String(url);
        return window;
      },
    });
  });
}

test("routes header visitors through every Help path and back to the catalog", async ({
  page,
}) => {
  await page.goto(sitePath());

  const siteActions = page.getByRole("navigation", { name: "Site actions" });
  await expect(siteActions.getByRole("link", { name: "Help" })).toHaveAttribute(
    "href",
    sitePath("/help/"),
  );
  await expect(siteActions.locator('a[href*="github.com"]')).toHaveCount(0);

  await siteActions.getByRole("link", { name: "Help" }).click();
  await expect(
    page.getByRole("heading", { name: "How can we help?" }),
  ).toBeVisible();

  for (const [name, path] of [
    ["Manage your project listing", "/help/manage-project/"],
    ["Report a project listing", "/help/report-project/"],
    ["Report a website problem", "/help/report-website/"],
    ["Report a Kit", "/help/report-kit/"],
    ["Get other help", "/help/other/"],
  ]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute(
      "href",
      sitePath(path),
    );
  }

  await page.getByRole("link", { name: "Report a website problem" }).click();
  await expect(
    page.getByRole("link", { name: "← Back to the catalog" }),
  ).toHaveAttribute("href", sitePath("/"));
});

test("falls back from invalid context and keeps keyboard errors discoverable", async ({
  page,
}) => {
  await page.goto(
    sitePath("/help/report-website/?from=https%3A%2F%2Fevil.example%2Fhelp"),
  );

  await expect(page.getByLabel("What page has the problem?")).toHaveValue("");
  await page.getByRole("button", { name: "Review request" }).press("Enter");

  const errors = page.locator(".help-error-summary");
  await expect(errors).toContainText("Enter a Tavernary page URL");
  await expect(errors).toBeFocused();
  await expect(page.getByLabel("What page has the problem?")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
});

test("preserves reviewed report state and cancels without opening GitHub", async ({
  page,
}) => {
  await page.goto(sitePath("/help/report-website/?from=%2Fhelp%2F"));
  await interceptHelpWindow(page);

  await page
    .getByLabel("What kind of website problem is this?")
    .selectOption("accessibility");
  await page
    .getByLabel("What happens instead?")
    .fill("Focus is not visible after a keyboard action.");
  await page.getByLabel("What should happen?").fill("Focus remains visible.");
  await page
    .getByLabel("How can we reproduce it?")
    .fill("Open Help and press Tab.");
  await expect(page.getByText("45/2000")).toBeVisible();

  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Back and edit" }).click();
  await expect(page.getByLabel("What happens instead?")).toHaveValue(
    "Focus is not visible after a keyboard action.",
  );

  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toHaveCount(0);
  await expect(
    page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl,
    ),
  ).resolves.toBeUndefined();
});

test("uses contextual Help links and opens a reviewed request through the intended template", async ({
  page,
}) => {
  await page.goto(sitePath("/help/other/"));
  await interceptHelpWindow(page);

  await expect(
    page.getByRole("link", { name: "Report it privately." }),
  ).toHaveAttribute("href", sitePath("/help/security/"));
  await page
    .getByLabel("What do you need help with?")
    .selectOption("using-tavernary");
  await page.getByLabel("Subject").fill("Help with a Kit");
  await page.getByLabel("Description").fill("I need guidance for my draft.");
  await expect(page.getByText("15/120")).toBeVisible();
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const opened = new URL(
    await page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl ?? "",
    ),
  );
  expect(opened.searchParams.get("template")).toBe("04-other.yml");
  expect(opened.searchParams.get("subject")).toBe("Help with a Kit");
});

test("keeps the private security route free of a public issue form at 320 px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(sitePath("/help/security/"));

  await expect(
    page.getByRole("link", { name: "Open GitHub's private report form" }),
  ).toHaveAttribute(
    "href",
    "https://github.com/MentallyQuill/Tavernary/security/advisories/new",
  );
  await expect(page.locator('a[href*="/issues/new"]')).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
