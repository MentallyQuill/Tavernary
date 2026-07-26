import { expect, test, type Locator } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const graphiteTeal = {
  canvas: "rgb(13, 17, 23)",
  header: "rgb(16, 24, 32)",
  sidebar: "rgb(18, 26, 31)",
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
  await expectStyle(
    projectCard,
    "box-shadow",
    "rgb(94, 234, 212) 0px 0px 0px 3px",
  );

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
  await expectStyle(selectedProject, "outline-color", graphiteTeal.tealBorder);
  await page.getByRole("button", { name: "Add 1 project to Kit" }).click();
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
