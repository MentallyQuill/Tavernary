import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import type { Catalog } from "../../src/features/catalog/catalog-types";
import { validateRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import { verifyEssentialBrowser } from "../../scripts/automation/deployment-browser-smoke.mjs";

test("the native confirmation CLI completes actual HTTP and both browser engines", async ({
  request,
  browserName,
}) => {
  test.skip(
    !process.env.TAVERNARY_DEPLOYMENT_FIXTURE_ORIGIN ||
      browserName !== "chromium",
    "The CLI failure regression runs once against a local export",
  );
  const expected = validateRevisionManifest(
    await (await request.get("/revision.json")).json(),
  );
  const root = resolve(".tmp", `confirmation-cli-${randomUUID()}`);
  await mkdir(root, { recursive: true });
  try {
    const manifestPath = resolve(root, "revision.json"),
      resultPath = resolve(root, "confirmation.json");
    await writeFile(manifestPath, JSON.stringify(expected));
    await promisify(execFile)(
      process.execPath,
      [
        "scripts/automation/confirm-deployment.mjs",
        manifestPath,
        resultPath,
        "--fixture",
      ],
      { timeout: 30000, maxBuffer: 20000, windowsHide: true },
    );
    expect(JSON.parse(await readFile(resultPath, "utf8"))).toMatchObject({
      status: "confirmed",
      deployment: {
        sourceSha: expected.sourceSha,
        confirmation: { essentialSmokePassed: true },
      },
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("the exact deployed revision supports essential public behavior", async ({
  page,
  request,
  baseURL,
}) => {
  const revision = await request.get("/revision.json");
  expect(revision.status()).toBe(200);
  const expected = validateRevisionManifest(await revision.json());
  const catalog = (await (
    await request.get("/catalog/tavernary-catalog-v8.json")
  ).json()) as Catalog;
  await verifyEssentialBrowser({ page, origin: baseURL!, expected, catalog });
});
test("unhydrated catalog resources cannot pass the essential browser probe", async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(
    !process.env.TAVERNARY_DEPLOYMENT_FIXTURE_ORIGIN,
    "Failure injection is confined to a local export",
  );
  const expected = validateRevisionManifest(
    await (await request.get("/revision.json")).json(),
  );
  const catalog = (await (
    await request.get("/catalog/tavernary-catalog-v8.json")
  ).json()) as Catalog;
  await page.route("**/_next/**/*.js", (route) => route.abort());
  await expect(
    verifyEssentialBrowser({
      page,
      origin: baseURL!,
      expected,
      catalog,
      timeoutMs: 1500,
    }),
  ).rejects.toThrow();
});
