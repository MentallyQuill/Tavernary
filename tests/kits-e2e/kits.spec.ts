import { expect, test } from "@playwright/test";

async function openKits(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);
}

function cards(page: import("@playwright/test").Page) {
  return page.locator(".kit-card");
}

async function expectMobileTarget(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  expect(box, "mobile target must have a bounding box").not.toBeNull();
  expect(box!.width, "mobile target width").toBeGreaterThanOrEqual(44);
  expect(box!.height, "mobile target height").toBeGreaterThanOrEqual(44);
}

async function longPress(
  page: import("@playwright/test").Page,
  locator: import("@playwright/test").Locator,
  duration = 500,
) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box, "long-press target must have a bounding box").not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  await page.mouse.up();
}

test("navigates, restores URLs, searches every indexed Kit field, and sorts", async ({
  page,
}) => {
  await openKits(page);
  const navigation = page.locator(".category-navigation button");
  await expect(navigation.nth(0)).toContainText("Kits");
  await expect(navigation.nth(1)).toContainText("All Projects");
  await expect(cards(page)).toHaveCount(8);

  const search = page.getByRole("searchbox", { name: "Search projects" });
  for (const term of [
    "Five Line",
    "distinctive phrase",
    "alpha-author",
    "Fixture Tool 04",
    "SillyTavern",
    "Memory",
  ]) {
    await search.fill(term);
    await expect(cards(page).first()).toBeVisible();
  }
  await search.fill("");

  const sort = page.getByRole("combobox", { name: "Sort Kits" });
  await expect(sort).toHaveValue("trending");
  for (const value of ["newest", "updated", "alphabetical"]) {
    await sort.selectOption(value);
    await expect(page).toHaveURL(new RegExp(`sort=${value}`));
  }
  await sort.selectOption("alphabetical");
  await expect(cards(page).first()).toContainText("Alpha Kit");

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await expect(page).toHaveURL(/kit=alpha-kit-101/);
  await page.reload();
  await expect(
    page.getByLabel("Kit Builder").getByRole("heading", { name: "Alpha Kit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.locator(".project-card")).toHaveCount(50);
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(
    page.getByLabel("Kit Builder").getByRole("heading", { name: "Alpha Kit" }),
  ).toBeVisible();
});

test("desktop Kit Builder stays flush with the viewport after the header scrolls away", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKits(page);
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(116);

  const panelEdges = await page
    .locator(".kit-builder-panel")
    .evaluate((panel) => {
      const bounds = panel.getBoundingClientRect();
      return {
        top: bounds.top,
        bottomGap: window.innerHeight - bounds.bottom,
      };
    });

  expect(panelEdges.top).toBeCloseTo(0, 0);
  expect(panelEdges.bottomGap).toBeCloseTo(0, 0);
});

test("applies every Kit filter and clears them", async ({ page }) => {
  await openKits(page);
  const filter = page.getByRole("complementary", { name: "Kit filters" });

  await filter.getByLabel("SillyTavern").check();
  await expect(cards(page).first()).toBeVisible();
  await filter.getByLabel("Memory").check();
  await expect(cards(page).first()).toBeVisible();
  await filter.getByLabel("Includes project").fill("fixture-tool-04");
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByLabel("Minimum projects").fill("4");
  await expect(page.getByRole("article", { name: "Alpha Kit" })).toHaveCount(0);
  await filter.getByLabel("Minimum projects").fill("3");
  await filter.getByLabel("Maximum projects").fill("3");
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByText("Tavernary Pick only").click();
  await expect(cards(page)).toHaveCount(1);
  await filter.getByRole("button", { name: "Clear Kit filters" }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("mobile Kit filters are visible, dismissible, and mode-local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);

  const filterButton = page.getByRole("button", { name: "Open filters" });
  await filterButton.click();
  const kitFilters = page.getByRole("dialog", { name: "Kit filters" });
  await expect(kitFilters).toBeVisible();
  await kitFilters.getByText("Tavernary Pick only").click();
  await expect(filterButton.locator("b")).toHaveText("1");
  await kitFilters.getByRole("button", { name: "Close Kit filters" }).click();
  await expect(filterButton).toBeFocused();

  await filterButton.click();
  await page.evaluate(() => {
    window.history.pushState(null, "", window.location.pathname);
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await filterButton.click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Kit filters" })).toHaveCount(
    0,
  );
});

test("inspects stacks, preserves caution rows, and builds contribution URLs", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => {
        throw new Error("Web Share must not be called");
      },
    });
  });
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openKits(page);
  await page.evaluate(() => {
    window.open = (url) => {
      window.sessionStorage.setItem("opened-url", String(url));
      return null;
    };
  });

  const longDescription = page
    .getByRole("article")
    .filter({ hasText: "Five Line Kit" })
    .locator(".kit-card-description");
  expect(
    await longDescription.evaluate(
      (element) => getComputedStyle(element).webkitLineClamp,
    ),
  ).toBe("5");

  await page
    .getByRole("article", { name: "Alpha Kit" })
    .getByRole("button", { name: "Report Kit" })
    .click();
  const cardReport = new URL(
    (await page.evaluate(() => sessionStorage.getItem("opened-url")))!,
  );
  expect(cardReport.searchParams.get("kit-id")).toBe("alpha-kit-101");
  expect(cardReport.searchParams.get("share-url")).toContain(
    "kit=alpha-kit-101",
  );

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const first = page.getByRole("button", {
    name: "Fixture Frontend project details",
  });
  const second = page.getByRole("button", {
    name: "Fixture Tool 02 project details",
  });
  await first.click();
  await second.click();
  await expect(first).toHaveAttribute("aria-expanded", "false");
  await expect(second).toHaveAttribute("aria-expanded", "true");

  await page
    .getByRole("button", { name: "Copy link", exact: true })
    .last()
    .click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("mode=kits");
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("kit=alpha-kit-101");

  const report = page.getByRole("link", { name: "Report Kit" });
  const withdrawal = page.getByRole("link", { name: "Request withdrawal" });
  for (const link of [report, withdrawal]) {
    const url = new URL((await link.getAttribute("href"))!);
    expect(url.searchParams.get("kit-id")).toBe("alpha-kit-101");
    expect(url.searchParams.get("share-url")).toContain("kit=alpha-kit-101");
  }

  await page.getByRole("button", { name: "Open Flagged Stack" }).click();
  await expect(
    page
      .getByRole("article", { name: "Flagged Stack" })
      .getByText("Contains flagged projects"),
  ).toBeVisible();
  const flagged = page.locator(".kit-project-stack li.flagged");
  await expect(flagged).toContainText("Fixture Flagged Tool");
  await expect(flagged.locator("a")).toHaveCount(0);
});

test("batches projects without interrupting browse state and preserves draft access", async ({
  page,
}) => {
  await openKits(page);
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await expect(page.getByRole("button", { name: /Add .* to Kit/ })).toHaveCount(
    0,
  );
  const startingUrl = page.url();
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

  const dock = page.getByRole("region", { name: "3 projects selected" });
  await expect(dock).toBeVisible();
  await expect(dock.locator(".selection-count")).toHaveText("3");
  const scrollBeforeAdd = await page.evaluate(() => window.scrollY);
  await dock.getByRole("button", { name: "Add to Kit" }).click();

  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeAdd);
  expect(
    await page.evaluate(() =>
      document
        .querySelector(".kit-builder-panel")
        ?.contains(document.activeElement),
    ),
  ).toBe(false);
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("Fixture Tool 10");
  await longPress(page, page.locator(".project-card-shell").first());
  await page.getByRole("button", { name: "Add to Kit" }).click();
  await expect(search).toHaveValue("Fixture Tool 10");
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    })
    .click();
  await expect(page.locator(".kit-project-count")).toHaveText("4 projects");

  await page.getByRole("button", { name: "Collapse Kit Builder" }).click();
  await search.fill("");
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    })
    .click();

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(page.getByRole("heading", { name: "Create Kit" })).toBeVisible();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Edit Kit" })).toBeVisible();

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("desktop catalog drag preserves an active batch selection", async ({
  page,
}) => {
  await openKits(page);
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();

  const selectedShell = page.locator(".project-card-shell").filter({
    has: page.getByRole("link", { name: "Fixture Tool 02", exact: true }),
  });
  await longPress(page, selectedShell);
  await expect(
    page.getByRole("region", { name: "1 projects selected" }),
  ).toBeVisible();

  const dragHandle = page.getByRole("button", {
    name: "Drag Fixture Tool 03 into Kit",
  });
  await dragHandle.hover();
  const sourceBox = (await dragHandle.boundingBox())!;
  const stackTarget = page.locator('[data-kit-drop-target="stack"]');
  const targetBox = (await stackTarget.boundingBox())!;
  await page.mouse.move(
    sourceBox.x + sourceBox.width / 2,
    sourceBox.y + sourceBox.height / 2,
  );
  await page.mouse.down();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 5 },
  );
  await page.mouse.up();

  await expect(
    page.getByRole("region", { name: "1 projects selected" }),
  ).toBeVisible();
  await expect(selectedShell).toHaveClass(/selected/);
  await expect(
    page
      .locator(".project-card-shell")
      .filter({
        has: page.getByRole("link", {
          name: "Fixture Tool 03",
          exact: true,
        }),
      })
      .getByText("In Kit"),
  ).toBeVisible();
});

test("complete desktop direct-manipulation workflow keeps every card reachable", async ({
  page,
}) => {
  await openKits(page);
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();

  async function dragTo(
    source: import("@playwright/test").Locator,
    target: import("@playwright/test").Locator,
    release = true,
    targetYRatio = 0.5,
  ) {
    await target.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    const sourceBox = (await source.boundingBox())!;
    await page.mouse.move(
      sourceBox.x + sourceBox.width / 2,
      sourceBox.y + sourceBox.height / 2,
    );
    await page.mouse.down();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    );
    const targetBox = (await target.boundingBox())!;
    await page.mouse.move(
      targetBox.x + targetBox.width / 2,
      targetBox.y + targetBox.height * targetYRatio,
      { steps: 5 },
    );
    if (release) await page.mouse.up();
  }

  const frontendTarget = page.locator('[data-kit-drop-target="frontend"]');
  const stackTarget = page.locator('[data-kit-drop-target="stack"]');
  await dragTo(
    page.getByRole("button", { name: "Drag Fixture Frontend into Kit" }),
    frontendTarget,
  );
  await expect(page.getByRole("region", { name: "Frontend" })).toContainText(
    "Fixture Frontend",
  );

  for (const name of ["Fixture Tool 02", "Fixture Tool 03"]) {
    await dragTo(
      page.getByRole("button", { name: `Drag ${name} into Kit` }),
      stackTarget,
      false,
    );
    await expect(page.getByText("Release to add")).toBeVisible();
    await page.mouse.up();
    await expect(
      page
        .locator(".project-card-shell")
        .filter({ has: page.getByRole("link", { name, exact: true }) })
        .getByText("In Kit"),
    ).toBeVisible();
  }
  const rows = page.locator(".kit-builder-row");
  await expect(rows).toHaveCount(2);

  await dragTo(
    page.getByRole("button", { name: "Drag Fixture Frontend B into Kit" }),
    frontendTarget,
    false,
  );
  await expect(
    page.getByText("Release to replace Fixture Frontend"),
  ).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByRole("region", { name: "Frontend" }).locator("strong"),
  ).toHaveText("Fixture Frontend B");

  const toolThreeHandle = page.getByRole("button", {
    name: "Drag Fixture Tool 03 to reorder or remove",
  });
  await dragTo(toolThreeHandle, rows.nth(0), true, 0.25);
  await expect(rows.nth(0)).toContainText("Fixture Tool 03");

  const toolTwoHandle = page.getByRole("button", {
    name: "Drag Fixture Tool 02 to reorder or remove",
  });
  const handleBox = (await toolTwoHandle.boundingBox())!;
  const editor = page.locator(".kit-builder");
  const editorBox = (await editor.boundingBox())!;
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(editorBox.x - 8, editorBox.y + 80, { steps: 4 });
  await expect(page.getByText("Release to remove")).toBeVisible();
  await page.mouse.move(editorBox.x + 40, editorBox.y + 80, { steps: 3 });
  await expect(page.getByText("Release to remove")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(
    page.getByRole("button", { name: "Remove Fixture Tool 02" }),
  ).toBeVisible();

  const retryHandle = page.getByRole("button", {
    name: "Drag Fixture Tool 02 to reorder or remove",
  });
  await retryHandle.hover();
  const retryBox = (await retryHandle.boundingBox())!;
  await page.mouse.move(
    retryBox.x + retryBox.width / 2,
    retryBox.y + retryBox.height / 2,
  );
  await page.mouse.down();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await page.mouse.move(editorBox.x - 8, editorBox.y + 80, { steps: 4 });
  await expect(page.getByText("Release to remove")).toBeVisible();
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Remove Fixture Tool 02" }),
  ).toHaveCount(0);

  const workspaceBox = (await page
    .locator(".kit-builder-panel")
    .boundingBox())!;
  const catalogMainBox = (await page.locator(".catalog-main").boundingBox())!;
  expect(workspaceBox.x).toBeGreaterThanOrEqual(
    catalogMainBox.x + catalogMainBox.width - 1,
  );
  expect(
    await page.locator(".project-card").evaluateAll((projectCards) => {
      const workspace = document
        .querySelector(".kit-builder-panel")!
        .getBoundingClientRect();
      return projectCards.every(
        (card) => card.getBoundingClientRect().right <= workspace.left + 1,
      );
    }),
  ).toBe(true);
});

test("mobile workspace traps focus, returns it, and exposes touch handles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );
  const opener = page.getByRole("button", { name: "Open Alpha Kit" });
  await opener.click();
  await expect(
    page.getByRole("complementary", { name: "Kit Builder" }),
  ).toHaveCount(0);
  const dialog = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Shift+Tab");
  expect(
    await dialog.evaluate((element) =>
      element.contains(document.activeElement),
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(opener).toBeFocused();

  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();
  await expect(
    page.getByRole("button", { name: /Drag .* to reorder$/ }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Move .* (?:up|down)/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /Drag .* to remove$/ }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("mobile 50-project builder keeps sticky controls usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();

  const dialog = page.getByRole("dialog", { name: "Kit Builder" });
  const body = dialog.locator(".kit-builder-panel-body");
  const header = dialog.locator(".kit-builder-panel-header");
  const footer = dialog.locator(".kit-builder-footer");
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect(header).toBeInViewport();
  await expect(footer).toBeInViewport();
  await expect(page.getByRole("button", { name: "Submit Kit" })).toBeEnabled();
  expect(
    await body.evaluate((element) => element.scrollWidth),
  ).toBeLessThanOrEqual(await body.evaluate((element) => element.clientWidth));
});

test("mobile Kit cards, filters, and inspection meet the touch contract", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();

  const alphaCard = page.getByRole("article", { name: "Alpha Kit" });
  await expectMobileTarget(
    alphaCard.getByRole("button", { name: "Copy link" }),
  );
  await expectMobileTarget(
    alphaCard.getByRole("button", { name: "Report Kit" }),
  );

  await page.getByRole("button", { name: "Open filters" }).click();
  const filters = page.getByRole("dialog", { name: "Kit filters" });
  await expectMobileTarget(
    filters.getByRole("button", { name: "Close Kit filters" }),
  );
  await expectMobileTarget(filters.getByText("Tavernary Pick only"));
  await expectMobileTarget(
    filters.getByRole("button", { name: "Clear Kit filters" }),
  );
  await filters.getByRole("button", { name: "Close Kit filters" }).click();

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const dialog = page.getByRole("dialog", { name: "Kit Builder" });
  for (const action of ["Duplicate", "Edit", "Copy link"]) {
    await expectMobileTarget(dialog.getByRole("button", { name: action }));
  }
  for (const action of ["Report Kit", "Request withdrawal"]) {
    await expectMobileTarget(dialog.getByRole("link", { name: action }));
  }
  await expectMobileTarget(
    dialog.getByRole("button", {
      name: "Fixture Frontend project details",
    }),
  );
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
});

test("complete mobile direct-manipulation workflow stays touch-safe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );

  const filterButton = page.getByRole("button", { name: "Open filters" });
  await filterButton.click();
  const filters = page.getByRole("dialog", { name: "Kit filters" });
  await filters.getByText("Tavernary Pick only").click();
  await expect(cards(page)).toHaveCount(1);
  await filters.getByRole("button", { name: "Clear Kit filters" }).click();
  await expect(cards(page)).toHaveCount(8);
  await filters.getByRole("button", { name: "Close Kit filters" }).click();
  await expect(filterButton).toBeFocused();

  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 0 projects in draft",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  const extensionShells = page
    .locator(".project-card-shell")
    .filter({ has: page.locator(".project-card.kind-extension") });
  const firstCardBox = (await extensionShells.first().boundingBox())!;
  await page.mouse.move(
    firstCardBox.x + firstCardBox.width / 2,
    firstCardBox.y + firstCardBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    firstCardBox.x + firstCardBox.width / 2,
    firstCardBox.y + firstCardBox.height / 2 + 20,
  );
  await page.mouse.wheel(0, 160);
  await page.waitForTimeout(500);
  await page.mouse.up();
  await expect(page.locator(".project-selection-dock")).toHaveCount(0);

  await longPress(page, extensionShells.nth(0));
  await extensionShells.nth(1).click();
  await extensionShells.nth(2).click();
  const selectionDock = page.getByRole("region", {
    name: "3 projects selected",
  });
  await expect(selectionDock).toBeVisible();
  await expectMobileTarget(
    selectionDock.getByRole("button", { name: "Cancel" }),
  );
  await expectMobileTarget(
    selectionDock.getByRole("button", { name: "Add to Kit" }),
  );
  await selectionDock.getByRole("button", { name: "Add to Kit" }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeVisible();
  await page.waitForTimeout(1700);
  await longPress(
    page,
    page.locator(".project-card-shell:not(.in-draft)").first(),
  );
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add to Kit" }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    })
    .click();

  const rows = page.locator(".kit-builder-row");
  const secondProject = (await rows.nth(1).locator("strong").textContent())!;
  const secondHandle = rows.nth(1).getByRole("button", {
    name: `Drag ${secondProject} to reorder`,
  });
  const handleBox = (await secondHandle.boundingBox())!;
  const firstBox = (await rows.nth(0).boundingBox())!;
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(firstBox.x + firstBox.width / 2, firstBox.y + 2, {
    steps: 4,
  });
  await page.mouse.up();
  await expect(rows.nth(0).locator("strong")).toHaveText(secondProject);
  await rows
    .nth(0)
    .getByRole("button", { name: `Remove ${secondProject}` })
    .click();
  await expect(
    page.getByRole("button", { name: `Remove ${secondProject}` }),
  ).toHaveCount(0);
  await expect(page.getByText("Undo")).toHaveCount(0);
  await expect(page.getByText(/Drag here to remove/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  const alphaOpener = page.getByRole("button", { name: "Open Alpha Kit" });
  await alphaOpener.click();
  await expect(
    page
      .getByRole("dialog", { name: "Kit Builder" })
      .getByRole("heading", { name: "Alpha Kit" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(alphaOpener).toBeFocused();
});
