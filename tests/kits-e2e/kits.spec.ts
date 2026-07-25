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

async function selectProject(
  page: import("@playwright/test").Page,
  projectName: string,
) {
  await page.getByRole("button", { name: `Add ${projectName} to Kit` }).click();
}

async function verifyUnifiedSelectionFlow(
  page: import("@playwright/test").Page,
  phone: boolean,
) {
  const frontendLink = page.getByRole("link", {
    name: "Fixture Frontend",
    exact: true,
  });
  await expect(frontendLink).toHaveAttribute(
    "href",
    "https://github.com/fixture/fixture-frontend",
  );

  await selectProject(page, "Fixture Frontend");
  if (phone) {
    await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
      0,
    );
  } else {
    await expect(
      page.getByRole("complementary", { name: "Kit Builder" }),
    ).toBeVisible();
  }
  await expect(
    page.getByRole("region", { name: "1 project selected" }),
  ).toBeVisible();
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");

  await expect(
    page.getByRole("region", { name: "3 projects selected" }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Remove Fixture Tool 03 from selection",
    })
    .click();
  await expect(
    page.getByRole("region", { name: "2 projects selected" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Add 2 projects to Kit" }).click();
  const catalogToolControl = page
    .getByRole("region", { name: "Project catalog" })
    .getByRole("button", { name: "Remove Fixture Tool 02 from Kit" });
  await expect(catalogToolControl).toBeVisible();
  await expect(
    page
      .locator(".project-card-shell.in-draft")
      .filter({ has: frontendLink })
      .getByText("In Kit"),
  ).toBeVisible();

  await catalogToolControl.click();
  await expect(
    page.getByRole("button", { name: "Add Fixture Tool 02 to Kit" }),
  ).toBeVisible();

  if (phone) {
    await page
      .getByRole("button", { name: /Open Kit Builder, 1 project in draft/ })
      .click();
  }
  await page
    .getByRole("region", { name: "Frontend" })
    .getByRole("button", { name: "Remove Fixture Frontend from Kit" })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
  ).toBeVisible();
}

test("filled desktop actions use dark ink and card Kit glyphs are centered in a square", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const expectedInk = "rgb(7, 24, 29)";
  const submitProject = page.getByRole("link", { name: "Submit Project" });
  const createKit = page.getByRole("button", { name: "Create new Kit" });
  const addProject = page.locator(".project-kit-control").first();
  const face = addProject.locator(".project-kit-control-face");
  const glyph = face.locator('[data-kit-glyph="add"]');

  await expect(submitProject).toHaveCSS("color", expectedInk);
  await expect(createKit).toHaveCSS("color", expectedInk);
  await expect(face).toHaveCSS("color", expectedInk);

  const geometry = await face.evaluate((element) => {
    const glyphElement = element.querySelector<SVGElement>(
      '[data-kit-glyph="add"]',
    );
    if (!glyphElement) throw new Error("Card Kit glyph is missing");
    const faceBounds = element.getBoundingClientRect();
    const glyphBounds = glyphElement.getBoundingClientRect();
    return {
      faceWidth: faceBounds.width,
      faceHeight: faceBounds.height,
      faceCenterX: faceBounds.left + faceBounds.width / 2,
      faceCenterY: faceBounds.top + faceBounds.height / 2,
      glyphCenterX: glyphBounds.left + glyphBounds.width / 2,
      glyphCenterY: glyphBounds.top + glyphBounds.height / 2,
      boxShadow: getComputedStyle(element).boxShadow,
    };
  });

  expect(geometry.faceWidth).toBe(28);
  expect(geometry.faceHeight).toBe(28);
  expect(geometry.boxShadow).toBe("none");
  expect(geometry.glyphCenterX).toBeCloseTo(geometry.faceCenterX, 5);
  expect(geometry.glyphCenterY).toBeCloseTo(geometry.faceCenterY, 5);
  await expect(glyph).toHaveAttribute("viewBox", "0 0 12 12");

  await addProject.click();
  const addSelection = page.getByRole("button", {
    name: "Add 1 project to Kit",
  });
  await expect(addSelection).toHaveCSS("color", expectedInk);
  await addSelection.click();
  await expect(page.getByRole("button", { name: "Submit Kit" })).toHaveCSS(
    "color",
    expectedInk,
  );
});

test("desktop Kit Builder open and close controls share one 36-pixel geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const collapse = page.getByRole("button", {
    name: "Collapse Kit Builder",
  });
  const icon = collapse.locator('[data-icon="kit-builder"]');
  await expect(icon).toBeVisible();

  const styles = await collapse.evaluate((button) => {
    const iconElement = button.querySelector('[data-icon="kit-builder"]');
    if (!(iconElement instanceof SVGElement)) {
      throw new Error("Kit Builder collapse icon is missing");
    }

    const buttonStyle = getComputedStyle(button);
    const iconStyle = getComputedStyle(iconElement);
    return {
      buttonWidth: buttonStyle.width,
      buttonHeight: buttonStyle.height,
      buttonBackground: buttonStyle.backgroundColor,
      buttonBorder: buttonStyle.borderTopColor,
      iconWidth: iconStyle.width,
      iconHeight: iconStyle.height,
      iconColor: iconStyle.color,
      iconTransform: iconStyle.transform,
    };
  });

  expect(styles).toEqual({
    buttonWidth: "36px",
    buttonHeight: "36px",
    buttonBackground: "rgba(0, 0, 0, 0)",
    buttonBorder: "rgba(0, 0, 0, 0)",
    iconWidth: "26px",
    iconHeight: "26px",
    iconColor: "rgb(225, 138, 36)",
    iconTransform: "matrix(-1, 0, 0, 1, 0, 0)",
  });

  await collapse.click();
  const open = page.getByRole("button", { name: "Open Kit Builder" });
  await expect(open).toBeVisible();
  const openBox = await open.boundingBox();
  expect(openBox?.width).toBe(36);
  expect(openBox?.height).toBe(36);
});

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

  await expect
    .poll(() =>
      page.locator(".kit-builder-panel").evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        return Math.round(window.innerHeight - bounds.bottom);
      }),
    )
    .toBe(0);

  await page.getByRole("button", { name: "All Projects", exact: true }).click();
  await page.evaluate(() => window.scrollTo(0, 300));
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(116);
  await expect
    .poll(() =>
      page.locator(".kit-builder-panel").evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        return Math.round(window.innerHeight - bounds.bottom);
      }),
    )
    .toBe(0);

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

test("desktop long Kit stacks scroll through the final row and submit controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Large Stack" }).click();
  await page.getByRole("button", { name: "Duplicate" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  const body = panel.locator(".kit-builder-panel-body");
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });

  await expect(panel.locator(".kit-builder-row").last()).toBeInViewport();
  await expect(panel.locator(".kit-builder-footer")).toBeInViewport();
  await expect(panel.getByRole("button", { name: "Submit Kit" })).toBeVisible();
});

test("compact cards keep the Kit control right-aligned and reserve an ellipsis gutter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto("/");

  const shell = page.locator(".project-card-shell").first();
  const license = shell.locator(".license");
  const control = shell.locator(".project-kit-control-hit");
  const standardLicenseBox = await license.boundingBox();
  const standardControlBox = await control.boundingBox();
  expect(standardLicenseBox).not.toBeNull();
  expect(standardControlBox).not.toBeNull();
  expect(standardLicenseBox!.x).toBeLessThan(standardControlBox!.x);

  await page.getByRole("button", { name: "Use compact cards" }).click();
  await expect(license).toBeHidden();

  const compactStyles = await shell.evaluate((element) => {
    const title = element.querySelector("h2");
    const summary = element.querySelector(".card-summary");
    const controlHit = element.querySelector(".project-kit-control-hit");
    if (!title || !summary || !controlHit) {
      throw new Error("Compact card anatomy is incomplete");
    }
    const titleStyle = getComputedStyle(title);
    const summaryStyle = getComputedStyle(summary);
    const shellBounds = element.getBoundingClientRect();
    const controlBounds = controlHit.getBoundingClientRect();
    return {
      titlePaddingRight: titleStyle.paddingRight,
      summaryPaddingRight: summaryStyle.paddingRight,
      summaryOverflow: summaryStyle.overflow,
      summaryTextOverflow: summaryStyle.textOverflow,
      controlRightGap: Math.round(shellBounds.right - controlBounds.right),
    };
  });

  expect(compactStyles).toEqual({
    titlePaddingRight: "44px",
    summaryPaddingRight: "44px",
    summaryOverflow: "hidden",
    summaryTextOverflow: "ellipsis",
    controlRightGap: 4,
  });
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
  await expect(
    page.getByRole("button", { name: /Add .* to Kit/ }).first(),
  ).toBeVisible();
  const startingUrl = page.url();
  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");

  const dock = page.getByRole("region", { name: "3 projects selected" });
  await expect(dock).toBeVisible();
  await expect(dock.locator(".selection-count")).toHaveText("3");
  const scrollBeforeAdd = await page.evaluate(() => window.scrollY);
  await dock.getByRole("button", { name: "Add 3 projects to Kit" }).click();

  expect(page.url()).toBe(startingUrl);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBeforeAdd);
  expect(
    await page.evaluate(() =>
      document
        .querySelector(".kit-builder-panel")
        ?.contains(document.activeElement),
    ),
  ).toBe(false);
  await expect(page.locator(".kit-project-count")).toHaveText("3 projects");

  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("Fixture Tool 10");
  await selectProject(page, "Fixture Tool 10");
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
  await expect(search).toHaveValue("Fixture Tool 10");
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

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} uses the unified explicit Kit selection flow`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    if (viewport.width <= 760) {
      await expectMobileTarget(
        page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
      );
    }
    await verifyUnifiedSelectionFlow(page, viewport.width <= 760);
    await expect(
      page.getByRole("button", { name: /Drag .* into Kit/ }),
    ).toHaveCount(0);
  });
}

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

  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");
  await page.getByRole("button", { name: "Add 3 projects to Kit" }).click();
  await expect(page.getByRole("region", { name: "Frontend" })).toContainText(
    "Fixture Frontend",
  );

  for (const name of ["Fixture Tool 02", "Fixture Tool 03"]) {
    await expect(
      page
        .locator(".project-card-shell")
        .filter({ has: page.getByRole("link", { name, exact: true }) })
        .getByText("In Kit"),
    ).toBeVisible();
  }
  const rows = page.locator(".kit-builder-row");
  await expect(rows).toHaveCount(2);

  await selectProject(page, "Fixture Frontend B");
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
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
  const removePointer = { x: editorBox.x - 8, y: editorBox.y + 80 };
  await page.mouse.move(removePointer.x, removePointer.y, { steps: 4 });
  await expect(page.getByText("Release to remove")).toBeVisible();
  const ghostHandleBox = await page
    .locator(".kit-drag-ghost-handle")
    .boundingBox();
  expect(ghostHandleBox).not.toBeNull();
  expect(
    ghostHandleBox!.x + ghostHandleBox!.width / 2,
    "drag pointer remains centered on the ghost handle",
  ).toBeCloseTo(removePointer.x, 0);
  expect(
    ghostHandleBox!.y + ghostHandleBox!.height / 2,
    "drag pointer remains centered on the ghost handle",
  ).toBeCloseTo(removePointer.y, 0);
  await page.mouse.move(editorBox.x + 40, editorBox.y + 80, { steps: 3 });
  await expect(page.getByText("Release to remove")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
  await expect(
    page.locator(".kit-builder").getByRole("button", {
      name: "Remove Fixture Tool 02 from Kit",
    }),
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
    page.locator(".kit-builder").getByRole("button", {
      name: "Remove Fixture Tool 02 from Kit",
    }),
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
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");
  await selectProject(page, "Fixture Tool 04");
  const selectionDock = page.getByRole("region", {
    name: "3 projects selected",
  });
  await expect(selectionDock).toBeVisible();
  await expectMobileTarget(
    selectionDock.getByRole("button", { name: "Cancel" }),
  );
  await expectMobileTarget(
    selectionDock.getByRole("button", { name: "Add 3 projects to Kit" }),
  );
  await selectionDock
    .getByRole("button", { name: "Add 3 projects to Kit" })
    .click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeVisible();
  await page.waitForTimeout(1700);
  await selectProject(page, "Fixture Frontend");
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
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
    .getByRole("button", { name: `Remove ${secondProject} from Kit` })
    .click();
  await expect(
    page.getByRole("button", {
      name: `Remove ${secondProject} from Kit`,
    }),
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
