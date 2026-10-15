import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { buildPreparedCatalogPublication } from "../../scripts/automation/publication-build.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import project from "../../data/registry/projects/mentallyquill-recursion.json";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import { createEnrichmentRunState } from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import { commitCanonicalData } from "../../scripts/automation/canonical-data.mjs";
import { maximumModelBudgetFixture } from "../helpers/model-budget-fixtures";
function fixture() {
  const source = JSON.parse(
    readFileSync(`data/registry/sources/${project.source_id}.json`, "utf8"),
  );
  const snapshot = JSON.parse(
    readFileSync(`data/snapshots/github/${project.source_id}.json`, "utf8"),
  );
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 41_982_982,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    local: {
      projects: [project],
      sources: [source],
      snapshots: [snapshot],
      kits: [],
      kitSnapshots: [],
      installEvidence: [],
      advisoryState: [],
      blockedUsers: { schema_version: 1, blocked: [] },
      storedReports: {
        schema_version: 5,
        generated_at: "2026-10-08T12:00:00Z",
        preferred_report_ids: [],
        reports: [],
      },
    },
    receipts: [],
    operations: [],
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
  };
  const value = {
    ...project,
    summary: "Factual automatic copy verified against source evidence.",
  };
  const content = `${JSON.stringify(value, null, 2)}\n`;
  const file = {
    path: `data/registry/projects/${project.id}.json`,
    type: "file" as const,
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content),
    baseDigest: null,
  };
  return { state, file };
}
test("an actual catalog publication commits retained model settlement alongside both public catalogs", async () => {
  const { state, file } = fixture();
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const records = (path: string) =>
    readdirSync(path)
      .filter((name) => name.endsWith(".json"))
      .map((name) => read(`${path}/${name}`));
  const start = Date.parse("2026-07-18T12:00:00.000Z");
  const budget = maximumModelBudgetFixture();
  budget.tickets = budget.tickets.slice(0, 9000);
  for (const [index, ticket] of budget.tickets.entries()) {
    const created = start + Math.floor(index / 100) * 86400000;
    ticket.createdAt = new Date(created).toISOString();
    ticket.expiresAt = new Date(created + 45 * 60000).toISOString();
    ticket.day = ticket.createdAt.slice(0, 10);
    ticket.id = createHash("sha256")
      .update(
        JSON.stringify([ticket.day, ticket.operationKey, ticket.requestId]),
      )
      .digest("hex");
  }
  const ticket = budget.tickets[budget.tickets.length - 1];
  budget.updatedAt = ticket.createdAt;
  budget.days = Array.from({ length: 90 }, (_, index) => ({
    day: new Date(start + index * 86400000).toISOString().slice(0, 10),
    requests: 100,
    tokens: 10000000,
  }));
  budget.months = [
    ...new Set(budget.days.map((row) => row.day.slice(0, 7))),
  ].map((month) => ({
    month,
    reservedMicrousd: Number.MAX_SAFE_INTEGER,
    unpricedTokens: 310000000,
  }));
  ticket.producer = {
    runId: 700,
    workflow: ".github/workflows/enrich-catalog.yml",
  };
  ticket.settled = false;
  ticket.usage = null;
  Object.assign(state.local, {
    projects: records("data/registry/projects"),
    sources: records("data/registry/sources"),
    snapshots: [
      ...records("data/snapshots/github"),
      ...records("data/snapshots/codeberg"),
    ],
    kits: records("data/registry/kits"),
    kitSnapshots: records("data/snapshots/github/kits"),
    installEvidence: records("data/snapshots/install"),
    advisoryState: records("data/snapshots/policy-review"),
    blockedUsers: read("data/moderation/blocked-github-users.json"),
    storedReports: read("data/security/tavernkeeper-report-summaries.json"),
    refreshManifest: read("data/snapshots/github-refresh.json"),
    modelBudget: budget,
  });
  state.nowMs = Date.parse(budget.updatedAt);
  const files = await buildPreparedCatalogPublication({
    state,
    action: {
      action: "commit",
      operationKeys: [ticket.operationKey],
      expectedMainSha: "b".repeat(40),
      files: [file],
      modelSettlements: [
        {
          operationKey: ticket.operationKey,
          producer: { ...ticket.producer, sourceSha: "b".repeat(40) },
          modelUsage: [
            {
              ticketId: ticket.id,
              usage: { requests: 1, tokens: 100000 },
            },
          ],
        },
      ],
    },
  });
  expect(files.map((value) => value.path)).toEqual([
    file.path,
    "data/maintenance/automation/model-budgets/global.json",
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ]);
  expect(
    files.reduce((total, value) => total + value.bytes, 0),
  ).toBeGreaterThan(33_554_432);
  expect(
    files
      .filter((value) => value.path !== files[1].path)
      .reduce((total, value) => total + value.bytes, 0),
  ).toBeLessThanOrEqual(33_554_432);
  const settled = JSON.parse(files[1].content);
  expect(settled.tickets[settled.tickets.length - 1].settled).toBe(true);
  expect(settled.days).toEqual(budget.days);
  expect(ticket.settled).toBe(false);
  const gh = vi.fn(async (args: string[]) => {
    if (args[1]?.endsWith(`/git/commits/${"b".repeat(40)}`))
      return JSON.stringify({
        sha: "b".repeat(40),
        tree: { sha: "a".repeat(40) },
      });
    if (args.includes("POST")) {
      const sha = args.some((value) => value.endsWith("/blobs"))
        ? "c"
        : args.some((value) => value.endsWith("/trees"))
          ? "d"
          : "e";
      return JSON.stringify({ sha: sha.repeat(40) });
    }
    if (args.includes("PATCH"))
      return JSON.stringify({
        ref: "refs/heads/main",
        object: { sha: "e".repeat(40) },
      });
    throw new Error("Unexpected remote transport");
  });
  expect(
    await commitCanonicalData({
      gh,
      repository: "Owner/Repo",
      expectedMainSha: "b".repeat(40),
      files,
      message: "chore(catalog): settle and publish prepared catalog",
    }),
  ).toEqual({ sha: "e".repeat(40) });
}, 30000);

test("a private rollout checkpoint rebuilds public contracts at its own clock for revision-bound confirmation", async () => {
  const { state } = fixture();
  state.nowMs = Date.parse("2026-10-08T18:00:00.000Z");
  state.local.refreshManifest = JSON.parse(
    readFileSync("data/snapshots/github-refresh.json", "utf8"),
  );
  const report = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "full",
      runId: "native-full",
      manifest: [project.id],
      model: "fixture-model",
      now: new Date(state.nowMs).toISOString(),
    }),
  );
  const content = `${JSON.stringify(report)}\n`;
  const files = await buildPreparedCatalogPublication({
    state,
    action: {
      action: "commit",
      operationKeys: ["a".repeat(64)],
      expectedMainSha: "b".repeat(40),
      files: [
        {
          path: "data/reports/enrichment-report.json",
          type: "file",
          content,
          bytes: Buffer.byteLength(content),
          sha256: createHash("sha256").update(content).digest("hex"),
          baseDigest: null,
        },
      ],
    },
  });
  for (const path of [
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ]) {
    const file = files.find((value) => value.path === path)!;
    expect(JSON.parse(file.content).generatedAt).toBe(
      new Date(state.nowMs).toISOString(),
    );
  }
});
test("the writer rebuilds both public contracts from validated canonical data without modifying its checkout", async () => {
  const { state, file } = fixture();
  const original = structuredClone(state.local);
  const files = await buildPreparedCatalogPublication({
    action: {
      action: "commit",
      operationKeys: ["a".repeat(64)],
      expectedMainSha: "b".repeat(40),
      files: [file],
    },
    state,
  });
  expect(files.map((file) => file.path)).toEqual([
    file.path,
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ]);
  const legacy = JSON.parse(files[1].content);
  const current = JSON.parse(files[2].content);
  expect(legacy.schemaVersion).toBe(7);
  expect(current.schemaVersion).toBe(8);
  expect(current.projects[0].summary).toBe(JSON.parse(file.content).summary);
  expect(state.local).toEqual(original);
});
test("aggregate cross-reference validation blocks a file that names a nonexistent source", async () => {
  const { state, file } = fixture();
  file.content = JSON.stringify({ ...project, source_id: "github-99999999" });
  file.bytes = Buffer.byteLength(file.content);
  file.sha256 = createHash("sha256").update(file.content).digest("hex");
  await expect(
    buildPreparedCatalogPublication({
      action: {
        action: "commit",
        operationKeys: ["a".repeat(64)],
        expectedMainSha: "b".repeat(40),
        files: [file],
      },
      state,
    }),
  ).rejects.toThrow();
});
test("publication uses the same committed observation clock as the later production build after a seventy-two-hour delay", async () => {
  const { state, file } = fixture();
  const manifest = JSON.parse(
    readFileSync("data/snapshots/github-refresh.json", "utf8"),
  );
  state.local.refreshManifest = manifest;
  state.nowMs = Date.parse(manifest.completed_at) + 72 * 3600000;
  const files = await buildPreparedCatalogPublication({
    action: {
      action: "commit",
      operationKeys: ["a".repeat(64)],
      expectedMainSha: "b".repeat(40),
      files: [file],
    },
    state,
  });
  for (const path of [
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ])
    expect(
      JSON.parse(files.find((value) => value.path === path)!.content)
        .generatedAt,
    ).toBe(manifest.completed_at);
});

test("an actual refresh manifest advances both public catalog clocks", async () => {
  const { state, file } = fixture();
  const manifest = JSON.parse(
    readFileSync("data/snapshots/github-refresh.json", "utf8"),
  );
  manifest.completed_at = "2026-10-08T12:00:00.000Z";
  const content = `${JSON.stringify(manifest, null, 2)}\n`;
  const files = await buildPreparedCatalogPublication({
    state,
    action: {
      action: "commit",
      operationKeys: ["a".repeat(64)],
      expectedMainSha: "b".repeat(40),
      files: [
        {
          ...file,
          path: "data/snapshots/github-refresh.json",
          content,
          sha256: createHash("sha256").update(content).digest("hex"),
          bytes: Buffer.byteLength(content),
        },
      ],
    },
  });
  for (const path of [
    "public/catalog/tavernary-catalog.json",
    "public/catalog/tavernary-catalog-v8.json",
  ])
    expect(
      JSON.parse(files.find((value) => value.path === path)!.content)
        .generatedAt,
    ).toBe(manifest.completed_at);
});

test("an unchanged-source cache publication never manufactures new public assets", async () => {
  const input = await metadataMaintenanceFixture({ unchanged: true });
  const data = await input.run();
  const files = Object.entries(data).map(([path, content]) => ({
    path,
    content,
    type: "file" as const,
    bytes: Buffer.byteLength(content),
    sha256: createHash("sha256").update(content).digest("hex"),
    baseDigest: null,
  }));
  const { state } = fixture();
  const published = await buildPreparedCatalogPublication({
    state,
    action: {
      action: "commit",
      operationKeys: [input.operation.key],
      expectedMainSha: "b".repeat(40),
      files,
    },
  });
  expect(published.map((file) => file.path)).toEqual(
    files.map((file) => file.path),
  );
  expect(published[0]).toEqual(files[0]);
  expect(input.modelCalls()).toBe(0);
});
