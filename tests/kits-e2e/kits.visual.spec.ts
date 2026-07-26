import { expect, test, type Locator, type Page } from "@playwright/test";

async function openKits(
  page: Page,
  viewport: { width: number; height: number },
) {
  await page.setViewportSize(viewport);
  await page.goto("/");
  if (viewport.width <= 760) {
    await page.getByRole("button", { name: "Browse categories" }).click();
  }
  await page.getByRole("button", { name: "Kits", exact: true }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

async function expectWithinViewport(page: Page, locator: Locator) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);
}

test("desktop Kit workspace and catalog do not overlap", async ({ page }) => {
  await openKits(page, { width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const workspace = page.getByRole("complementary", { name: "Kit Builder" });
  const catalog = page.locator(".catalog-main");
  await expect(workspace).toBeVisible();
  const workspaceBox = (await workspace.boundingBox())!;
  const catalogBox = (await catalog.boundingBox())!;
  expect(catalogBox.x + catalogBox.width).toBeLessThanOrEqual(
    workspaceBox.x + 1,
  );
  await expectNoHorizontalOverflow(page);
});

test("tablet collapsed Kit Builder remains bounded", async ({ page }) => {
  await openKits(page, { width: 1024, height: 900 });
  await page.getByRole("button", { name: "Open Kit Builder" }).click();
  await page.getByRole("button", { name: "Create new Kit" }).click();
  await page.getByRole("button", { name: "Collapse Kit Builder" }).click();

  const workspace = page.locator(".kit-builder-panel");
  await expect(workspace).toHaveClass(/collapsed/);
  await expectWithinViewport(page, workspace);
  await expectNoHorizontalOverflow(page);
});

test("mobile Kit surfaces remain visible and bounded through navigation", async ({
  page,
}) => {
  await openKits(page, { width: 390, height: 844 });
  await page.getByRole("button", { name: "Open filters" }).click();
  await expect(page.getByRole("dialog", { name: "Filters" })).toBeInViewport();
  await page.getByRole("button", { name: "Close Kit filters" }).click();

  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const workspace = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(workspace).toBeVisible();
  await expectWithinViewport(page, workspace);
  await expectNoHorizontalOverflow(page);
});

test("320px card footer gives two metadata rows full width above utility actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/");

  const shell = page.locator(".project-card-shell").first();
  const footer = shell.locator(".card-bottom");
  const chips = shell.locator(".card-chips");
  const utility = shell.locator(".card-utility");
  const license = shell.locator(".license");
  const control = shell.locator(".project-kit-control-hit");
  await chips.evaluate((element) => {
    const chip = element.querySelector(".chip");
    if (!chip) throw new Error("Card metadata chip is missing");
    for (let index = 0; index < 12; index += 1) {
      const clone = chip.cloneNode(true) as HTMLElement;
      clone.textContent = `Long metadata label ${index + 1}`;
      element.append(clone);
    }
  });

  const shellBox = (await shell.boundingBox())!;
  const footerBox = (await footer.boundingBox())!;
  const chipsBox = (await chips.boundingBox())!;
  const utilityBox = (await utility.boundingBox())!;
  const licenseBox = (await license.boundingBox())!;
  const controlBox = (await control.boundingBox())!;
  const chipOverflow = await chips.evaluate((element) => {
    const firstChip = element.querySelector(".chip");
    if (!firstChip) throw new Error("Card metadata chip is missing");
    const chipHeight = firstChip.getBoundingClientRect().height;
    const style = getComputedStyle(element);
    return {
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      chipHeight,
      rowGap: Number.parseFloat(style.rowGap),
      overflow: style.overflow,
    };
  });

  expect(Math.abs(chipsBox.x - footerBox.x)).toBeLessThanOrEqual(1);
  expect(
    Math.abs(chipsBox.x + chipsBox.width - (footerBox.x + footerBox.width)),
  ).toBeLessThanOrEqual(1);
  expect(utilityBox.y).toBeGreaterThanOrEqual(chipsBox.y + chipsBox.height);
  expect(controlBox.y).toBeGreaterThanOrEqual(chipsBox.y + chipsBox.height);
  expect(chipOverflow.clientHeight).toBeLessThanOrEqual(
    chipOverflow.chipHeight * 2 + chipOverflow.rowGap + 1,
  );
  expect(chipOverflow.scrollHeight).toBeGreaterThan(chipOverflow.clientHeight);
  expect(chipOverflow.overflow).toBe("hidden");
  expect(licenseBox.x + licenseBox.width).toBeLessThanOrEqual(controlBox.x);
  expect(controlBox.x + controlBox.width).toBeLessThanOrEqual(
    shellBox.x + shellBox.width + 1,
  );
  expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
    shellBox.y + shellBox.height + 1,
  );
  await expectNoHorizontalOverflow(page);
});

test("supported Kit card keeps numeric support and its project count in the heading", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Alpha Kit" });
  await expect(card).toContainText("5 supporters");
  await expect(card.getByText("3 Projects", { exact: true })).toBeVisible();
  await expect(card).toHaveScreenshot("kit-card-supported.png", {
    animations: "disabled",
  });
});

test("Kit card without support data omits a support placeholder", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Large Stack" });
  await expect(card).not.toContainText(/supporter/i);
  await expect(card).toHaveScreenshot("kit-card-no-support.png", {
    animations: "disabled",
  });
});

test("Kit card Copy link hover has a deterministic tooltip treatment", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Alpha Kit" });
  await card.getByRole("button", { name: "Copy link" }).hover();
  await expect(
    page.getByRole("tooltip", { name: "Copy a direct link to this Kit" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("kit-card-copy-hover.png", {
    animations: "disabled",
  });
});

test("Kit card Report hover has a deterministic tooltip treatment", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Alpha Kit" });
  await card.getByRole("button", { name: "Report Kit" }).hover();
  await expect(
    page.getByRole("tooltip", { name: "Report this Kit on GitHub" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("kit-card-report-hover.png", {
    animations: "disabled",
  });
});

test("Kit card copy success notice remains visible long enough to inspect", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openKits(page, { width: 1440, height: 900 });

  const card = page.getByRole("article", { name: "Alpha Kit" });
  await card.getByRole("button", { name: "Copy link" }).click();
  await expect(
    page.getByRole("status", { name: "Kit URL copied to clipboard" }),
  ).toBeVisible();
  await expect(page).toHaveScreenshot("kit-card-copy-success.png", {
    animations: "disabled",
  });
});

test("Alpha Kit inspector renders compact direct project cards", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const inspector = page.getByRole("complementary", { name: "Kit Builder" });
  await expect(
    inspector.getByRole("link", { name: "Fixture Frontend", exact: true }),
  ).toBeVisible();
  await expect(inspector).toHaveScreenshot("alpha-kit-inspector.png", {
    animations: "disabled",
  });
});

test("large Kit inspector stays visually coherent after stack scrolling", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Large Stack" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  const body = panel.locator(".kit-builder-panel-body");
  await body.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event("scroll"));
  });
  await expect(
    panel.getByRole("link", { name: "Fixture Tool 49", exact: true }),
  ).toBeInViewport();
  await expect(panel).toHaveScreenshot("large-kit-inspector-scrolled.png", {
    animations: "disabled",
  });
});

test("Kit inspector Report link has button affordance", async ({ page }) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  await panel.getByRole("link", { name: "Report Kit" }).hover();
  await expect(panel).toHaveScreenshot("kit-inspector-report-hover.png", {
    animations: "disabled",
  });
});

test("Kit inspector withdrawal link has restrained danger affordance", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();

  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  await panel.getByRole("link", { name: "Request withdrawal" }).hover();
  await expect(panel).toHaveScreenshot("kit-inspector-withdrawal-hover.png", {
    animations: "disabled",
  });
});

test("flagged unavailable project retains compact card anatomy", async ({
  page,
}) => {
  await openKits(page, { width: 1440, height: 800 });
  await page.getByRole("button", { name: "Open Flagged Stack" }).click();

  const unavailable = page.getByRole("group", {
    name: "Fixture Flagged Tool unavailable",
  });
  await expect(unavailable).toBeVisible();
  await expect(unavailable).toHaveScreenshot(
    "flagged-unavailable-project.png",
    {
      animations: "disabled",
    },
  );
});

for (const width of [390, 320]) {
  test(`${width}px phone inspector keeps direct project cards in its sheet`, async ({
    page,
  }) => {
    await openKits(page, { width, height: 844 });
    await page.getByRole("button", { name: "Open Alpha Kit" }).click();

    const sheet = page.getByRole("dialog", { name: "Kit Builder" });
    await expect(
      sheet.getByRole("link", { name: "Fixture Frontend", exact: true }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expect(sheet).toHaveScreenshot(`alpha-kit-inspector-${width}px.png`, {
      animations: "disabled",
    });
  });
}
