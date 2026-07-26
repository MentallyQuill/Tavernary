import { expect, test, type Locator } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const graphiteTeal = {
  canvas: "rgb(13, 17, 23)",
  header: "rgb(16, 24, 32)",
  sidebar: "rgb(18, 26, 31)",
  raised: "rgb(28, 40, 46)",
  overlay: "rgb(32, 44, 50)",
  tealBackground: "rgb(21, 59, 57)",
  tealHover: "rgb(27, 74, 70)",
  tealBorder: "rgb(40, 99, 94)",
  tealText: "rgb(140, 233, 222)",
  frontend: "rgb(214, 40, 57)",
  preset: "rgb(87, 197, 163)",
  functional: "rgb(225, 138, 36)",
  focusRing: "rgb(94, 234, 212)",
  controlBackground: "rgb(16, 25, 30)",
  controlFocus: "rgb(45, 212, 191)",
  primaryBackground: "rgb(225, 138, 36)",
  primaryHover: "rgb(240, 161, 69)",
  primaryPressed: "rgb(200, 116, 22)",
  primaryText: "rgb(22, 16, 8)",
  secondaryBackground: "rgb(28, 40, 46)",
  secondaryHover: "rgb(38, 54, 61)",
  secondaryText: "rgb(230, 237, 243)",
  surface: "rgb(24, 34, 40)",
  surfaceHover: "rgb(34, 49, 56)",
  activityCurrent: "rgb(45, 212, 191)",
  activityRecent: "rgb(130, 144, 153)",
  activityDormant: "rgb(95, 107, 114)",
  frontendBorder: "rgb(124, 41, 54)",
  presetBorder: "rgb(52, 122, 103)",
  functionalBorder: "rgb(138, 87, 32)",
  frontendText: "rgb(255, 139, 149)",
  presetText: "rgb(139, 224, 197)",
  functionalText: "rgb(255, 193, 113)",
  progressTrack: "rgb(38, 54, 61)",
  progressFill: "rgb(87, 197, 163)",
  licenseOpen: "rgb(87, 197, 163)",
  licenseProprietary: "rgb(168, 179, 186)",
  licenseMissing: "rgb(130, 144, 153)",
  infoBackground: "rgb(22, 43, 69)",
  infoBorder: "rgb(49, 95, 145)",
  infoText: "rgb(121, 192, 255)",
  dangerText: "rgb(255, 123, 114)",
  muted: "rgb(130, 144, 153)",
} as const;

async function expectStyle(locator: Locator, property: string, value: string) {
  await expect(locator).toHaveCSS(property, value);
}

test("desktop catalog applies graphite surfaces and teal interaction roles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  await expectStyle(
    page.locator(".site-header"),
    "background-color",
    graphiteTeal.header,
  );
  await expectStyle(
    page.locator(".category-navigation"),
    "background-color",
    graphiteTeal.sidebar,
  );
  await expectStyle(
    page.locator(".filter-panel"),
    "background-color",
    graphiteTeal.sidebar,
  );
  await expectStyle(
    page.locator(".catalog-main"),
    "background-color",
    graphiteTeal.canvas,
  );

  const frontend = page.locator(
    '.category-navigation button[data-category="frontend"]',
  );
  await frontend.click();
  await expectStyle(frontend, "background-color", graphiteTeal.tealBackground);
  await expectStyle(frontend, "border-top-color", graphiteTeal.tealBorder);
  await expectStyle(frontend, "color", graphiteTeal.tealText);

  const search = page.locator(".site-search");
  await expectStyle(search, "background-color", graphiteTeal.controlBackground);
  await page.getByRole("searchbox", { name: "Search projects" }).focus();
  await expectStyle(search, "border-top-color", graphiteTeal.controlFocus);

  await expectStyle(
    page.getByRole("combobox", { name: "Sort projects" }),
    "background-color",
    graphiteTeal.controlBackground,
  );
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} catalog retains its graphite canvas and teal default selection`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());

    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Browse categories" }).click();
    }

    await expectStyle(
      page.locator("body"),
      "background-color",
      graphiteTeal.canvas,
    );
    const allProjects = page.getByRole("button", { name: "All Projects" });
    await expect(allProjects).toHaveClass(/active/);
    await expectStyle(
      allProjects,
      "background-color",
      graphiteTeal.tealBackground,
    );
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} Kit Builder retains its approved elevation`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath());

    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Browse categories" }).click();
    }

    await page.getByRole("button", { name: "Kits", exact: true }).click();
    if (viewport.name === "mobile") {
      await page.getByRole("button", { name: "Create Kit" }).click();
    } else {
      await page.getByRole("button", { name: "Open Kit Builder" }).click();
      await page.getByRole("button", { name: "Create new Kit" }).click();
    }

    const builder =
      viewport.name === "mobile"
        ? page.getByRole("dialog", { name: "Kit Builder" })
        : page.getByRole("complementary", { name: "Kit Builder" });
    await expect(builder).toBeVisible();
    await expectStyle(
      builder,
      "background-color",
      viewport.name === "mobile" ? graphiteTeal.overlay : graphiteTeal.raised,
    );
  });
}

for (const viewport of [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`${viewport.name} About retains its graphite canvas and teal links`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto(sitePath("/about/"));

    await expectStyle(
      page.locator(".about-page"),
      "background-color",
      graphiteTeal.canvas,
    );
    await expectStyle(
      page.locator(".about-nav a").first(),
      "color",
      "rgb(110, 231, 216)",
    );
  });
}

test("mobile category selection retains the teal navigation border", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());

  const browse = page.getByRole("button", { name: "Browse categories" });
  await browse.click();
  await page
    .locator('.mobile-category-menu button[data-category="frontend"]')
    .click();
  await browse.click();

  const activeCategory = page.locator(".mobile-category-menu button.active");
  await expectStyle(
    activeCategory,
    "border-top-color",
    graphiteTeal.tealBorder,
  );
  await expectStyle(
    activeCategory,
    "background-color",
    graphiteTeal.tealBackground,
  );
  await expectStyle(
    activeCategory.locator("svg"),
    "color",
    graphiteTeal.frontend,
  );
  await expectStyle(
    browse.locator("svg").first(),
    "color",
    graphiteTeal.frontend,
  );
  await activeCategory.hover();
  await expectStyle(
    activeCategory,
    "background-color",
    graphiteTeal.tealBackground,
  );
  await expectStyle(
    page.locator('.mobile-category-menu button[data-category="preset"] svg'),
    "color",
    graphiteTeal.preset,
  );
  await expectStyle(
    page.locator(
      '.mobile-category-menu button[data-category="memory-retrieval"] svg',
    ),
    "color",
    graphiteTeal.functional,
  );
  await expectStyle(
    page.locator('.mobile-category-menu button[data-category="kits"] svg'),
    "color",
    graphiteTeal.controlFocus,
  );
  await expectStyle(
    page.locator(
      '.mobile-category-menu button[data-category="all"] .all-symbol',
    ),
    "color",
    graphiteTeal.controlFocus,
  );

  const preset = page.locator(
    '.mobile-category-menu button[data-category="preset"]',
  );
  await preset.hover();
  await expectStyle(preset, "background-color", graphiteTeal.tealHover);
});

test("desktop generation and reasoning category retains its orange mark", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  await expectStyle(
    page.locator('[data-category="generation-reasoning"] svg'),
    "color",
    graphiteTeal.functional,
  );
});

test("dual-range keeps its rendered minimum thumb interactive", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();

  const minimum = page.getByRole("slider", { name: "Minimum projects" });
  await expectStyle(minimum, "height", "28px");
  const box = await minimum.boundingBox();
  expect(box).not.toBeNull();

  // Chromium exposes host styles for its native range-thumb pseudo-element.
  // A hit test still verifies that the rendered thumb, rather than its
  // pointer-events-disabled host, receives interaction at the minimum value.
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) =>
          document.elementFromPoint(x, y)?.getAttribute("aria-label"),
        { x: box!.x + 9, y: box!.y + box!.height / 2 },
      ),
    )
    .toBe("Minimum projects");
});

test("desktop selection and focus treatments use the teal family", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  await page.evaluate(() => {
    const kit = document.createElement("article");
    kit.className = "kit-card selected";
    kit.dataset.themeTest = "selected-kit";
    document.body.append(kit);
  });
  const selectedKit = page.locator('[data-theme-test="selected-kit"]');
  await expectStyle(selectedKit, "border-top-color", graphiteTeal.tealBorder);
  await expectStyle(
    selectedKit,
    "box-shadow",
    "rgb(21, 59, 57) 0px 0px 0px 2px",
  );

  const projectCard = page.locator(".project-card").first();
  await projectCard.focus();
  await expectStyle(projectCard, "outline-color", graphiteTeal.tealBackground);

  const projectShell = page.locator(".project-card-shell").first();
  await projectShell.evaluate((shell) => shell.setAttribute("tabindex", "0"));
  await projectShell.focus();
  await expectStyle(projectShell, "outline-color", graphiteTeal.focusRing);

  await page.getByRole("button", { name: "Open Kit Builder" }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();
  const projectControl = page.locator(".project-kit-control").first();
  await projectControl.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expectStyle(
    projectControl.locator(".project-kit-control-face"),
    "outline-color",
    graphiteTeal.focusRing,
  );
  await projectControl.click();
  const selectedProject = page.locator(
    ".project-card-shell.selected .project-card",
  );
  await expectStyle(
    selectedProject,
    "outline-color",
    graphiteTeal.controlFocus,
  );
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
  const inKitCard = page.locator(".project-card-shell.in-draft .project-card");
  await expectStyle(inKitCard, "border-top-color", graphiteTeal.functional);
  await expectStyle(
    page.locator(".project-card-shell.in-draft .project-in-draft"),
    "color",
    graphiteTeal.functionalText,
  );
  const remove = page.locator(".kit-builder-remove").first();
  await expect(remove).toBeVisible();
  await remove.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expectStyle(
    remove.locator("> span"),
    "outline-color",
    graphiteTeal.focusRing,
  );
  await expectStyle(
    remove.locator("> span"),
    "background-color",
    graphiteTeal.primaryHover,
  );
});

test("cards, Kits, metadata, and statuses retain their semantic color families", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  const card = page.locator(".project-card").first();
  await expectStyle(card, "background-color", graphiteTeal.surface);
  expect(
    await card.evaluate((element) => getComputedStyle(element).boxShadow),
  ).toContain("0px 1px 2px");
  await card.hover();
  await expectStyle(card, "background-color", graphiteTeal.surfaceHover);
  await expectStyle(card, "border-top-color", "rgb(80, 104, 112)");

  await expectStyle(
    page.locator(".project-card.kind-frontend .card-identity").first(),
    "color",
    graphiteTeal.frontend,
  );
  await expectStyle(
    page.locator(".project-card.kind-preset .card-identity").first(),
    "color",
    graphiteTeal.preset,
  );
  await expectStyle(
    page
      .locator(
        ".project-card:not(.kind-frontend):not(.kind-preset) .card-identity",
      )
      .first(),
    "color",
    graphiteTeal.functional,
  );

  await page.evaluate(() => {
    const fixture = document.createElement("section");
    fixture.dataset.themeTest = "task-three-semantics";
    fixture.innerHTML = `
      <span class="activity-weeks"><i class="active"></i><i class="recent"></i><i></i></span>
      <div class="dual-range-track" style="--range-start: 20%; --range-end: 80%"><input type="range" /></div>
      <button class="project-kit-control"><span class="project-kit-control-face"></span></button>
      <button class="kit-builder-remove"><span></span></button>
      <div class="kit-frontend-slot"></div>
      <div class="kit-builder-row" data-kind="preset"><span class="kit-builder-row-identity"><small>Preset</small></span></div>
      <div class="kit-builder-row" data-kind="extension"><span class="kit-builder-row-identity"><small>Extension</small></span></div>
      <span class="license-osi-approved">Open</span>
      <span class="license-proprietary">Proprietary</span>
      <span class="license-missing">Missing</span>
      <p class="kit-draft-restore-notice">Restored</p>
      <span class="kit-builder-field-error">Field error</span>
      <ul class="kit-builder-errors"><li>Error</li></ul>
      <span class="kit-builder-rail-status">Draft status</span>
      <span class="kit-draft-access-status">Access status</span>
    `;
    document.body.append(fixture);
  });

  const fixture = page.locator('[data-theme-test="task-three-semantics"]');
  const weeks = fixture.locator(".activity-weeks i");
  await expectStyle(
    weeks.nth(0),
    "background-color",
    graphiteTeal.activityCurrent,
  );
  await expectStyle(
    weeks.nth(1),
    "background-color",
    graphiteTeal.activityRecent,
  );
  await expectStyle(
    weeks.nth(2),
    "background-color",
    graphiteTeal.activityDormant,
  );
  await expectStyle(
    fixture.locator(".dual-range-track"),
    "background-color",
    "rgba(0, 0, 0, 0)",
  );
  await expect(
    fixture
      .locator(".dual-range-track")
      .evaluate(
        (element) => getComputedStyle(element, "::after").backgroundColor,
      ),
  ).resolves.toBe(graphiteTeal.progressTrack);
  await expect(
    fixture
      .locator(".dual-range-track")
      .evaluate(
        (element) => getComputedStyle(element, "::before").backgroundColor,
      ),
  ).resolves.toBe(graphiteTeal.progressFill);
  const projectKitControl = fixture.locator(".project-kit-control");
  const projectKitFace = projectKitControl.locator(".project-kit-control-face");
  await expectStyle(
    projectKitFace,
    "background-color",
    graphiteTeal.primaryBackground,
  );
  await projectKitControl.hover();
  await expectStyle(
    projectKitFace,
    "background-color",
    graphiteTeal.primaryHover,
  );
  const projectKitControlBox = await projectKitControl.boundingBox();
  expect(projectKitControlBox).not.toBeNull();
  await page.mouse.move(
    projectKitControlBox!.x + projectKitControlBox!.width / 2,
    projectKitControlBox!.y + projectKitControlBox!.height / 2,
  );
  await page.mouse.down();
  await expectStyle(
    projectKitFace,
    "background-color",
    graphiteTeal.primaryPressed,
  );
  await page.mouse.up();
  await expectStyle(
    fixture.locator(".kit-frontend-slot"),
    "border-top-color",
    graphiteTeal.frontendBorder,
  );
  await expectStyle(
    fixture.locator('.kit-builder-row[data-kind="preset"]'),
    "border-top-color",
    graphiteTeal.presetBorder,
  );
  await expectStyle(
    fixture.locator('.kit-builder-row[data-kind="preset"] small'),
    "color",
    graphiteTeal.presetText,
  );
  await expectStyle(
    fixture.locator('.kit-builder-row[data-kind="extension"]'),
    "border-top-color",
    graphiteTeal.functionalBorder,
  );
  await expectStyle(
    fixture.locator('.kit-builder-row[data-kind="extension"] small'),
    "color",
    graphiteTeal.functionalText,
  );
  await expectStyle(
    fixture.getByText("Open"),
    "color",
    graphiteTeal.licenseOpen,
  );
  await expectStyle(
    fixture.getByText("Proprietary"),
    "color",
    graphiteTeal.licenseProprietary,
  );
  await expectStyle(
    fixture.getByText("Missing"),
    "color",
    graphiteTeal.licenseMissing,
  );
  await expectStyle(
    fixture.locator(".kit-draft-restore-notice"),
    "background-color",
    graphiteTeal.infoBackground,
  );
  await expectStyle(
    fixture.locator(".kit-draft-restore-notice"),
    "border-left-color",
    graphiteTeal.infoBorder,
  );
  await expectStyle(
    fixture.locator(".kit-draft-restore-notice"),
    "color",
    graphiteTeal.infoText,
  );
  await expectStyle(
    fixture.locator(".kit-builder-field-error"),
    "color",
    graphiteTeal.dangerText,
  );
  await expectStyle(
    fixture.locator(".kit-builder-errors"),
    "color",
    graphiteTeal.dangerText,
  );
  await expectStyle(
    fixture.locator(".kit-builder-rail-status"),
    "color",
    graphiteTeal.muted,
  );
  await expectStyle(
    fixture.locator(".kit-draft-access-status"),
    "color",
    graphiteTeal.muted,
  );
});

test("desktop primary and secondary controls expose their complete state families", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  const submit = page.locator(".submit-link");
  await submit.evaluate((link) =>
    link.addEventListener("click", (event) => event.preventDefault()),
  );
  await expectStyle(submit, "background-color", graphiteTeal.primaryBackground);
  await expectStyle(submit, "color", graphiteTeal.primaryText);
  await submit.hover();
  await expectStyle(submit, "background-color", graphiteTeal.primaryHover);

  const box = await submit.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expectStyle(submit, "background-color", graphiteTeal.primaryPressed);
  await page.mouse.up();

  await page.evaluate(() => {
    const secondary = document.createElement("button");
    secondary.className = "control-secondary";
    secondary.dataset.themeTest = "secondary";
    document.body.append(secondary);
  });
  const secondary = page.locator('[data-theme-test="secondary"]');
  await expect(secondary).toBeVisible();
  await expectStyle(
    secondary,
    "background-color",
    graphiteTeal.secondaryBackground,
  );
  await expectStyle(secondary, "color", graphiteTeal.secondaryText);
  await secondary.hover();
  await expectStyle(secondary, "background-color", graphiteTeal.secondaryHover);
});
