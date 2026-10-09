import { createHash } from "node:crypto";
import { expect, chromium, webkit } from "@playwright/test";
import { validateRevisionManifest } from "./revision-manifest.mjs";
import { deploymentSiteOrigin } from "./deployment-origin.mjs";

function displayedName(name) {
  return name.replace(/^sillytavern[\s_-]+/iu, "") || name;
}
export async function verifyEssentialBrowser({
  page,
  origin,
  expected,
  catalog,
  timeoutMs = 15000,
}) {
  if (origin !== deploymentSiteOrigin())
    deploymentSiteOrigin({ mode: "fixture", fixtureOrigin: origin });
  validateRevisionManifest(expected);
  const errors = [],
    resources = [];
  page.on("pageerror", () => {
    if (errors.length < 10) errors.push(true);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== origin || !/\.(?:js|css|woff2)$/u.test(url.pathname))
      return;
    const path = decodeURIComponent(url.pathname.slice(1)),
      asset = expected.assets.find((file) => file.path === path);
    if (resources.length >= 200) {
      errors.push(true);
      return;
    }
    resources.push(
      (async () => {
        if (!asset || response.status() !== 200) return false;
        const bytes = await response.body();
        return (
          bytes.length === asset.bytes &&
          createHash("sha256").update(bytes).digest("hex") === asset.sha256
        );
      })().catch(() => false),
    );
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin &&
    ["GET", "HEAD"].includes(route.request().method())
      ? route.fallback()
      : route.abort(),
  );
  await page.goto(`${origin}/`, {
    waitUntil: "domcontentloaded",
    timeout: timeoutMs,
  });
  await expect(page.locator(".catalog-shell")).toHaveAttribute(
    "data-hydrated",
    "true",
    { timeout: timeoutMs },
  );
  const project = catalog.projects.find(
    (project) =>
      /^https:\/\/(?:github\.com|codeberg\.org)\//u.test(
        project.canonicalUrl,
      ) &&
      catalog.projects.filter(
        (other) => displayedName(other.name) === displayedName(project.name),
      ).length === 1,
  );
  if (!project)
    throw new Error("Public catalog has no unique creator source to verify.");
  const search = page.getByRole("searchbox", { name: "Search projects" });
  await search.fill(project.id);
  const source = page.getByRole("link", {
    name: displayedName(project.name),
    exact: true,
  });
  await expect(source).toBeVisible({ timeout: timeoutMs });
  await expect(source).toHaveAttribute("href", project.canonicalUrl);
  await expect(source).toHaveAttribute("target", "_blank");
  await search.fill(`tavernary-empty-${expected.sourceSha}`);
  await expect(page.locator(".project-card")).toHaveCount(0, {
    timeout: timeoutMs,
  });
  await search.fill("");
  await page.getByRole("button", { name: "Kits", exact: true }).click();
  await expect(page).toHaveURL(/mode=kits/u);
  if (catalog.kits.length)
    await expect(page.locator(".kit-card").first()).toBeVisible({
      timeout: timeoutMs,
    });
  for (const [path, heading] of [
    ["/menu/", "Menu"],
    ["/submit/project/", "Submit a project"],
  ]) {
    const response = await page.goto(`${origin}${path}`, {
      waitUntil: "networkidle",
      timeout: timeoutMs,
    });
    if (response?.status() !== 200)
      throw new Error("Essential public route is unavailable.");
    await expect(
      page.getByRole("heading", { name: heading, exact: true }),
    ).toBeVisible({ timeout: timeoutMs });
  }
  await expect(
    page.getByRole("link", { name: "← Back to the catalog", exact: true }),
  ).toHaveAttribute("href", "/");
  const results = await Promise.all(resources);
  if (errors.length || !results.length || results.some((result) => !result))
    throw new Error(
      "Essential browser resources or behavior failed verification.",
    );
}
export async function runEssentialBrowserSmoke(input) {
  for (const engine of [chromium, webkit]) {
    let browser;
    if (input.signal?.aborted) return false;
    const abort = () => {
      void browser?.close().catch(() => {});
    };
    input.signal?.addEventListener("abort", abort, { once: true });
    try {
      browser = await engine.launch({ headless: true, timeout: 30000 });
      if (input.signal?.aborted) return false;
      const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(15000);
      await verifyEssentialBrowser({ ...input, page });
    } catch {
      return false;
    } finally {
      input.signal?.removeEventListener("abort", abort);
      await browser?.close();
    }
  }
  return true;
}
