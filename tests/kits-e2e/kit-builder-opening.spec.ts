import { expect, test } from "@playwright/test";

test("desktop Builder reveals stable final-width content while its track expands", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

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
