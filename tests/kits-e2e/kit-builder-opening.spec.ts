import { expect, test } from "@playwright/test";

test("desktop Builder toggle stays anchored between collapsed and expanded states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const open = page.getByRole("button", {
    name: "Open Kit Builder",
    exact: true,
  });
  const openBox = (await open.boundingBox())!;

  await open.click();

  const collapse = page.getByRole("button", {
    name: "Collapse Kit Builder",
    exact: true,
  });
  const collapseBox = (await collapse.boundingBox())!;

  expect(Math.abs(collapseBox.x - openBox.x)).toBeLessThan(1);
  expect(Math.abs(collapseBox.y - openBox.y)).toBeLessThan(1);
  expect(collapseBox.width).toBeCloseTo(openBox.width, 0);
  expect(collapseBox.height).toBeCloseTo(openBox.height, 0);
});

test("desktop Builder reveals stable final-width content while its track expands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Open Kit Builder", exact: true })
    .click();
  await page.waitForTimeout(250);

  const panel = page.locator(".kit-builder-panel");
  const body = panel.locator(".kit-builder-panel-body");
  const expandedWidth = (await panel.boundingBox())!.width;
  const expandedBodyWidth = (await body.boundingBox())!.width;

  await page
    .getByRole("button", { name: "Collapse Kit Builder", exact: true })
    .click();
  await expect(panel).toHaveCSS("width", "72px");
  await page.waitForTimeout(250);

  const openingFrame = await page.evaluate(
    ({ finalPanelWidth }) =>
      new Promise<{ bodyWidth: number; panelWidth: number }>(
        (resolve, reject) => {
          const openButton = document.querySelector<HTMLButtonElement>(
            '[aria-label="Open Kit Builder"]',
          );
          if (!openButton) {
            reject(new Error("Kit Builder open control is missing"));
            return;
          }

          const deadline = performance.now() + 1_000;
          const sample = () => {
            const openingPanel =
              document.querySelector<HTMLElement>(".kit-builder-panel");
            const openingBody = document.querySelector<HTMLElement>(
              ".kit-builder-panel-body",
            );
            if (!openingPanel || !openingBody) {
              reject(new Error("Kit Builder did not open"));
              return;
            }

            const panelWidth = openingPanel.getBoundingClientRect().width;
            if (panelWidth > 73 && panelWidth < finalPanelWidth - 1) {
              resolve({
                bodyWidth: openingBody.getBoundingClientRect().width,
                panelWidth,
              });
              return;
            }
            if (performance.now() >= deadline) {
              reject(new Error("Kit Builder did not expose an opening frame"));
              return;
            }
            requestAnimationFrame(sample);
          };
          openButton.click();
          requestAnimationFrame(sample);
        },
      ),
    { finalPanelWidth: expandedWidth },
  );

  expect(openingFrame.panelWidth).toBeLessThan(expandedWidth);
  expect(openingFrame.bodyWidth).toBeCloseTo(expandedBodyWidth, 0);
  expect(openingFrame.bodyWidth).toBeGreaterThan(openingFrame.panelWidth - 37);
});

test("desktop Builder folds inward while its collapsed rail stays at the edge", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  await page
    .getByRole("button", { name: "Open Kit Builder", exact: true })
    .click();
  await page.waitForTimeout(250);

  const panel = page.locator(".kit-builder-panel");
  const expandedWidth = (await panel.boundingBox())!.width;

  const closingFrame = await page.evaluate(
    ({ finalPanelWidth }) =>
      new Promise<{
        buttonRight: number;
        panelRight: number;
        panelWidth: number;
        railWidth: number;
        viewportRight: number;
      }>((resolve, reject) => {
        const collapseButton = document.querySelector<HTMLButtonElement>(
          '[aria-label="Collapse Kit Builder"]',
        );
        if (!collapseButton) {
          reject(new Error("Kit Builder collapse control is missing"));
          return;
        }

        const deadline = performance.now() + 1_000;
        const sample = () => {
          const closingPanel =
            document.querySelector<HTMLElement>(".kit-builder-panel");
          const openButton = document.querySelector<HTMLElement>(
            '[aria-label="Open Kit Builder"]',
          );
          const rail = document.querySelector<HTMLElement>(".kit-builder-rail");
          if (!closingPanel || !openButton || !rail) {
            reject(new Error("Kit Builder collapsed rail is missing"));
            return;
          }

          const panelRect = closingPanel.getBoundingClientRect();
          if (panelRect.width > 73 && panelRect.width < finalPanelWidth - 1) {
            resolve({
              buttonRight: openButton.getBoundingClientRect().right,
              panelRight: panelRect.right,
              panelWidth: panelRect.width,
              railWidth: rail.getBoundingClientRect().width,
              viewportRight: document.documentElement.clientWidth,
            });
            return;
          }
          if (performance.now() >= deadline) {
            reject(new Error("Kit Builder did not expose a closing frame"));
            return;
          }
          requestAnimationFrame(sample);
        };

        collapseButton.click();
        requestAnimationFrame(sample);
      }),
    { finalPanelWidth: expandedWidth },
  );

  expect(closingFrame.panelWidth).toBeGreaterThan(72);
  expect(closingFrame.panelWidth).toBeLessThan(expandedWidth);
  expect(closingFrame.railWidth).toBeCloseTo(71, 0);
  expect(closingFrame.panelRight).toBeCloseTo(closingFrame.viewportRight, 0);
  expect(
    Math.abs(closingFrame.buttonRight - (closingFrame.viewportRight - 18)),
  ).toBeLessThan(1);
});
