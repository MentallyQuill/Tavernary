import { expect, test } from "@playwright/test";
import type { Catalog } from "../../src/features/catalog/catalog-types";
import { validateRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { verifyEssentialBrowser } from "../../scripts/automation/deployment-browser-smoke.mjs";

test.use({ serviceWorkers: "block" });

test("a retained export works in both browsers without providers or external resources", async ({
  page,
  context,
  request,
  baseURL,
}) => {
  test.skip(
    process.env.TAVERNARY_OFFLINE_RESTORE_DRILL !== "true",
    "This check requires a separately restored retained bundle",
  );
  expect(baseURL).toMatch(/^http:\/\/127\.0\.0\.1:[1-9]\d*$/);
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === baseURL &&
    ["GET", "HEAD"].includes(route.request().method())
      ? route.continue()
      : route.abort(),
  );
  await context.routeWebSocket("**/*", (route) => route.close());
  const revision = await request.get("/revision.json");
  expect(revision.status()).toBe(200);
  const expected = validateRevisionManifest(await revision.json());
  const catalog = (await (
    await request.get("/catalog/tavernary-catalog-v8.json")
  ).json()) as Catalog;
  await verifyEssentialBrowser({ page, origin: baseURL!, expected, catalog });
  const blocked = await page.evaluate(async () =>
    Promise.all(
      ["https://api.github.com/", "https://example.invalid/model"].map(
        async (url) => {
          try {
            await fetch(url);
            return false;
          } catch {
            return true;
          }
        },
      ),
    ),
  );
  expect(blocked).toEqual([true, true]);
});
