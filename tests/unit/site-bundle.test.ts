import { expect, test } from "vitest";
import { createHash } from "node:crypto";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import {
  validateSiteBundle,
  encodeSiteBundle,
  decodeSiteBundle,
} from "../../scripts/automation/site-bundle.mjs";
import type { SiteBundleEntry } from "../../scripts/automation/site-bundle.mjs";
import { bundleFixture } from "../helpers/site-bundle-fixtures";

test("a complete versioned bundle verifies every file and both public catalog contracts", () => {
  const fixture = bundleFixture();
  const encoded = encodeSiteBundle(fixture);
  const verified = decodeSiteBundle(encoded);
  expect(verified.manifest).toEqual(fixture.manifest);
  expect(verified.entries.map((entry) => entry.path)).toEqual(
    fixture.entries.map((entry) => entry.path).sort(),
  );
  expect(verified.archiveDigest).toBe(
    `sha256:${createHash("sha256").update(encoded.archive).digest("hex")}`,
  );
});
test.each([
  "missing",
  "extra",
  "traversal",
  "link",
  "duplicate",
  "corrupt",
  "schema",
  "semantic",
])("invalid %s bundle cannot be restored", (variant) => {
  const fixture = bundleFixture();
  if (variant === "missing") fixture.entries.pop();
  if (variant === "extra")
    fixture.entries.push({
      path: "extra.js",
      type: "file",
      content: new Uint8Array([1]),
    });
  if (variant === "traversal") fixture.entries[0].path = "../outside";
  if (variant === "link") fixture.entries[0].type = "symlink" as "file";
  if (variant === "duplicate") fixture.entries.push(fixture.entries[0]);
  if (variant === "corrupt") fixture.entries[0].content = new Uint8Array([1]);
  if (variant === "semantic") fixture.manifest.catalogDigest = "f".repeat(64);
  if (variant === "schema") {
    const catalog = fixture.catalog;
    (catalog as Record<string, unknown>).projects = [{ id: "malformed" }];
    const entry = fixture.entries.find(
      (entry) => entry.path === "catalog/tavernary-catalog-v8.json",
    )!;
    entry.content = new TextEncoder().encode(JSON.stringify(catalog));
    fixture.manifest = buildRevisionManifest({
      sourceSha: fixture.manifest.sourceSha,
      buildId: fixture.manifest.buildId,
      catalog,
      targets: fixture.targets,
      files: fixture.entries
        .filter((entry) => entry.path !== "revision.json")
        .map((entry) => ({
          path: entry.path,
          bytes: entry.content.length,
          sha256: createHash("sha256").update(entry.content).digest("hex"),
        })),
    });
    fixture.entries.find((entry) => entry.path === "revision.json")!.content =
      new TextEncoder().encode(JSON.stringify(fixture.manifest));
  }
  expect(() =>
    validateSiteBundle({
      ...fixture,
      archiveDigest: `sha256:${"a".repeat(64)}`,
    }),
  ).toThrow();
});
test("archive byte corruption or an unsupported archive format fails before any extraction", () => {
  const encoded = encodeSiteBundle(bundleFixture());
  encoded.archive[encoded.archive.length - 1] ^= 1;
  expect(() => decodeSiteBundle(encoded)).toThrow();
  const archive = new TextEncoder().encode("unsupported format");
  expect(() =>
    decodeSiteBundle({
      archive,
      archiveDigest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
    }),
  ).toThrow();
});
test("an oversized regular entry is rejected without allocating its declared archive payload", () => {
  const fixture = bundleFixture();
  const entry = {
    ...fixture.entries[0],
    content: { byteLength: 300_000_000 },
  } as unknown as SiteBundleEntry;
  expect(() =>
    validateSiteBundle({
      ...fixture,
      entries: [entry],
      archiveDigest: `sha256:${"a".repeat(64)}`,
    }),
  ).toThrow();
});
