import { createHash } from "node:crypto";
import type { DeploymentPlanInput } from "../../scripts/automation/deployment-plan.mjs";
import type { RevisionManifestInput } from "../../scripts/automation/revision-manifest.mjs";

export function deploymentFixture(
  overrides: Partial<DeploymentPlanInput> = {},
): DeploymentPlanInput {
  const order = ["a", "b", "c", "d"].map((value) => value.repeat(40));
  return {
    requestedSha: order[2],
    currentMainSha: order[2],
    validatedSha: order[2],
    deployedSha: order[1],
    mode: "ordinary",
    isAncestor: (ancestor, descendant) =>
      order.includes(ancestor) &&
      order.includes(descendant) &&
      order.indexOf(ancestor) <= order.indexOf(descendant),
    ...overrides,
  };
}

export function revisionFixture(
  overrides: Partial<RevisionManifestInput> = {},
): RevisionManifestInput {
  const contents: Record<string, string> = {
    "index.html": "<main>Catalog</main>",
    "menu/index.html": "<main>Menu</main>",
    "catalog/tavernary-catalog.json": JSON.stringify({
      schemaVersion: 7,
      projects: [],
    }),
    "catalog/tavernary-catalog-v8.json": JSON.stringify({
      schemaVersion: 8,
      projects: [],
      kits: [],
      tagVocabulary: {},
    }),
    "security/tavernkeeper-targets.json": JSON.stringify({
      schema_version: 3,
      repositories: [],
    }),
  };
  return {
    sourceSha: "c".repeat(40),
    buildId: "run-42-attempt-1",
    catalog: JSON.parse(contents["catalog/tavernary-catalog-v8.json"]),
    targets: JSON.parse(contents["security/tavernkeeper-targets.json"]),
    files: Object.entries(contents).map(([path, content]) => ({
      path,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    })),
    ...overrides,
  };
}
