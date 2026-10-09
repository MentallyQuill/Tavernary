import { createHash } from "node:crypto";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import type { SiteBundleEntry } from "../../scripts/automation/site-bundle.mjs";
export function bundleFixture() {
  const catalog = {
    schemaVersion: 8,
    generatedAt: "2026-10-08T12:00:00.000Z",
    projects: [],
    kits: [],
    tagVocabulary: [],
  };
  const legacy = { ...catalog, schemaVersion: 7 };
  const targets = {
    schema_version: 3,
    generated_at: catalog.generatedAt,
    repositories: [],
  };
  const contents: Record<string, string> = {
    "index.html": "<main>Catalog</main>",
    "menu/index.html": "<main>Menu</main>",
    "catalog/tavernary-catalog-v8.json": JSON.stringify(catalog),
    "catalog/tavernary-catalog.json": JSON.stringify(legacy),
    "security/tavernkeeper-targets.json": JSON.stringify(targets),
  };
  const entries: SiteBundleEntry[] = Object.entries(contents).map(
    ([path, content]) => ({
      path,
      type: "file",
      content: new TextEncoder().encode(content),
    }),
  );
  const manifest = buildRevisionManifest({
    sourceSha: "c".repeat(40),
    buildId: "run-42-attempt-1",
    catalog,
    targets,
    files: entries.map((entry) => ({
      path: entry.path,
      bytes: entry.content.length,
      sha256: createHash("sha256").update(entry.content).digest("hex"),
    })),
  });
  entries.push({
    path: "revision.json",
    type: "file",
    content: new TextEncoder().encode(JSON.stringify(manifest)),
  });
  return { manifest, entries, catalog, targets };
}
