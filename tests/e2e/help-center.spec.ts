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

test("preserves selected catalog and Kit records through actual report controls", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("Aikobots");

  const project = page.locator(".project-card-shell").filter({
    has: page.getByRole("heading", { name: "Aikobots", exact: true }),
  });
  const reportProject = project.getByRole("link", {
    name: "Report Aikobots",
  });
  await expect(reportProject).toHaveAttribute(
    "href",
    sitePath("/help/report-project/?project=aikohanasaki-aikobots"),
  );
  await reportProject.click();
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    "aikohanasaki-aikobots",
  );

  await page.goto(sitePath("/?mode=kits"));
  const kit = page.getByRole("article", { name: "Aiko's Loadout" });
  await kit.getByRole("button", { name: "Report Kit" }).click();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(sitePath("/help/report-kit"));
  await expect
    .poll(() => new URL(page.url()).searchParams.get("kit"))
    .toBe("aiko-s-loadout-30");
  await expect(page.getByLabel("Kit", { exact: true })).toHaveValue(
    "aiko-s-loadout-30",
  );
});

test("takes a Kit report from source control through validation, review, cancel, and handoff", async ({
  page,
}) => {
  await page.goto(sitePath("/?mode=kits"));
  await page
    .getByRole("article", { name: "Aiko's Loadout" })
    .getByRole("button", { name: "Report Kit" })
    .click();
  await interceptHelpWindow(page);

  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.locator(".help-error-summary")).toContainText(
    "Choose what is wrong.",
  );
  await page.getByLabel("What is wrong?").selectOption("compatibility-problem");
  await page
    .getByRole("checkbox", { name: "SillyTavern", exact: true })
    .check();
  await page
    .getByLabel("What should Tavernary review?")
    .fill("The Kit needs a compatibility review.");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back and edit" }).click();
  await expect(
    page.getByRole("checkbox", { name: "SillyTavern", exact: true }),
  ).toBeChecked();
  await expect(page.getByLabel("What should Tavernary review?")).toHaveValue(
    "The Kit needs a compatibility review.",
  );

  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(
    page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl,
    ),
  ).resolves.toBeUndefined();

  await interceptHelpWindow(page);
  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();
  const opened = new URL(
    await page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl ?? "",
    ),
  );
  expect(opened.searchParams.get("template")).toBe("06-kit-report.yml");
  expect(
    JSON.parse(opened.searchParams.get("help-manifest") ?? ""),
  ).toMatchObject({
    request_kind: "kit-report",
    payload: {
      kit_id: "aiko-s-loadout-30",
      affected_project_ids: ["sillytavern-sillytavern"],
    },
  });
});

test("covers conditional report branches and ignores unknown record context", async ({
  page,
}) => {
  await page.goto(sitePath("/help/report-project/?project=unknown-project"));
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue("");
  for (const branch of [
    {
      category: "incorrect-information",
      guidance: "Explain what is wrong",
    },
    {
      category: "source-moved-or-unavailable",
      guidance: "Share the last known source",
    },
  ]) {
    await page.getByLabel("What is wrong?").selectOption(branch.category);
    await expect(page.getByText(branch.guidance)).toBeVisible();
  }

  await page.goto(sitePath("/help/report-kit/?kit=unknown-kit"));
  await expect(page.getByLabel("Kit", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.locator(".help-error-summary")).toContainText(
    "Select a published Kit.",
  );

  await page.goto(sitePath("/help/report-kit/?kit=aiko-s-loadout-30"));
  for (const branch of [
    {
      category: "compatibility-problem",
      label: "Affected Kit projects",
    },
    { category: "duplicate-kit", label: "Other Kit" },
  ]) {
    await page.getByLabel("What is wrong?").selectOption(branch.category);
    await expect(page.getByText(branch.label, { exact: true })).toBeVisible();
  }
  await page
    .getByLabel("What is wrong?")
    .selectOption("unsafe-or-malicious-included-project");
  await expect(
    page.getByRole("link", { name: "Report the project listing instead" }),
  ).toBeVisible();
  await page
    .getByLabel("What is wrong?")
    .selectOption("author-or-attribution-concern");
  await expect(
    page.getByText("Explain what author or source information is wrong."),
  ).toBeVisible();
});

test("covers owner source-move and delist review branches", async ({
  page,
}) => {
  await page.goto(
    sitePath("/help/manage-project/?project=mentallyquill-directive"),
  );
  await page.getByRole("radio", { name: "Update repository location" }).check();
  await page
    .getByLabel("Public GitHub repository URL")
    .fill("https://github.com/MentallyQuill/Directive-Renamed");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByText("After: repository", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back and edit" }).click();
  await expect(page.getByLabel("Public GitHub repository URL")).toHaveValue(
    "https://github.com/MentallyQuill/Directive-Renamed",
  );

  await page.getByRole("radio", { name: "Delist this project" }).check();
  await page
    .getByLabel("I am requesting that Tavernary delist this project")
    .check();
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByText("After: visibility", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("disabled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});
