import { execFileSync } from "node:child_process";
import { expect, test } from "vitest";
import {
  loadAutomationInventory,
  discoverAutomationState,
} from "../../scripts/automation/inventory.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { discoverCatalogOperations } from "../../scripts/automation/catalog-operations.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import {
  catalogInventoryFixture,
  preparedResultFixture,
} from "../helpers/automation-fixtures";
import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { automationDataDigests } from "../../scripts/automation/data-digests.mjs";
test("production inventory uses the complete canonical build inputs, including installs and Kit support", async () => {
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const gh = async (args: string[]) => {
    const route = args.find((arg) => arg.startsWith("repos/"))!;
    if (route.endsWith("/git/ref/heads/main"))
      return JSON.stringify({ object: { sha: revision } });
    if (route.endsWith("/issues") || route.endsWith("/pulls"))
      return JSON.stringify([[]]);
    if (route.endsWith("/actions/runs"))
      return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
    throw new Error(`Unexpected GitHub fixture route: ${route}`);
  };
  const state = await loadAutomationInventory({
    root: process.cwd(),
    gh,
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    reportIndex: {
      schema_version: 5,
      generated_at: "2026-10-08T12:00:00Z",
      reports: [],
    },
  });
  const catalog = await buildCatalog({ write: false });
  const expected = automationDataDigests({
    catalog,
    targets: { schema_version: 3, repositories: [] },
  });
  expect(state.local.catalogDigest).toBe(expected.catalogDigest);
  expect(state.local.installEvidence).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ source_id: expect.any(String) }),
    ]),
  );
  expect(state.local.kitSnapshots).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ kit_id: expect.any(String) }),
    ]),
  );
}, 20_000);
test("canonical proof takes precedence when unchanged metadata also remains discoverable", () => {
  const input = catalogInventoryFixture();
  const operation = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "metadata",
  )!;
  const result = preparedResultFixture({
    operationKey: operation.key,
    kind: "metadata",
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
  });
  const record = createCanonicalPublicationRecord({ operation, result });
  const revision = "d".repeat(40);
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: input.nowMs,
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: revision },
    receipts: [],
    local: {
      projects: input.catalog.projects,
      sources: input.catalog.sources,
      snapshots: input.evidence,
      metadataState: input.metadataState,
      advisoryState: input.advisoryState,
      deployments: [],
      kits: [],
      blockedUsers: { blocked: [] },
      revision,
      publications: [{ record, revision }],
      publicationFileDigests: {
        [`${revision}:${result.files[0].path}`]: result.files[0].sha256,
      },
    },
    operations: [],
  };
  const matches = discoverAutomationState(state).filter(
    (current) => current.key === operation.key,
  );
  expect(matches).toHaveLength(1);
  expect(matches[0].stage).toBe("published");
});
