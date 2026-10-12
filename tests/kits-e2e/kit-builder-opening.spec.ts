import { expect, test, type Page } from "@playwright/test";
import { sitePath } from "../helpers/site-path";

type BuilderMotionWindow = Window & {
  builderEntry: Promise<{
    started: boolean;
    samples: number[];
    error: string | null;
  }>;
  builderExit: Promise<Array<{ top: number; backgroundInert: boolean }>>;
};

async function openPhoneInspector(page: Page) {
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  const sheet = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(sheet).toHaveAttribute("data-motion-phase", "entered");
  await expect(sheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  return sheet;
}

test("desktop Builder toggle stays anchored between collapsed and expanded states", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());

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

for (const width of [1440, 980]) {
  test(`${width}px Builder resizes its track once while revealing final-width content`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(sitePath());
    const panel = page.locator(".kit-builder-panel");
    const body = panel.locator(".kit-builder-panel-body");
    const frame = panel.locator(".kit-builder-panel-body-frame");
    await page
      .getByRole("button", { name: "Open Kit Builder", exact: true })
      .click();
    await expect(frame).toHaveCSS("opacity", "1");
    const expandedWidth = (await panel.boundingBox())!.width;
    const expandedBodyWidth = (await body.boundingBox())!.width;

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const collapsed = await page.evaluate(
        () =>
          new Promise<{
            buttonRight: number;
            panelRight: number;
            panelWidth: number;
            railWidth: number;
            viewportRight: number;
          }>((resolve) => {
            document
              .querySelector<HTMLButtonElement>(
                '[aria-label="Collapse Kit Builder"]',
              )!
              .click();
            requestAnimationFrame(() => {
              const panelRect = document
                .querySelector(".kit-builder-panel")!
                .getBoundingClientRect();
              resolve({
                buttonRight: document
                  .querySelector('[aria-label="Open Kit Builder"]')!
                  .getBoundingClientRect().right,
                panelRight: panelRect.right,
                panelWidth: panelRect.width,
                railWidth: document
                  .querySelector(".kit-builder-rail")!
                  .getBoundingClientRect().width,
                viewportRight:
                  window.visualViewport?.width ?? window.innerWidth,
              });
            });
          }),
      );
      expect(collapsed.panelWidth).toBeCloseTo(72, 0);
      expect(collapsed.railWidth).toBeCloseTo(71, 0);
      expect(collapsed.panelRight).toBeCloseTo(collapsed.viewportRight, 0);
      expect(
        Math.abs(collapsed.buttonRight - (collapsed.viewportRight - 12)),
      ).toBeLessThan(1);

      const opening = await page.evaluate(
        () =>
          new Promise<
            Array<{
              bodyWidth: number;
              panelWidth: number;
              opacity: number;
              translateX: number;
            }>
          >((resolve, reject) => {
            const samples: Array<{
              bodyWidth: number;
              panelWidth: number;
              opacity: number;
              translateX: number;
            }> = [];
            const deadline = performance.now() + 1_000;
            let startedAt = 0;
            const sample = () => {
              const panel = document.querySelector(".kit-builder-panel");
              const frame = document.querySelector(
                ".kit-builder-panel-body-frame",
              );
              const body = document.querySelector(".kit-builder-panel-body");
              if (panel && frame && body) {
                startedAt ||= performance.now();
                const style = getComputedStyle(frame);
                samples.push({
                  bodyWidth: body.getBoundingClientRect().width,
                  panelWidth: panel.getBoundingClientRect().width,
                  opacity: Number(style.opacity),
                  translateX: new DOMMatrixReadOnly(style.transform).m41,
                });
                if (performance.now() - startedAt > 250) {
                  resolve(samples);
                  return;
                }
              }
              if (performance.now() >= deadline) {
                reject(new Error("Kit Builder did not reveal its content"));
                return;
              }
              requestAnimationFrame(sample);
            };
            document
              .querySelector<HTMLButtonElement>(
                '[aria-label="Open Kit Builder"]',
              )!
              .click();
            requestAnimationFrame(sample);
          }),
      );
      expect(opening.length).toBeGreaterThan(2);
      for (const sample of opening) {
        expect(sample.panelWidth).toBeCloseTo(expandedWidth, 0);
        expect(sample.bodyWidth).toBeCloseTo(expandedBodyWidth, 0);
      }
      expect(
        opening.some(
          ({ opacity, translateX }) =>
            opacity > 0 && opacity < 1 && translateX > 0,
        ),
      ).toBe(true);
      expect(opening.at(-1)!.opacity).toBe(1);
      expect(opening.at(-1)!.translateX).toBe(0);
    }
  });
}

test("phone Builder keyboard entry and exit interpolate motion while retaining modal presence and returning focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Browse categories" }).click();
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page.locator(".filter-sheet")).toBeHidden();
  const opener = page.getByRole("button", { name: "Open Alpha Kit" });
  await opener.focus();
  await expect(opener).toBeFocused();
  const viewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  await page.evaluate(() => {
    (window as unknown as BuilderMotionWindow).builderEntry = new Promise(
      (resolve) => {
        const samples: number[] = [];
        let started = false;
        let frame = 0;
        const finish = (error: string | null) => {
          window.clearTimeout(timeout);
          document.removeEventListener("transitionrun", onTransition, true);
          if (frame) cancelAnimationFrame(frame);
          resolve({ started, samples, error });
        };
        const sample = () => {
          frame = 0;
          const sheet = document.querySelector(
            '.kit-builder-panel[role="dialog"]',
          );
          if (!sheet) {
            finish("Kit Builder disappeared during entry");
            return;
          }
          const top = sheet.getBoundingClientRect().top;
          samples.push(top);
          if (top < 1) {
            finish(null);
            return;
          }
          frame = requestAnimationFrame(sample);
        };
        const onTransition = (event: TransitionEvent) => {
          if (
            event.propertyName !== "transform" ||
            !(event.target instanceof HTMLElement) ||
            !event.target.matches('.kit-builder-panel[role="dialog"]')
          ) {
            return;
          }
          started = true;
          document.removeEventListener("transitionrun", onTransition, true);
          // Observe the browser's transition before reading any sheet geometry.
          frame = requestAnimationFrame(sample);
        };
        const timeout = window.setTimeout(() => {
          finish(
            started
              ? "Kit Builder did not finish entering"
              : "Kit Builder did not start a transform transition",
          );
        }, 3_000);
        document.addEventListener("transitionrun", onTransition, {
          capture: true,
          passive: true,
        });
      },
    );
  });
  await opener.press("Enter");
  const entry = await page.evaluate(
    () => (window as unknown as BuilderMotionWindow).builderEntry,
  );
  expect(entry.error).toBeNull();
  expect(entry.started).toBe(true);
  expect(
    entry.samples.some((top) => top > 1 && top < viewport.height - 1),
  ).toBe(true);
  const sheet = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(sheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  const box = (await sheet.boundingBox())!;
  expect(box.width).toBeCloseTo(viewport.width, 2);
  expect(box.height).toBeCloseTo(viewport.height, 2);

  await page.evaluate(() => {
    (window as unknown as BuilderMotionWindow).builderExit = new Promise<
      Array<{ top: number; backgroundInert: boolean }>
    >((resolve, reject) => {
      const samples: Array<{ top: number; backgroundInert: boolean }> = [];
      const deadline = performance.now() + 1_000;
      const sample = () => {
        const sheet = document.querySelector(
          '.kit-builder-panel[role="dialog"]',
        );
        if (!sheet) {
          resolve(samples);
          return;
        }
        samples.push({
          top: sheet.getBoundingClientRect().top,
          backgroundInert: document
            .querySelector(".catalog-main")!
            .hasAttribute("inert"),
        });
        if (performance.now() >= deadline) {
          reject(new Error("Kit Builder did not finish exiting"));
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
  });
  await page.keyboard.press("Escape");
  const exit = await page.evaluate(
    () => (window as unknown as BuilderMotionWindow).builderExit,
  );
  expect(exit.some(({ top }) => top > 1 && top < viewport.height - 1)).toBe(
    true,
  );
  expect(exit.every(({ backgroundInert }) => backgroundInert)).toBe(true);
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".catalog-main")).not.toHaveAttribute("inert");
  await expect(
    page.getByRole("button", { name: "Open Alpha Kit" }),
  ).toBeFocused();
});

test("Builder preserves viewport fit and modal focus when switching between desktop and phone", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await page.getByRole("button", { name: "Open Alpha Kit" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneViewport = await page.evaluate(() => ({
    width: window.visualViewport?.width ?? window.innerWidth,
    height: window.visualViewport?.height ?? window.innerHeight,
  }));
  const sheet = page.getByRole("dialog", { name: "Kit Builder" });
  await expect(sheet).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await expect(
    sheet.getByRole("heading", { name: "Kit Builder", exact: true }),
  ).toBeFocused();
  const phoneBox = (await sheet.boundingBox())!;
  expect(phoneBox.width).toBeCloseTo(phoneViewport.width, 2);
  expect(phoneBox.height).toBeCloseTo(phoneViewport.height, 2);

  await page.setViewportSize({ width: 980, height: 900 });
  const panel = page.getByRole("complementary", { name: "Kit Builder" });
  await expect(panel).toBeVisible();
  await expect(page.locator(".catalog-main")).not.toHaveAttribute("inert");
  const geometry = await panel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      right: rect.right,
      viewportWidth: window.visualViewport?.width ?? window.innerWidth,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  expect(geometry.bottom).toBeCloseTo(geometry.viewportHeight, 0);
  expect(geometry.right).toBeCloseTo(geometry.viewportWidth, 0);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(
    Math.ceil(geometry.viewportWidth),
  );
});

test("reduced motion settles desktop reveal and phone dismissal immediately", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(sitePath());
  await page
    .getByRole("button", { name: "Open Kit Builder", exact: true })
    .click();
  const frame = page.locator(".kit-builder-panel-body-frame");
  await expect(frame).toHaveCSS("opacity", "1");
  expect(
    await frame.evaluate((element) =>
      parseFloat(getComputedStyle(element).animationDuration),
    ),
  ).toBeLessThan(0.001);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(sitePath());
  const sheet = await openPhoneInspector(page);
  expect(
    await sheet.evaluate((element) =>
      parseFloat(getComputedStyle(element).transitionDuration),
    ),
  ).toBeLessThan(0.001);
  await page.getByRole("button", { name: "Close Kit Builder" }).click();
  await expect(sheet).toHaveCount(0);
  await expect(page.locator(".catalog-main")).not.toHaveAttribute("inert");
});
