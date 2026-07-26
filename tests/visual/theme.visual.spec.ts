import { expect, test, type Locator } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const graphiteTeal = {
  canvas: "rgb(13, 17, 23)",
  header: "rgb(16, 24, 32)",
  sidebar: "rgb(18, 26, 31)",
  tealBackground: "rgb(21, 59, 57)",
  tealBorder: "rgb(40, 99, 94)",
  tealText: "rgb(140, 233, 222)",
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

  await page.getByRole("button", { name: "Browse categories" }).click();
  const activeCategory = page.locator(".mobile-category-menu button.active");
  await expectStyle(
    activeCategory,
    "border-top-color",
    graphiteTeal.tealBorder,
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
