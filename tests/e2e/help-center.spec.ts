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

function currentPathname(page: import("@playwright/test").Page) {
  return new URL(page.url()).pathname.replace(/\/$/u, "");
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
    page.getByRole("heading", { name: "Help", exact: true }),
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
    .getByLabel("How can the problem be reproduced?")
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

test("spaces every interactive Help form without mobile overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });

  for (const path of [
    "/help/manage-project/",
    "/help/report-project/",
    "/help/report-website/",
    "/help/report-kit/",
    "/help/withdraw-kit/",
    "/help/other/",
  ]) {
    await page.goto(sitePath(path));

    const form = page.locator(".help-form");
    await expect(form).toBeVisible();
    const gaps = await form.evaluate((element) => {
      const visibleChildren = [...element.children].filter(
        (child): child is HTMLElement =>
          child instanceof HTMLElement &&
          window.getComputedStyle(child).display !== "none",
      );
      return visibleChildren.slice(1).map((child, index) => {
        const previous = visibleChildren[index]!.getBoundingClientRect();
        const current = child.getBoundingClientRect();
        return current.top - previous.bottom;
      });
    });

    expect(
      gaps.length,
      `${path} should render multiple form sections`,
    ).toBeGreaterThan(0);
    expect(
      gaps.every((gap) => gap >= 16),
      `${path} direct form gaps: ${gaps.join(", ")}`,
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
      `${path} horizontal overflow`,
    ).toBeLessThanOrEqual(0);
  }
});

test("searches and selects owner projects in one responsive combobox", async ({
  page,
}) => {
  await page.goto(sitePath("/help/manage-project/"));
  const picker = page.getByRole("combobox", { name: "Project" });

  await picker.click();
  expect(await page.getByRole("option").count()).toBeGreaterThan(300);

  await picker.fill("mentallyquill-directive");
  await expect(
    page.getByRole("option", {
      name: /Directive.*mentallyquill-directive/iu,
    }),
  ).toBeVisible();
  await picker.press("ArrowDown");
  await picker.press("Enter");
  await expect(picker).toHaveValue("Directive");
  await expect(
    page.getByRole("radio", { name: "Edit card details" }),
  ).toBeVisible();

  await page.setViewportSize({ width: 320, height: 720 });
  await picker.fill("");
  await expect(page.getByRole("listbox")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("renders one clean Kit-author routing reminder", async ({ page }) => {
  await page.goto(sitePath("/help/report-kit/"));

  await expect(
    page.locator("p").filter({ hasText: "Are you the Kit author?" }),
  ).toHaveCount(1);
  await expect(page.locator("body")).not.toContainText("â");
});

test("selects project reports through Help and preserves contextual Kit reports", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page
    .getByRole("navigation", { name: "Site actions" })
    .getByRole("link", { name: "Help" })
    .click();
  await page.getByRole("link", { name: "Report a project listing" }).click();
  await expect
    .poll(() => currentPathname(page))
    .toBe(sitePath("/help/report-project"));
  await page
    .getByLabel("Project", { exact: true })
    .selectOption("aikohanasaki-aikobots");
  await expect(page.getByLabel("Project", { exact: true })).toHaveValue(
    "aikohanasaki-aikobots",
  );

  await page.goto(sitePath("/?mode=kits"));
  const kit = page.getByRole("article", { name: "Aiko's Loadout" });
  await kit.getByRole("button", { name: "Report Kit" }).click();
  await expect
    .poll(() => currentPathname(page))
    .toBe(sitePath("/help/report-kit"));
  await expect
    .poll(() => new URL(page.url()).searchParams.get("kit"))
    .toBe("aiko-s-loadout-30");
  await expect(page.getByLabel("Kit", { exact: true })).toHaveValue(
    "aiko-s-loadout-30",
  );
});

test("keeps the catalog Kit action aligned with the license row", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  await page
    .getByRole("searchbox", { name: "Search projects" })
    .fill("WorldInfoPresets");

  const project = page.locator(".project-card-shell").filter({
    has: page.getByRole("heading", { name: "WorldInfoPresets", exact: true }),
  });
  await expect(
    project.getByRole("link", { name: "Report WorldInfoPresets" }),
  ).toHaveCount(0);
  const [kit, license] = await Promise.all([
    project
      .getByRole("button", { name: "Add WorldInfoPresets to Kit" })
      .boundingBox(),
    project.locator(".card-utility .license").boundingBox(),
  ]);
  expect(kit).not.toBeNull();
  expect(license).not.toBeNull();
  if (!kit || !license) return;

  const kitCenter = kit.y + kit.height / 2;
  const licenseCenter = license.y + license.height / 2;
  expect(Math.abs(kitCenter - licenseCenter)).toBeLessThanOrEqual(4);
});

test("takes a Kit report from source control through validation, review, cancel, and handoff", async ({
  page,
}) => {
  await page.goto(sitePath("/?mode=kits"));
  await page
    .getByRole("article", { name: "Aiko's Loadout" })
    .getByRole("button", { name: "Report Kit" })
    .click();
  await expect
    .poll(() => currentPathname(page))
    .toBe(sitePath("/help/report-kit"));
  await expect(page.getByLabel("What is wrong?")).toBeVisible();
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

test("withdraws a selected Kit through Tavernary review and a versioned manifest", async ({
  page,
}) => {
  await page.goto(sitePath("/help/withdraw-kit/?kit=aiko-s-loadout-30"));
  await interceptHelpWindow(page);

  await expect(page.getByLabel("Kit", { exact: true })).toHaveValue(
    "aiko-s-loadout-30",
  );
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.locator(".help-error-summary")).toContainText(
    "Confirm that you request withdrawal of this Kit.",
  );
  await page
    .getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    })
    .check();
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your public request" }),
  ).toBeVisible();
  await expect(page.getByText("aiko-s-loadout-30")).toBeVisible();
  await page.getByRole("button", { name: "Back and edit" }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "I request withdrawal of this Kit",
    }),
  ).toBeChecked();

  await page.getByRole("button", { name: "Review request" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();
  const opened = new URL(
    await page.evaluate(
      () => (window as Window & { openedHelpUrl?: string }).openedHelpUrl ?? "",
    ),
  );
  expect(opened.searchParams.get("template")).toBe("07-kit-withdrawal.yml");
  expect(
    JSON.parse(opened.searchParams.get("withdrawal-manifest") ?? ""),
  ).toEqual({
    schema_version: 1,
    request_kind: "kit-withdrawal",
    kit_id: "aiko-s-loadout-30",
    confirmation: true,
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

test("covers owner source-move and delist-source review branches", async ({
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

  await page
    .getByRole("radio", { name: "Permanently delist this source" })
    .check();
  await page.getByRole("button", { name: "Review request" }).click();
  await page
    .getByLabel("Type MentallyQuill/Directive to confirm permanent delisting.")
    .fill("MentallyQuill/Directive");
  await page.getByRole("button", { name: "Permanently delist source" }).click();
  await expect(
    page.getByText(
      "This permanently delists MentallyQuill/Directive and every card from that source.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Permanent source delisting")).toBeVisible();
  await page.getByRole("button", { name: "Cancel" }).click();
});
