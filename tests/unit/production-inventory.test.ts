import { expect, test } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { productionInventoryRoot } from "../helpers/production-inventory-root.mjs";
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
  receiptFixture,
} from "../helpers/automation-fixtures";
import { buildCatalog } from "../../scripts/catalog/build.mjs";
import { automationDataDigests } from "../../scripts/automation/data-digests.mjs";

test("scoping never grants publication authority and missing receipts retain full inventory discovery", async () => {
  const fixture = await productionInventoryRoot();
  try {
    const receipt = receiptFixture();
    Object.assign(receipt.operation, {
      stage: "deployment-confirmed",
      expectedSha: fixture.revision,
    });
    const directory = join(
      fixture.root,
      "data/maintenance/automation/operations",
    );
    await mkdir(directory, { recursive: true });
    const path = join(directory, `${receipt.operation.key}.json`);
    await writeFile(path, JSON.stringify(receipt));
    const calls: string[][] = [];
    const gh = async (args: string[]) => {
      calls.push(args);
      const route = args.find((arg) => arg.startsWith("repos/"))!;
      if (route.endsWith("/git/ref/heads/main"))
        return JSON.stringify({ object: { sha: fixture.revision } });
      if (route.endsWith("/issues/42"))
        return JSON.stringify({
          number: 42,
          state: "closed",
          body: "removed request",
          labels: [],
          user: { id: 1, type: "User" },
        });
      if (route.endsWith("/issues") || route.endsWith("/pulls")) return "[[]]";
      if (route.endsWith("/actions/runs"))
        return JSON.stringify([{ total_count: 0, workflow_runs: [] }]);
      throw new Error(`Unexpected fixture route ${route}`);
    };
    const input = {
      root: fixture.root,
      gh,
      repository: "MentallyQuill/Tavernary",
      publisherActorId: 41_982_982,
      nowMs: Date.parse("2026-10-08T12:00:00Z"),
      reportIndex: {
        schema_version: 5 as const,
        generated_at: "2026-10-08T12:00:00Z",
        reports: [],
      },
      finalizationOperationKey: receipt.operation.key,
    };
    const scoped = await loadAutomationInventory(input);
    expect(
      calls.some((args) => args.some((arg) => arg.endsWith("/issues/42"))),
    ).toBe(true);
    expect(calls.some((args) => args.includes("state=open"))).toBe(true);
    expect(scoped.remote.finalizationOperationKey).toBeUndefined();
    expect(
      scoped.operations.some(
        (operation) => operation.key === receipt.operation.key,
      ),
    ).toBe(false);
    await rm(path);
    calls.length = 0;
    const missing = await loadAutomationInventory(input);
    expect(calls.some((args) => args.includes("state=open"))).toBe(true);
    expect(missing.remote.finalizationOperationKey).toBeUndefined();
    expect(missing.local.catalogDigest).toBe(scoped.local.catalogDigest);
    expect(missing.local.targetDigest).toBe(scoped.local.targetDigest);
    expect(missing.local.projects).toEqual(scoped.local.projects);
    expect(missing.local.kits).toEqual(scoped.local.kits);
  } finally {
    await fixture.cleanup();
  }
}, 20_000);
test("inventory fixtures preserve staged, unstaged, new and deleted canonical files", async () => {
  const source = await productionInventoryRoot();
  let fixture: Awaited<ReturnType<typeof productionInventoryRoot>> | undefined;
  try {
    const changed = "config/supported-runtimes.json";
    const removed = "config/tavernkeeper-scan-operators.json";
    await writeFile(join(source.root, changed), "staged canonical edit\n");
    execFileSync("git", ["add", "--", changed], {
      cwd: source.root,
      windowsHide: true,
    });
    await writeFile(join(source.root, changed), "current canonical edit\n");
    await rm(join(source.root, removed));
    await writeFile(
      join(source.root, "config/owned-new.txt"),
      "new canonical input\n",
    );
    const before = execFileSync("git", ["status", "--porcelain"], {
      cwd: source.root,
      encoding: "utf8",
      windowsHide: true,
    });
    fixture = await productionInventoryRoot(source.root);
    expect(await readFile(join(fixture.root, changed), "utf8")).toBe(
      "current canonical edit\n",
    );
    expect(
      await readFile(join(fixture.root, "config/owned-new.txt"), "utf8"),
    ).toBe("new canonical input\n");
    await expect(readFile(join(fixture.root, removed))).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(
      execFileSync("git", ["status", "--porcelain"], {
        cwd: source.root,
        encoding: "utf8",
        windowsHide: true,
      }),
    ).toBe(before);
  } finally {
    await fixture?.cleanup();
    await source.cleanup();
  }
}, 20_000);
test("production inventory uses the complete canonical build inputs, including installs and Kit support", async () => {
  const fixture = await productionInventoryRoot();
  try {
    const { revision } = fixture;
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
      root: fixture.root,
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
  } finally {
    await fixture.cleanup();
  }
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
  state.local.publications = [];
  state.local.retiredReceipts = [
    {
      schema_version: 1,
      operation: {
        ...operation,
        stage: "finalized",
        expectedSha: revision,
        workerRunId: null,
        retry: null,
        nextEligibleAt: null,
      },
      updatedAt: new Date(input.nowMs).toISOString(),
      completedAt: new Date(input.nowMs).toISOString(),
    },
  ];
  const replay = discoverAutomationState(state).filter(
    (current) => current.key === operation.key,
  );
  expect(replay).toHaveLength(1);
  expect(replay[0].stage).toBe("finalized");
});
