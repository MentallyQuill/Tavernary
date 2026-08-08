import { expect, test, type Page } from "@playwright/test";

import { sitePath } from "../helpers/site-path";

const hasScanFixture = process.env.TAVERNARY_SCAN_FIXTURE === "true";

async function instrumentCatalogCosts(page: Page) {
  await page.addInitScript(() => {
    const metrics = {
      documentListeners: {} as Record<string, number>,
      observers: { intersection: 0, mutation: 0, resize: 0 },
    };
    Object.defineProperty(window, "__tavernKeeperCostMetrics", {
      configurable: true,
      value: metrics,
    });

    const addDocumentListener = Document.prototype.addEventListener as (
      this: Document,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) => void;
    Document.prototype.addEventListener = function (
      this: Document,
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: boolean | AddEventListenerOptions,
    ) {
      metrics.documentListeners[type] =
        (metrics.documentListeners[type] ?? 0) + 1;
      return addDocumentListener.call(this, type, listener, options);
    } as typeof Document.prototype.addEventListener;

    for (const [name, key] of [
      ["IntersectionObserver", "intersection"],
      ["MutationObserver", "mutation"],
      ["ResizeObserver", "resize"],
    ] as const) {
      const Original = window[name];
      if (!Original) continue;
      Object.defineProperty(window, name, {
        configurable: true,
        value: class extends Original {
          constructor(...arguments_: ConstructorParameters<typeof Original>) {
            metrics.observers[key] += 1;
            super(...arguments_);
          }
        },
      });
    }
  });
}

async function catalogCostSnapshot(
  page: Page,
  { removeScanIndicators = false }: { removeScanIndicators?: boolean } = {},
) {
  return page.evaluate(
    async ({ removeScanIndicators }) => {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await new Promise<void>((resolve) => setTimeout(resolve, 250));
      if (removeScanIndicators) {
        document
          .querySelectorAll(".tavernkeeper-scan-indicator-trigger")
          .forEach((element) => element.remove());
      }
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      const longTasks: number[] = [];
      let observer: PerformanceObserver | null = null;
      if (
        typeof PerformanceObserver === "function" &&
        PerformanceObserver.supportedEntryTypes.includes("longtask")
      ) {
        observer = new PerformanceObserver((list) => {
          longTasks.push(...list.getEntries().map(({ duration }) => duration));
        });
        observer.observe({ entryTypes: ["longtask"] });
      }

      const frameGaps: number[] = [];
      for (let iteration = 0; iteration < 5; iteration += 1) {
        const started = performance.now();
        window.scrollTo({ top: document.documentElement.scrollHeight });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              frameGaps.push(performance.now() - started);
              resolve();
            }),
          ),
        );
        window.scrollTo({ top: 0 });
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
      }
      observer?.disconnect();

      const metrics = (
        window as typeof window & {
          __tavernKeeperCostMetrics: {
            documentListeners: Record<string, number>;
            observers: Record<string, number>;
          };
        }
      ).__tavernKeeperCostMetrics;
      return {
        cards: document.querySelectorAll(".project-card").length,
        documentElements: document.querySelectorAll("*").length,
        freshnessClocks: document.querySelectorAll(
          'svg.tavernkeeper-freshness-clock[data-icon="clock"]',
        ).length,
        historyBlocks: document.querySelectorAll(
          ".tavernkeeper-history-strip i",
        ).length,
        listeners: Object.fromEntries(
          ["focusin", "keydown", "pointerdown"].map((type) => [
            type,
            metrics.documentListeners[type] ?? 0,
          ]),
        ),
        longTaskMax: longTasks.length ? Math.max(...longTasks) : null,
        observerCount: Object.values(metrics.observers).reduce(
          (total, count) => total + count,
          0,
        ),
        openPopovers: document.querySelectorAll(".tavernkeeper-popover").length,
        scanGlyphs: document.querySelectorAll('svg[data-icon="scan-fill"]')
          .length,
        svgs: document.querySelectorAll("svg").length,
        tooltipAnchors: document.querySelectorAll(
          ".tavernkeeper-scan-indicator-trigger .tooltip-anchor",
        ).length,
        worstFrameGap: Math.max(...frameGaps),
      };
    },
    { removeScanIndicators },
  );
}

test(
  "TavernKeeper mobile touch, orientation, viewport, and reduced-motion smoke",
  { tag: "@tavernkeeper" },
  async ({ page }, testInfo) => {
    test.skip(!hasScanFixture, "Requires the TavernKeeper scan fixture");
    test.skip(
      !testInfo.project.name.startsWith("mobile-"),
      "Representative mobile projects own this smoke case",
    );
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(sitePath());

    const trigger = page
      .locator(".tavernkeeper-scan-indicator-trigger")
      .first();
    const hitTarget = await trigger.evaluate((element) => {
      const box = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, "::before");
      const inset = Math.abs(Number.parseFloat(pseudo.inset));
      return { height: box.height + inset * 2, width: box.width + inset * 2 };
    });
    expect(hitTarget.width).toBeGreaterThanOrEqual(44);
    expect(hitTarget.height).toBeGreaterThanOrEqual(44);

    await trigger.tap();
    const panel = page.getByRole("dialog", {
      name: "TavernKeeper Scan Results",
    });
    await expect(panel).toBeVisible();
    const transitionSeconds = await panel.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).transitionDuration),
    );
    expect(transitionSeconds).toBeLessThanOrEqual(0.000_01);
    const portraitBox = await panel.boundingBox();
    const portraitViewport = page.viewportSize();
    expect(portraitBox).not.toBeNull();
    expect(portraitViewport).not.toBeNull();
    expect(portraitBox!.y + portraitBox!.height).toBeLessThanOrEqual(
      portraitViewport!.height + 1,
    );

    await page.setViewportSize({ width: 844, height: 390 });
    const landscapeBox = await panel.boundingBox();
    expect(landscapeBox).not.toBeNull();
    expect(landscapeBox!.x + landscapeBox!.width).toBeLessThanOrEqual(845);
    expect(landscapeBox!.y + landscapeBox!.height).toBeLessThanOrEqual(391);
    await page.keyboard.press("Escape");
    await expect(trigger).toBeFocused();
  },
);

test(
  "TavernKeeper catalog cost stays bounded between full and filtered views",
  { tag: "@tavernkeeper" },
  async ({ page }, testInfo) => {
    test.skip(!hasScanFixture, "Requires the TavernKeeper scan fixture");
    test.skip(
      testInfo.project.name !== "chromium",
      "Chromium owns the deterministic full-catalog cost comparison",
    );
    await instrumentCatalogCosts(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(sitePath());
    const featureOff = await catalogCostSnapshot(page, {
      removeScanIndicators: true,
    });

    await page.goto(sitePath());
    const full = await catalogCostSnapshot(page);

    await page.goto(`${sitePath()}?q=Recursion`);
    await expect(
      page.getByRole("searchbox", { name: "Search projects" }),
    ).toHaveValue("Recursion");
    await expect(page).toHaveURL(/\?q=Recursion$/u);
    const filtered = await catalogCostSnapshot(page);

    await testInfo.attach("tavernkeeper-catalog-costs.json", {
      body: Buffer.from(
        JSON.stringify({ featureOff, full, filtered }, null, 2),
      ),
      contentType: "application/json",
    });
    console.info(
      "TavernKeeper catalog costs:",
      JSON.stringify({ featureOff, full, filtered }),
    );

    expect(featureOff.cards).toBe(full.cards);
    expect(featureOff.scanGlyphs).toBe(0);
    expect(full.cards).toBeGreaterThan(filtered.cards);
    expect(full.scanGlyphs).toBe(full.cards);
    expect(full.freshnessClocks).toBe(1);
    expect(
      full.documentElements - featureOff.documentElements,
    ).toBeLessThanOrEqual(full.cards * 4);
    expect(full.svgs - featureOff.svgs).toBeLessThanOrEqual(
      full.cards + full.freshnessClocks,
    );
    expect(full.openPopovers).toBe(0);
    expect(full.historyBlocks).toBe(0);
    expect(full.tooltipAnchors).toBe(0);
    expect(full.listeners).toEqual(filtered.listeners);
    expect(full.listeners).toEqual(featureOff.listeners);
    expect(full.observerCount).toBeLessThanOrEqual(filtered.observerCount + 1);
    expect(full.observerCount).toBeLessThanOrEqual(
      featureOff.observerCount + 1,
    );
    const featureOffLongTask = featureOff.longTaskMax ?? 0;
    expect(featureOffLongTask).toBeLessThan(250);
    expect(featureOff.worstFrameGap).toBeLessThan(200);
    expect(full.longTaskMax ?? 0).toBeLessThanOrEqual(
      Math.max(200, featureOffLongTask),
    );
    for (const snapshot of [full, filtered]) {
      expect(snapshot.longTaskMax ?? 0).toBeLessThan(200);
      expect(snapshot.worstFrameGap).toBeLessThan(200);
    }
  },
);
