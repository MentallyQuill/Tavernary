import { expect, test } from "@playwright/test";
import { sitePath } from "../helpers/site-path";

async function openKits(page: import("@playwright/test").Page) {
  await page.goto(sitePath());
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

async function verifyFrontendDiscovery(
  page: import("@playwright/test").Page,
  phone: boolean,
) {
  await page.goto(sitePath());
  if (phone) {
    await page.getByRole("button", { name: "Browse categories" }).click();
    await page.getByRole("button", { name: "Kits", exact: true }).click();
    await page.getByRole("button", { name: "Create Kit" }).click();
  } else {
    await page.getByRole("button", { name: "Open Kit Builder" }).click();
    await page.getByRole("button", { name: "Create new Kit" }).click();
  }

  const shortcut = page.getByRole("button", {
    name: "Show Frontend cards",
  });
  await expect(shortcut).toContainText("Add a Frontend");
  await expect(shortcut).toContainText("Choose one from the catalog cards");
  const slot = page.locator(".kit-frontend-slot");
  const slotBox = (await slot.boundingBox())!;
  const shortcutBox = (await shortcut.boundingBox())!;
  expect(shortcutBox.x).toBeGreaterThanOrEqual(slotBox.x);
  expect(shortcutBox.y).toBeGreaterThanOrEqual(slotBox.y);
  expect(shortcutBox.x + shortcutBox.width).toBeLessThanOrEqual(
    slotBox.x + slotBox.width,
  );
  expect(shortcutBox.y + shortcutBox.height).toBeLessThanOrEqual(
    slotBox.y + slotBox.height,
  );
  if (phone) await expectMobileTarget(shortcut);

  await shortcut.click();
  await expect(page).toHaveURL(/kind=frontend/);
  if (phone) {
    await expect(page).not.toHaveURL(/mode=kits/);
    await page.getByRole("button", { name: "Close Kit Builder" }).click();
    await expect(
      page.getByRole("region", { name: "Project catalog" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Open filters" }).click();
    const filters = page.getByRole("dialog", { name: "Filters" });
    await expect(
      filters.getByRole("checkbox", { name: "Frontend" }),
    ).toBeChecked();
    await filters.getByRole("button", { name: "Close filters" }).click();
  } else {
    await expect(
      page.getByRole("checkbox", { name: "Frontend" }),
    ).toBeChecked();
  }

  await expect(
    page.getByRole("button", { name: "Remove Frontend" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
  ).toBeVisible();
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

  await page
    .getByRole("button", { name: /Open Kit Builder, 1 project in draft/ })
    .click();
  await page
    .locator(".kit-frontend-foundation")
    .getByRole("button", { name: "Remove Fixture Frontend from Kit" })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Fixture Frontend to Kit" }),
  ).toBeVisible();
}

test("desktop Frontend discovery reveals the visible filter and card action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await verifyFrontendDiscovery(page, false);

  await selectProject(page, "Fixture Frontend");
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
  await expect(
    page.getByRole("region", { name: "Frontend" }).getByRole("button", {
      name: "Remove Fixture Frontend from Kit",
    }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove Frontend" }).click();
  await expect(
    page.getByRole("checkbox", { name: "Frontend" }),
  ).not.toBeChecked();
  await expect(page).not.toHaveURL(/kind=frontend/);
});

test("blocks severe Kit text before GitHub opens", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "open", {
      configurable: true,
      value: (...args: unknown[]) => {
        (
          window as Window & { __kitOpenCalls?: unknown[][] }
        ).__kitOpenCalls ??= [];
        (
          window as Window & { __kitOpenCalls: unknown[][] }
        ).__kitOpenCalls.push(args);
        return null;
      },
    });
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await selectProject(page, "Fixture Frontend");
  await selectProject(page, "Fixture Tool 02");
  await selectProject(page, "Fixture Tool 03");
  await page.getByRole("button", { name: "Add 3 projects to Kit" }).click();
  const title = page.getByLabel("Title", { exact: true });
  if (!(await title.isVisible())) {
    await page
      .getByRole("button", { name: /Open Kit Builder, 3 projects in draft/ })
      .click();
  }
  await title.fill("N1gg3r Story Kit");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A complete storytelling stack.");
  await page.getByRole("button", { name: "Submit Kit" }).click();

  await expect(
    page.getByText("Title contains language Tavernary doesn't allow."),
  ).toBeVisible();
  await expect(title).toBeFocused();
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __kitOpenCalls?: unknown[][] }).__kitOpenCalls ??
        [],
    ),
  ).toEqual([]);
});

test("mobile Frontend discovery returns from Kits to the filtered cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await verifyFrontendDiscovery(page, true);
});

test("restores a browser-local draft and confirms before discarding it", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Persistent Kit");
  await page
    .getByLabel("Description", { exact: true })
    .fill("This draft survives a browser reload.");

  await page.reload();

  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Persistent Kit",
  );
  await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
    "This draft survives a browser reload.",
  );
  const discard = page.getByRole("button", { name: "Discard draft" });
  await expect(discard.locator('[data-icon="remove"]')).toBeVisible();
  await discard.click();
  await expect(
    page.getByRole("dialog", { name: "Discard unfinished Kit?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Discard Kit" }).click();

  await expect(
    page.getByRole("heading", { name: "Build and inspect Kits" }),
  ).toBeVisible();
  await expect(page.getByLabel("Title", { exact: true })).toHaveCount(0);
});

test("keeps discard confirmation actions inside the phone dialog", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Create Kit" }).click();
  await page.getByRole("button", { name: "Discard draft" }).click();

  const dialog = page.getByRole("dialog", {
    name: "Discard unfinished Kit?",
  });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const dialogBounds = element.getBoundingClientRect();
    const actions = Array.from(element.querySelectorAll("button")).map(
      (button) => {
        const bounds = button.getBoundingClientRect();
        return {
          left: bounds.left,
          right: bounds.right,
          top: bounds.top,
          bottom: bounds.bottom,
        };
      },
    );
    return {
      dialogLeft: dialogBounds.left,
      dialogRight: dialogBounds.right,
      dialogClientWidth: element.clientWidth,
      dialogScrollWidth: element.scrollWidth,
      actions,
    };
  });

  expect(geometry.dialogLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.dialogRight).toBeLessThanOrEqual(390);
  expect(geometry.dialogScrollWidth).toBeLessThanOrEqual(
    geometry.dialogClientWidth,
  );
  for (const action of geometry.actions) {
    expect(action.left).toBeGreaterThanOrEqual(geometry.dialogLeft);
    expect(action.right).toBeLessThanOrEqual(geometry.dialogRight);
  }
  expect(geometry.actions[1].top).toBeGreaterThanOrEqual(
    geometry.actions[0].bottom,
  );
});

test("filled desktop actions use Graphite Teal ink and card Kit glyphs are centered in a square", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());

  const expectedInk = "rgb(22, 16, 8)";
  const submitProject = page.getByRole("link", { name: "Submit Project" });
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
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

test("matches expanded project-card typography on Kit cards", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openKits(page);

  const card = page.getByRole("article", { name: "Alpha Kit" });
  const title = card.getByRole("heading", { name: "Alpha Kit" });
  const author = card.locator("small");
  const description = card.locator(".kit-card-description");
  const metadata = card.locator(".kit-card-metadata");

  await expect(title).toHaveCSS("font-size", "17px");
  await expect(title).toHaveCSS("font-weight", "720");
  await expect(title).toHaveCSS("letter-spacing", "-0.34px");
  await expect(title).toHaveCSS("line-height", "22.1px");

  await expect(author).toHaveCSS("font-size", "10px");
  await expect(author).toHaveCSS("font-weight", "500");
  await expect(author).toHaveCSS("line-height", "13px");
  await expect(author).toHaveCSS("color", "rgb(130, 144, 153)");

  await expect(description).toHaveCSS("font-size", "11px");
  await expect(description).toHaveCSS("line-height", "16.28px");
  await expect(description).toHaveCSS("-webkit-line-clamp", "4");

  await expect(metadata).toHaveCSS("font-size", "10px");
});

test("desktop Kit Builder open and close controls share one 36-pixel geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Open Kit Builder" }).click();

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

test("desktop Kit Builder keeps form focus rings visible and text fonts consistent", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();

  const body = page.locator(".kit-builder-panel-body");
  const title = page.getByLabel("Title", { exact: true });
  const description = page.getByLabel("Description", { exact: true });
  await title.focus();

  const presentation = await body.evaluate((element) => {
    const titleElement = element.querySelector<HTMLInputElement>(
      '.kit-builder input[type="text"]',
    );
    const descriptionElement = element.querySelector<HTMLTextAreaElement>(
      ".kit-builder textarea",
    );
    if (!titleElement || !descriptionElement) {
      throw new Error("Kit Builder text controls are missing");
    }

    const bodyBounds = element.getBoundingClientRect();
    const titleBounds = titleElement.getBoundingClientRect();
    const titleStyle = getComputedStyle(titleElement);
    const descriptionStyle = getComputedStyle(descriptionElement);
    return {
      leftClearance: titleBounds.left - bodyBounds.left,
      rightClearance: bodyBounds.right - titleBounds.right,
      titleFontFamily: titleStyle.fontFamily,
      descriptionFontFamily: descriptionStyle.fontFamily,
    };
  });

  expect(presentation.leftClearance).toBeGreaterThanOrEqual(4);
  expect(presentation.rightClearance).toBeGreaterThanOrEqual(4);
  expect(presentation.descriptionFontFamily).toBe(presentation.titleFontFamily);
  await expect(title).toBeFocused();
  await expect(description).toBeVisible();
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
  await expect(
    page
      .getByRole("region", { name: "Project catalog" })
      .locator(".project-card"),
  ).toHaveCount(50);
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

test("desktop Kit inspection keeps fixed actions reachable with a 600-character description", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 500 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  const description = panel.locator(".kit-builder-inspect-description");
  await description.evaluate((element) => {
    element.textContent = "Long Kit description ".repeat(30).slice(0, 600);
  });

  await expect(description).toHaveCSS("-webkit-line-clamp", "4");
  await expect(
    panel.getByRole("link", { name: "Report Kit" }),
  ).toBeInViewport();
  await expect(
    panel.getByRole("link", { name: "Request withdrawal" }),
  ).toBeInViewport();
});

test("compact cards keep the Kit control right-aligned and reserve an ellipsis gutter", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(sitePath());

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
  await filter
    .getByRole("searchbox", { name: "Search Kit purposes" })
    .fill("Memory");
  await filter.getByText("Memory and retrieval", { exact: true }).click();
  await expect(cards(page).first()).toBeVisible();
  const projectFilter = filter.getByRole("group", {
    name: "Includes project",
  });
  await projectFilter
    .getByRole("searchbox", { name: "Search included projects" })
    .fill("Fixture Tool 04");
  await projectFilter.getByLabel("Fixture Tool 04", { exact: true }).check();
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByLabel("Minimum projects").fill("4");
  await expect(page.getByRole("article", { name: "Alpha Kit" })).toHaveCount(0);
  await filter.getByLabel("Minimum projects").fill("3");
  await filter.getByLabel("Maximum projects").fill("3");
  await expect(cards(page).first()).toContainText("Alpha Kit");
  await filter.getByLabel("All components available").check();
  await expect(cards(page)).toHaveCount(1);
  await filter.getByRole("button", { name: "Clear all" }).click();
  await expect(cards(page)).toHaveCount(8);
});

test("mobile Kit filters are visible, dismissible, and mode-local", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/);

  const filterButton = page.getByRole("button", { name: "Open filters" });
  await filterButton.click();
  const kitFilters = page.getByRole("dialog", { name: "Filters" });
  await expect(kitFilters).toBeVisible();
  await kitFilters.getByLabel("All components available").check();
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
  await expect(
    page.getByRole("button", { name: "Close Kit filters" }),
  ).toHaveCount(0);
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
  const descriptionClamp = await longDescription.evaluate((element) => {
    element.textContent = "Long Kit description ".repeat(30);
    const oneLine = element.cloneNode() as HTMLElement;
    oneLine.textContent = "M";
    oneLine.style.cssText =
      "position:absolute;visibility:hidden;display:block;overflow:visible;white-space:nowrap;-webkit-line-clamp:unset;";
    document.body.append(oneLine);
    const lineHeight = oneLine.getBoundingClientRect().height;
    oneLine.remove();

    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      lineClamp: style.webkitLineClamp,
      lineHeight,
      overflow: style.overflow,
      scrollHeight: element.scrollHeight,
    };
  });
  expect(descriptionClamp.lineClamp).toBe("4");
  expect(descriptionClamp.overflow).toBe("hidden");
  expect(descriptionClamp.scrollHeight).toBeGreaterThan(
    descriptionClamp.clientHeight,
  );
  expect(descriptionClamp.clientHeight).toBeLessThanOrEqual(
    descriptionClamp.lineHeight * 4 + 1,
  );

  const card = page.getByRole("article", { name: "Alpha Kit" });
  const cardCopy = card.getByRole("button", { name: "Copy link" });
  await cardCopy.hover();
  await expect(
    page.getByRole("tooltip", { name: "Copy a direct link to this Kit" }),
  ).toBeVisible();
  await cardCopy.click();
  await expect(
    page.getByRole("status", { name: "Kit URL copied to clipboard" }),
  ).toBeVisible();

  const cardReportButton = card.getByRole("button", { name: "Report Kit" });
  await cardReportButton.hover();
  await expect(
    page.getByRole("tooltip", { name: "Report this Kit on GitHub" }),
  ).toBeVisible();
  await cardReportButton.click();
  const cardReport = new URL(
    (await page.evaluate(() => sessionStorage.getItem("opened-url")))!,
  );
  expect(cardReport.searchParams.get("kit-id")).toBe("alpha-kit-101");
  expect(cardReport.searchParams.get("share-url")).toContain(
    "kit=alpha-kit-101",
  );

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const inspector = page.getByRole("complementary", { name: "Kit Builder" });
  const frontend = inspector.getByRole("link", {
    name: "Fixture Frontend",
    exact: true,
  });
  const tool = inspector.getByRole("link", {
    name: "Fixture Tool 02",
    exact: true,
  });
  await expect(frontend).toHaveAttribute(
    "href",
    "https://github.com/fixture/fixture-frontend",
  );
  await expect(tool).toHaveAttribute(
    "href",
    "https://github.com/fixture/fixture-tool-02",
  );
  await expect(frontend).toHaveAttribute("target", "_blank");
  await expect(inspector.locator("[aria-expanded]")).toHaveCount(0);
  await expect(inspector.locator(".project-kit-control")).toHaveCount(0);

  await tool.evaluate((element) => {
    element.addEventListener("click", (event) => {
      event.preventDefault();
      sessionStorage.setItem(
        "inspector-project-url",
        (event.currentTarget as HTMLAnchorElement).href,
      );
    });
  });
  await tool.click();
  expect(
    await page.evaluate(() => sessionStorage.getItem("inspector-project-url")),
  ).toBe("https://github.com/fixture/fixture-tool-02");

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

test("scrolls one desktop inspector body without a nested project scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await openKits(page);
  await page.getByRole("button", { name: "Open Large Stack" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  const body = panel.locator(".kit-builder-panel-body");
  const stack = panel.locator(".kit-project-stack");
  const firstCard = stack.locator(".project-card").first();

  await expect
    .poll(() =>
      panel.evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeCloseTo(316.8, 0);

  const geometry = await panel.evaluate((element) => {
    const body = element.querySelector<HTMLElement>(".kit-builder-panel-body");
    const stack = element.querySelector<HTMLElement>(".kit-project-stack");
    const card = stack?.querySelector<HTMLElement>(".project-card");
    if (!body || !stack || !card) {
      throw new Error("Kit inspector geometry is incomplete");
    }
    return {
      bodyClientHeight: body.clientHeight,
      bodyScrollHeight: body.scrollHeight,
      cardWidth: card.getBoundingClientRect().width,
      panelWidth: element.getBoundingClientRect().width,
      stackClientHeight: stack.clientHeight,
      stackScrollHeight: stack.scrollHeight,
    };
  });

  expect(geometry.panelWidth).toBeCloseTo(316.8, 0);
  expect(geometry.cardWidth).toBeGreaterThanOrEqual(280);
  expect(geometry.bodyScrollHeight).toBeGreaterThan(geometry.bodyClientHeight);
  expect(geometry.stackScrollHeight).toBe(geometry.stackClientHeight);
  await expect(firstCard).toBeVisible();

  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });

  await expect(
    stack.getByRole("link", { name: "Fixture Tool 49", exact: true }),
  ).toBeInViewport();
  await expect(
    stack.getByRole("group", { name: "Fixture Flagged Tool unavailable" }),
  ).toBeVisible();
  await expect(panel.locator(".kit-builder-panel-header")).toBeVisible();
  await expect(panel.locator(".kit-builder-panel-body-frame")).toHaveAttribute(
    "data-can-scroll-up",
    "true",
  );
  await expect(
    panel.locator(".kit-builder-panel-body-frame"),
  ).not.toHaveAttribute("data-can-scroll-down");
});

test("phone inspectors expose direct project links without horizontal overflow", async ({
  page,
}) => {
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(sitePath());
    await page.getByRole("button", { name: "Browse categories" }).click();
    await page.getByRole("button", { name: "Kits", exact: true }).click();
    await page.getByRole("button", { name: "Open Alpha Kit" }).click();

    const sheet = page.getByRole("dialog", { name: "Kit Builder" });
    await expect(
      sheet.getByRole("link", { name: "Fixture Frontend", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Close Kit Builder" }).click();
  }
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
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 3 projects in draft",
    }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill("Fixture Tool 10");
  await selectProject(page, "Fixture Tool 10");
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
  await expect(search).toHaveValue("Fixture Tool 10");
  await expect(
    page.getByRole("button", {
      name: "Open Kit Builder, 4 projects in draft",
    }),
  ).toBeVisible();

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
    await page.goto(sitePath());
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
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
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
  await page.goto(sitePath());
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
  await page.goto(sitePath());
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
  await page.goto(sitePath());
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
  const filters = page.getByRole("dialog", { name: "Filters" });
  await expectMobileTarget(
    filters.getByRole("button", { name: "Close Kit filters" }),
  );
  await expectMobileTarget(
    filters.getByLabel("All components available").locator(".."),
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
    dialog.getByRole("link", { name: "Fixture Frontend", exact: true }),
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
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Kit Builder" })).toHaveCount(
    0,
  );

  const filterButton = page.getByRole("button", { name: "Open filters" });
  await filterButton.click();
  const filters = page.getByRole("dialog", { name: "Filters" });
  await filters.getByLabel("All components available").check();
  await expect(cards(page)).toHaveCount(6);
  await filters.getByLabel("All components available").uncheck();
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
