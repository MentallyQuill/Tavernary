import { createHash } from "node:crypto";
import { buildRevisionManifest } from "../../scripts/automation/revision-manifest.mjs";
import type { ConfirmationInput } from "../../scripts/automation/confirm-deployment.mjs";
import { revisionFixture } from "./deployment-fixtures";

export function confirmationFixture(
  options: {
    wrongRevision?: boolean;
    corruptAsset?: boolean;
    brokenSearch?: boolean;
    unsupportedSchema?: boolean;
  } = {},
) {
  const base = revisionFixture();
  const content: Record<string, Uint8Array> = {
    "index.html": Buffer.from("<main>Catalog</main>"),
    "menu/index.html": Buffer.from("<main>Menu</main>"),
    "catalog/tavernary-catalog.json": Buffer.from(
      JSON.stringify({ schemaVersion: 7, projects: [] }),
    ),
    "catalog/tavernary-catalog-v8.json": Buffer.from(
      JSON.stringify(base.catalog),
    ),
    "security/tavernkeeper-targets.json": Buffer.from(
      JSON.stringify(base.targets),
    ),
  };
  const expected = buildRevisionManifest({
    ...base,
    files: Object.entries(content).map(([path, bytes]) => ({
      path,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    })),
  });
  const publicManifest = structuredClone(expected);
  if (options.wrongRevision) publicManifest.sourceSha = "b".repeat(40);
  if (options.unsupportedSchema)
    (publicManifest as { catalogSchemaVersion: number }).catalogSchemaVersion =
      9;
  if (options.corruptAsset) content["index.html"] = Buffer.from("corrupt");
  let smokeCalls = 0;
  const input: ConfirmationInput = {
    expected,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    fetchManifest: async () => publicManifest,
    fetchCatalog: async () => content["catalog/tavernary-catalog-v8.json"],
    fetchTargets: async () => content["security/tavernkeeper-targets.json"],
    fetchAsset: async (path) => content[path],
    browserSmoke: async () => {
      smokeCalls++;
      return !options.brokenSearch;
    },
  };
  return { input, content, publicManifest, smokeCalls: () => smokeCalls };
}
