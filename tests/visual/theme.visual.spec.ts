import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  installGitHubReviewRecorder,
  setGitHubReviewsBlocked,
} from "../helpers/github-review";
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
  frontendBackground: "rgb(53, 24, 31)",
  preset: "rgb(87, 197, 163)",
  functional: "rgb(225, 138, 36)",
  focusRing: "rgb(94, 234, 212)",
  controlBackground: "rgb(16, 25, 30)",
  controlBorder: "rgb(48, 66, 73)",
  controlFocus: "rgb(45, 212, 191)",
  primaryBackground: "rgb(225, 138, 36)",
  primaryHover: "rgb(240, 161, 69)",
  primaryPressed: "rgb(200, 116, 22)",
  primaryText: "rgb(22, 16, 8)",
  secondaryBackground: "rgb(28, 40, 46)",
  secondaryHover: "rgb(38, 54, 61)",
  secondaryText: "rgb(230, 237, 243)",
  disabledBackground: "rgb(23, 31, 35)",
  disabledBorder: "rgb(34, 48, 56)",
  disabledText: "rgb(95, 107, 114)",
  surface: "rgb(24, 34, 40)",
  surfaceHover: "rgb(34, 49, 56)",
  textPrimary: "rgb(230, 237, 243)",
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
  success: "rgb(63, 185, 80)",
  successText: "rgb(126, 231, 135)",
  warningBorder: "rgb(122, 91, 24)",
  warningText: "rgb(227, 179, 65)",
  danger: "rgb(248, 81, 73)",
  dangerBackground: "rgb(61, 27, 31)",
  dangerBorder: "rgb(140, 47, 53)",
  dangerText: "rgb(255, 123, 114)",
  muted: "rgb(130, 144, 153)",
} as const;

async function expectStyle(locator: Locator, property: string, value: string) {
  await expect(locator).toHaveCSS(property, value);
}

async function expectColorChannels(
  locator: Locator,
  expected: readonly [number, number, number],
) {
  const color = await locator.evaluate(
    (element) => getComputedStyle(element).color,
  );
  const channels =
    color
      .match(/\d*\.?\d+/gu)
      ?.slice(0, 3)
      .map(Number) ?? [];
  const normalized = color.startsWith("color(srgb")
    ? channels.map((channel) => Math.round(channel * 255))
    : channels;
  expect(normalized).toEqual(expected);
}

async function waitForCatalogHydration(page: Page) {
  await expect(page.locator(".catalog-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: 15_000 },
  );
}

const ownerFrontendVisualFixture = [
  "SillyTavern",
  "RisuAI",
  "Agnai",
  "KoboldAI Lite",
  "DreamGen",
  "Miku",
  "A deliberately long frontend name",
] as const;

async function stabilizeOwnerFrontendVisualFixture(page: Page) {
  const group = page.getByRole("group", { name: "Supported frontends" });
  const choices = group.locator(":scope > .help-choice");
  await expect(choices.first()).toBeVisible();

  await choices.evaluateAll((elements, labels) => {
    const group = elements[0]?.parentElement;
    const prototype = elements[0];
    if (!group || !prototype) {
      throw new Error("The owner frontend choice group is unavailable.");
    }

    // Reproduce one vocabulary addition before replacing mutable catalog data
    // with the stable fixture used by the screenshot contract.
    const simulatedVocabularyGrowth = prototype.cloneNode(true) as HTMLElement;
    const simulatedLabel = simulatedVocabularyGrowth.querySelector("span");
    if (simulatedLabel) simulatedLabel.textContent = "New frontend";
    group.append(simulatedVocabularyGrowth);

    for (const element of group.querySelectorAll(":scope > .help-choice")) {
      element.remove();
    }
    for (const [index, label] of labels.entries()) {
      const choice = prototype.cloneNode(true) as HTMLElement;
      const input = choice.querySelector("input");
      const text = choice.querySelector("span");
      if (!(input instanceof HTMLInputElement) || !text) {
        throw new Error("The owner frontend choice markup changed.");
      }
      input.checked = index === 0;
      text.textContent = label;
      group.append(choice);
    }
  }, ownerFrontendVisualFixture);
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

test("catalog state notes render a real Unicode bullet", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  const note = page.locator(".card-state-note").first();
  await expect(note).toBeVisible();
  await expect(
    note.evaluate((element) => getComputedStyle(element, "::before").content),
  ).resolves.toBe('"• "');
});

test("flagged Kit cautions use the warning family", async ({ page }) => {
  await page.goto(sitePath());
  await page.evaluate(() => {
    const badges = document.createElement("div");
    badges.className = "kit-card-badges";
    badges.innerHTML =
      '<b class="kit-caution" data-theme-test="kit-caution">Contains flagged projects</b>';
    document.body.append(badges);
  });

  const caution = page.locator('[data-theme-test="kit-caution"]');
  await expectStyle(caution, "border-top-color", graphiteTeal.warningBorder);
  await expectStyle(caution, "color", graphiteTeal.warningText);
});

test("Kit drop targets distinguish valid and invalid status families", async ({
  page,
}) => {
  await page.goto(sitePath());
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <div class="kit-frontend-slot" data-drop-state="valid" data-theme-test="valid-drop"></div>
      <div class="kit-frontend-slot" data-drop-state="invalid" data-theme-test="invalid-drop"></div>
    `;
    document.body.append(fixture);
  });

  await expectStyle(
    page.locator('[data-theme-test="valid-drop"]'),
    "outline-color",
    graphiteTeal.success,
  );
  await expectStyle(
    page.locator('[data-theme-test="invalid-drop"]'),
    "outline-color",
    graphiteTeal.danger,
  );
});

test("Kit drag ghosts preserve the dragged project kind", async ({ page }) => {
  await page.goto(sitePath());
  await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <div class="kit-drag-ghost" data-kind="frontend"><span class="kit-drag-ghost-identity"><small>Frontend</small></span></div>
      <div class="kit-drag-ghost" data-kind="preset"><span class="kit-drag-ghost-identity"><small>Preset</small></span></div>
      <div class="kit-drag-ghost" data-kind="extension"><span class="kit-drag-ghost-identity"><small>Extension</small></span></div>
    `;
    document.body.append(fixture);
  });

  const frontend = page.locator('.kit-drag-ghost[data-kind="frontend"]');
  await expectStyle(frontend, "border-top-color", graphiteTeal.frontend);
  await expectStyle(
    frontend.locator("small"),
    "color",
    graphiteTeal.frontendText,
  );

  const preset = page.locator('.kit-drag-ghost[data-kind="preset"]');
  await expectStyle(preset, "border-top-color", graphiteTeal.preset);
  await expectStyle(preset.locator("small"), "color", graphiteTeal.presetText);

  const extension = page.locator('.kit-drag-ghost[data-kind="extension"]');
  await expectStyle(extension, "border-top-color", graphiteTeal.functional);
  await expectStyle(
    extension.locator("small"),
    "color",
    graphiteTeal.functionalText,
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

test("top-bar utility links and primary catalog modes use theme white", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  for (const linkName of ["About", "Menu"]) {
    const link = page.getByRole("link", { name: linkName, exact: true });
    await expectStyle(link, "color", graphiteTeal.secondaryText);
    await link.hover();
    await expectStyle(link, "color", graphiteTeal.secondaryText);
  }

  for (const modeName of ["Kits", "All Projects"]) {
    const mode = page.getByRole("button", { name: modeName, exact: true });
    await expectStyle(mode, "color", graphiteTeal.secondaryText);
    await expectStyle(
      modeName === "Kits" ? mode.locator("svg") : mode.locator(".all-symbol"),
      "color",
      graphiteTeal.secondaryText,
    );
  }
});

test("discard controls retain danger styling through interaction states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();

  const trigger = page.getByRole("button", { name: "Discard draft" });
  await expectStyle(trigger, "background-color", graphiteTeal.dangerBackground);
  await expectStyle(trigger, "border-top-color", graphiteTeal.dangerBorder);
  await expectStyle(trigger, "color", graphiteTeal.dangerText);
  await trigger.hover();
  await expectStyle(trigger, "background-color", graphiteTeal.dangerBorder);
  await expectStyle(trigger, "border-top-color", graphiteTeal.danger);

  await trigger.click();
  const confirm = page.getByRole("button", { name: "Discard Kit" });
  await expectStyle(confirm, "background-color", graphiteTeal.dangerBackground);
  await expectStyle(confirm, "border-top-color", graphiteTeal.dangerBorder);
  await expectStyle(confirm, "color", graphiteTeal.dangerText);
  await confirm.hover();
  await expectStyle(confirm, "background-color", graphiteTeal.dangerBorder);
  await expectStyle(confirm, "border-top-color", graphiteTeal.danger);

  const box = await confirm.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await expectStyle(confirm, "background-color", graphiteTeal.danger);
  await expectStyle(confirm, "border-top-color", graphiteTeal.danger);
  await expectStyle(confirm, "color", graphiteTeal.canvas);
  await page.mouse.up();
});

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

test("generic page kickers use the teal interaction accent", async ({
  page,
}) => {
  await page.goto(sitePath("/about/"));
  await expectStyle(
    page.locator(".about-kicker"),
    "color",
    graphiteTeal.controlFocus,
  );

  await page.goto(sitePath("/submit/project/"));
  await expectStyle(
    page.locator(".submission-kicker"),
    "color",
    graphiteTeal.controlFocus,
  );
});

test("submission inputs and textareas retain border focus plus the global ring", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));

  const projectUrl = page.getByRole("textbox", { name: "Project URL" });
  await projectUrl.focus();
  await expectStyle(projectUrl, "border-top-color", graphiteTeal.controlFocus);
  await expectStyle(projectUrl, "outline-color", graphiteTeal.focusRing);

  await page.getByLabel("Description choice").click();
  await page
    .getByRole("option", { name: /Write the description myself/u })
    .click();
  const description = page.getByRole("textbox", {
    name: "Short description",
  });
  await description.focus();
  await expectStyle(description, "border-top-color", graphiteTeal.controlFocus);
  await expectStyle(description, "outline-color", graphiteTeal.focusRing);
});

test("project review handoff statuses use distinct semantic families", async ({
  page,
}) => {
  await installGitHubReviewRecorder(page);
  await page.goto(sitePath("/submit/project/"));
  await page
    .getByRole("combobox", { name: "Project Type" })
    .selectOption("extension");
  await page.getByLabel("Primary function").click();
  await page.getByRole("option", { name: /Interface and workflow/u }).click();
  await page
    .getByRole("textbox", { name: "Project URL" })
    .fill("https://github.com/example/frontend");
  const sillyTavernCheckbox = page.getByRole("checkbox", {
    name: "SillyTavern",
    exact: true,
  });
  await sillyTavernCheckbox.check();
  await page.getByRole("button", { name: "Review submission" }).click();
  await page.getByRole("button", { name: "Continue on GitHub" }).click();

  const status = page.locator(".submission-review-status");
  await expect(status).toHaveText(
    "GitHub review opened in a new tab. Create the issue there, or return here to make changes.",
  );
  await expectStyle(status, "color", graphiteTeal.infoText);

  await setGitHubReviewsBlocked(page, true);
  await page.getByRole("button", { name: "Open GitHub review again" }).click();
  const error = page.locator(".submission-review-recovery");
  await expect(error).toContainText("GitHub review could not be opened.");
  await expectStyle(error, "color", graphiteTeal.dangerText);
});

test("project URL copy action retains its square secondary treatment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await page.goto(sitePath("/submit/project/"));
  await page.getByLabel("Project Type").selectOption("frontend");
  await page
    .getByRole("textbox", { name: "Project URL" })
    .fill("https://github.com/example/frontend");
  await page.getByRole("button", { name: "Review submission" }).click();

  const primary = page.getByRole("button", { name: "Continue on GitHub" });
  const copy = page.getByRole("button", { name: "Copy GitHub form URL" });
  await expectStyle(copy, "background-color", graphiteTeal.surface);
  await expectStyle(copy, "color", graphiteTeal.secondaryText);
  await expect(copy).toHaveCSS("width", "44px");
  await expect(copy).toHaveCSS("height", "44px");
  await copy.hover();
  await expectStyle(copy, "background-color", graphiteTeal.surfaceHover);
  await expect(
    page.getByRole("tooltip", {
      name: "Copy URL and paste into browser",
    }),
  ).toBeVisible();

  await page.setViewportSize({ width: 1440, height: 900 });
  const [primaryBox, copyBox] = await Promise.all([
    primary.boundingBox(),
    copy.boundingBox(),
  ]);
  expect(primaryBox).not.toBeNull();
  expect(copyBox).not.toBeNull();
  expect(copyBox!.x).toBeGreaterThan(primaryBox!.x + primaryBox!.width);
  expect(copyBox!.width).toBe(44);
  expect(copyBox!.height).toBe(44);
});

test("project submission renders its complete graphite control treatment", async ({
  page,
}) => {
  await page.goto(sitePath("/submit/project/"));

  await expectStyle(
    page.locator(".submission-page"),
    "background-color",
    graphiteTeal.canvas,
  );
  await expectStyle(
    page.locator(".submission-section").first(),
    "background-color",
    graphiteTeal.surface,
  );
  await expectStyle(
    page.getByRole("textbox", { name: "Project URL" }),
    "background-color",
    graphiteTeal.controlBackground,
  );

  await page
    .getByRole("combobox", { name: "Project Type" })
    .selectOption("extension");
  await page.locator(".submission-options input").first().click();
  const chip = page.locator(".submission-chips button").first();
  await expect(chip).toBeVisible();
  await expectStyle(chip, "background-color", graphiteTeal.frontendBackground);
  await expectStyle(chip, "border-top-color", graphiteTeal.frontendBorder);
  await expectStyle(chip, "color", graphiteTeal.frontendText);

  const submit = page.getByRole("button", { name: "Review submission" });
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

  await submit.evaluate((button) => {
    button.setAttribute("disabled", "");
  });
  await expectStyle(
    submit,
    "background-color",
    graphiteTeal.disabledBackground,
  );
  await expectStyle(submit, "border-top-color", graphiteTeal.disabledBorder);
  await expectStyle(submit, "color", graphiteTeal.disabledText);
});

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
    graphiteTeal.secondaryText,
  );
  await expectStyle(
    page.locator(
      '.mobile-category-menu button[data-category="all"] .all-symbol',
    ),
    "color",
    graphiteTeal.secondaryText,
  );

  const preset = page.locator(
    '.mobile-category-menu button[data-category="preset"]',
  );
  await preset.hover();
  await expectStyle(preset, "background-color", graphiteTeal.tealHover);
});

test("desktop category marks retain their semantic colors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());

  await expectStyle(
    page.locator('[data-category="frontend"] svg'),
    "color",
    graphiteTeal.frontend,
  );
  await expectStyle(
    page.locator('[data-category="preset"] svg'),
    "color",
    graphiteTeal.preset,
  );
  await expectStyle(
    page.locator('[data-category="generation-reasoning"] svg'),
    "color",
    graphiteTeal.functional,
  );
});

test("dual-range host exposes its rendered minimum hit area", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();

  const minimum = page.getByRole("slider", { name: "Minimum projects" });
  await expectStyle(minimum, "height", "28px");
  const box = await minimum.boundingBox();
  expect(box).not.toBeNull();

  // A real pointer action verifies that the native minimum thumb remains the
  // interactive target without relying on pseudo-element hit-test internals.
  await minimum.click({
    position: { x: 1, y: box!.height / 2 },
  });
  await expect(minimum).toBeFocused();
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
  await projectCard.locator(".project-card-primary-link").focus();
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
  await waitForCatalogHydration(page);

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
    fixture.style.cssText =
      "position: fixed; top: 80px; left: 16px; z-index: 1000";
    fixture.innerHTML = `
      <span class="activity-weeks"><i class="active"></i><i class="recent"></i><i></i></span>
      <span class="commit-age" data-recency="current" style="--commit-freshness: 100%">Today</span>
      <span class="commit-age" data-recency="stale" style="--commit-freshness: 0%">1mo ago</span>
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
  await expectStyle(weeks.nth(0), "background-color", graphiteTeal.textPrimary);
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
  await expectColorChannels(
    fixture.locator('[data-recency="current"]'),
    [230, 237, 243],
  );
  await expectColorChannels(
    fixture.locator('[data-recency="stale"]'),
    [130, 144, 153],
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
  await waitForCatalogHydration(page);

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
    secondary.style.cssText =
      "position: fixed; top: 80px; left: 16px; z-index: 1000";
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

test("Menu states retain the approved graphite and teal treatment", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath("/menu/"));
  await expectStyle(
    page.locator(".help-page"),
    "background-color",
    graphiteTeal.canvas,
  );
  await expectStyle(
    page.locator(".menu-group").first().locator(".menu-item").first(),
    "border-top-color",
    graphiteTeal.controlFocus,
  );

  await page.goto(
    sitePath("/menu/report-project/?project=aikohanasaki-aikobots"),
  );
  await page.getByLabel("What is wrong?").selectOption("incorrect-information");
  await expectStyle(
    page.getByLabel("What is the listing concern?"),
    "background-color",
    graphiteTeal.controlBackground,
  );

  await page.goto(
    sitePath("/menu/manage-project/?project=mentallyquill-directive"),
  );
  await page.getByRole("radio", { name: "Edit card details" }).check();
  await page.getByLabel("Summary policy").selectOption("manual");
  const ownerSummary = page.getByRole("textbox", {
    name: "Summary",
    exact: true,
  });
  await ownerSummary.fill("x".repeat(219));
  await expect(page.getByText("219 / 220")).toBeVisible();
  await expectStyle(
    ownerSummary,
    "background-color",
    graphiteTeal.controlBackground,
  );

  await page.goto(sitePath("/menu/security/"));
  await expectStyle(
    page.locator(".help-security-actions a").first(),
    "border-top-color",
    graphiteTeal.controlBorder,
  );
});

test("captures the complete Menu surface on Windows", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath("/menu/"));
  await expect(page.locator(".help-content")).toHaveScreenshot(
    "menu-page-desktop.png",
  );

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto(sitePath("/menu/"));
  await expect(page.locator(".help-content")).toHaveScreenshot(
    "menu-page-mobile.png",
  );

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(sitePath("/menu/report-kit/?kit=aiko-s-loadout-30"));
  await page.getByLabel("What is wrong?").selectOption("compatibility-problem");
  await expect(page.locator(".help-content")).toHaveScreenshot(
    "help-kit-conditional-form.png",
  );

  await page.goto(sitePath("/menu/report-website/?from=%2Fmenu%2F"));
  await page
    .getByLabel("What kind of website problem is this?")
    .selectOption("accessibility");
  await page.getByLabel("What happens instead?").fill("Focus disappears.");
  await page.getByLabel("What should happen?").fill("Focus remains visible.");
  await page
    .getByLabel("How can the problem be reproduced?")
    .fill("Open Menu and press Tab.");
  await page.getByRole("button", { name: "Review request" }).click();
  await expect(page.locator(".help-review")).toHaveScreenshot(
    "help-review-state.png",
  );

  await page.goto(
    sitePath("/menu/manage-project/?project=mentallyquill-directive"),
  );
  await page.getByRole("radio", { name: "Edit card details" }).check();
  await page.getByLabel("Summary policy").selectOption("manual");
  await page
    .getByRole("textbox", { name: "Summary", exact: true })
    .fill("x".repeat(219));
  await stabilizeOwnerFrontendVisualFixture(page);
  await expect(page.locator(".help-content")).toHaveScreenshot(
    "help-owner-near-limit.png",
    { maxDiffPixels: 3000 },
  );

  await page.goto(sitePath("/menu/security/"));
  await expect(page.locator(".help-content")).toHaveScreenshot(
    "help-private-security.png",
  );
});
