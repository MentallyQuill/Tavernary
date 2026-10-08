import { readFile, readdir } from "node:fs/promises";
import { expect, test, vi } from "vitest";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import {
  selectRefreshCompanionData,
  discoverCatalogOperations,
} from "../../scripts/automation/catalog-operations.mjs";
import {
  acquireRefreshData,
  prepareCatalogOperation,
} from "../../scripts/automation/catalog-preparation.mjs";
import { createPreparedPublicationContext } from "../../scripts/automation/publication-context.mjs";
import { buildRefreshManifest } from "../../scripts/catalog/github-refresh-manifest.mjs";

async function fixture() {
  const { state } = await metadataMaintenanceFixture();
  const kitFiles = (await readdir("data/registry/kits"))
    .filter((path) => path.endsWith(".json"))
    .sort();
  const kitRecords = await Promise.all(
    kitFiles.map(async (path) =>
      JSON.parse(await readFile(`data/registry/kits/${path}`, "utf8")),
    ),
  );
  const kit = kitRecords.find((record) => record.status === "published");
  const support = JSON.parse(
    await readFile(`data/snapshots/github/kits/${kit.id}.json`, "utf8"),
  );
  state.local.kits = [kit];
  state.local.kitSnapshots = [support];
  state.local.blockedUsers = { schema_version: 1, blocked: [] };
  state.local.installEvidence = [];
  state.local.refreshManifest = JSON.parse(
    await readFile("data/snapshots/github-refresh.json", "utf8"),
  );
  state.nowMs = Math.max(
    state.nowMs,
    Date.parse(
      (state.local.refreshManifest as { completed_at: string }).completed_at,
    ) + 86400000,
    Date.parse(support.refreshed_at) + 86400000,
  );
  state.operations = discoverCatalogOperations({
    catalog: {
      projects: state.local.projects as never,
      sources: state.local.sources as never,
      kits: state.local.kits as never,
      kitSnapshots: state.local.kitSnapshots as never,
      blockedUsers: state.local.blockedUsers,
      refreshManifest: state.local.refreshManifest as never,
    },
    evidence: state.local.snapshots as never,
    advisoryState: [],
    receipts: [],
    nowMs: state.nowMs,
  });
  const operation = state.operations.find(
    (value) => value.identity.subject === "source:catalog-maintenance",
  )!;
  const source = (state.local.sources as Array<{ id: string }>)[0];
  const now = new Date(state.nowMs).toISOString();
  const manifest = buildRefreshManifest({
    mode: "incremental",
    startedAt: now,
    completedAt: now,
    outcomes: [],
    snapshots: state.local.snapshots as never,
  });
  const refresh = vi.fn(async () => ({
    changedSnapshots: [],
    changedInstallEvidence: [],
    manifest,
  }));
  const fetchPage = vi.fn(async () => [
    {
      content: "+1",
      created_at: "2026-10-07T12:00:00Z",
      user: { id: 777, login: "supporter", type: "User" },
    },
  ]);
  return {
    state,
    operation,
    source,
    kit,
    support,
    manifest,
    refresh,
    fetchPage,
  };
}

test("daily companion refresh preserves the manifest and Kit support without direct canonical writes", async () => {
  const input = await fixture();
  const outputs = await acquireRefreshData(input);
  expect(JSON.parse(outputs["data/snapshots/github-refresh.json"])).toEqual(
    input.manifest,
  );
  const support = JSON.parse(
    outputs[`data/snapshots/github/kits/${input.kit.id}.json`],
  );
  expect(support.supporters).toContainEqual(
    expect.objectContaining({ github_user_id: 777, active: true }),
  );
  expect(input.fetchPage).toHaveBeenCalledTimes(1);
  expect(input.refresh).not.toHaveBeenCalled();
  const prepared = await prepareCatalogOperation({
    state: input.state,
    operation: input.operation,
    producer: {
      workflow: ".github/workflows/refresh-catalog.yml",
      runId: 700,
      sourceSha: String(input.state.local.revision),
    },
    acquire: async () => outputs,
  });
  expect(prepared?.files.map((file) => file.path)).toContain(
    "data/snapshots/github-refresh.json",
  );
});

test("other sources cannot claim the shared manifest or Kit paths", async () => {
  const input = await fixture();
  const source = (
    input.state.local.sources as Array<Record<string, unknown>>
  )[0];
  input.state.local.sources = [
    { ...source, id: "github-1", repository_id: 1 },
    source,
  ];
  const operation = input.state.operations.find(
    (value) => value.identity.subject === `source:${input.source.id}`,
  )!;
  const outputs = await acquireRefreshData({ ...input, operation });
  expect(outputs).toEqual({});
  expect(input.fetchPage).not.toHaveBeenCalled();
  const context = await createPreparedPublicationContext({
    state: input.state,
    operation,
  });
  expect(context.allowedPaths).not.toContain(
    "data/snapshots/github-refresh.json",
  );
  expect(
    context.validateContent(
      "data/snapshots/github-refresh.json",
      input.manifest,
    ),
  ).toBe(false);
});

test("daily Kit support and catalog clock progress do not depend on source-provider availability", async () => {
  const input = await fixture();
  input.refresh.mockRejectedValue(new Error("source provider unavailable"));
  const outputs = await acquireRefreshData(input);
  expect(outputs["data/snapshots/github-refresh.json"]).toBeDefined();
  expect(
    outputs[`data/snapshots/github/kits/${input.kit.id}.json`],
  ).toBeDefined();
  expect(input.refresh).not.toHaveBeenCalled();
});

test("refresh validates current Kit identity, withdrawal, blocked supporters and manifest bounds", async () => {
  const input = await fixture();
  const outputs = await acquireRefreshData(input);
  const context = await createPreparedPublicationContext({
    state: input.state,
    operation: input.operation,
  });
  const path = `data/snapshots/github/kits/${input.kit.id}.json`;
  const support = JSON.parse(outputs[path]);
  expect(context.validateContent(path, support)).toBe(true);
  expect(
    context.validateContent(path, {
      ...support,
      source_issue_number: input.kit.source_issue_number + 1,
    }),
  ).toBe(false);
  expect(
    context.validateContent("data/snapshots/github-refresh.json", {
      ...input.manifest,
      counts: { ...input.manifest.counts, checked: 500 },
    }),
  ).toBe(false);
  input.state.local.blockedUsers = {
    schema_version: 1,
    blocked: [{ github_user_id: 777 }],
  };
  input.kit.status = "withdrawn";
  const changed = await createPreparedPublicationContext({
    state: input.state,
    operation: input.operation,
  });
  expect(changed.validateContent(path, support)).toBe(false);
  expect(
    changed.validateContent(path, {
      ...support,
      supporters: support.supporters.map((user: object) => ({
        ...user,
        active: false,
      })),
    }),
  ).toBe(true);
});

test("a support provider outage preserves trusted history and marks it stale", async () => {
  const input = await fixture();
  input.support.supporters = [
    {
      github_user_id: 777,
      login: "supporter",
      first_reacted_at: "2026-10-07T12:00:00Z",
      active: true,
    },
  ];
  input.fetchPage.mockRejectedValue(new Error("provider unavailable"));
  const outputs = await acquireRefreshData(input);
  const support = JSON.parse(
    outputs[`data/snapshots/github/kits/${input.kit.id}.json`],
  );
  expect(support.supporters).toEqual(input.support.supporters);
  expect(support.refreshed_at).toBe(input.support.refreshed_at);
  expect(support.stale_since).toBe(new Date(input.state.nowMs).toISOString());
});

test("companion refresh is bounded and orders the oldest support observations first", async () => {
  const input = await fixture();
  const kits = Array.from({ length: 150 }, (_, index) => ({
    ...input.kit,
    id: `kit-${index}`,
  }));
  const kitSnapshots = kits.map((kit, index) => ({
    ...input.support,
    kit_id: kit.id,
    refreshed_at: new Date(index * 1000).toISOString(),
  }));
  const selected = selectRefreshCompanionData({
    ...input.state.local,
    kits: kits.reverse(),
    kitSnapshots,
  });
  expect(selected.kits).toHaveLength(100);
  expect(selected.kits[0].id).toBe("kit-0");
  expect(selected.kits.at(-1)?.id).toBe("kit-99");
});
