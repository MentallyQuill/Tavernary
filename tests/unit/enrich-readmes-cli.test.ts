import { expect, test, vi } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  createEnrichmentRunState,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import { runCli } from "../../scripts/catalog/enrich-readmes.mjs";

const now = "2026-07-24T00:00:00.000Z";
const model = "minimax/minimax-m3:thinking";
const providerConfiguration = {
  apiUrl: "https://api.example.test/v1/chat/completions",
  apiKey: "test-key",
  model,
};
const vocabularies = {
  primaryFunctions: [
    { id: "developer-infrastructure", label: "Developer infrastructure" },
    { id: "uncategorized", label: "Uncategorized" },
  ],
  capabilities: [{ id: "automation", label: "Automation" }],
};
const providerOutput = {
  output: {
    summary:
      "A focused extension for automating repeatable project workflows across SillyTavern projects and creators.",
    metadata_status: "curated" as const,
    primary_function: "developer-infrastructure",
    capabilities: ["automation"],
  },
  metadata: {
    requestedModel: model,
    returnedModel: model,
    latencyMs: 10,
  },
};

function record(id: string) {
  return {
    id,
    name: id,
    kind: "extension",
    summary: "Generic intake details.",
    metadata_status: "provisional",
    visibility: "published",
    frontends: [],
    source: {
      type: "github",
      repository: `Creator/${id}`,
      repository_id: 42,
    },
  };
}

function snapshot(id: string) {
  return {
    schema_version: 2,
    project_id: id,
    source_health: "healthy",
    stale_since: null,
    repository: {
      id: 42,
      owner: "Creator",
      name: id,
      head_sha: "a".repeat(40),
      description: `Description for ${id}.`,
    },
  };
}

function sources(id: string) {
  return {
    status: "ready" as const,
    sourceKind: "description" as const,
    text: `Description for ${id}.`,
    repositoryDescription: `Description for ${id}.`,
    readmeText: null,
    readmePath: null,
    readmeRef: null,
    repositoryId: 42,
    headSha: "a".repeat(40),
  };
}

function executionOptions(ids: string[]) {
  return {
    records: ids.map(record),
    snapshots: Object.fromEntries(ids.map((id) => [id, snapshot(id)])),
    vocabularies,
    validateSnapshot: () => true,
    providerConfiguration,
    provider: { generate: vi.fn(async (_input: unknown) => providerOutput) },
    loadSource: async (candidate: { id: string }) => sources(candidate.id),
    writeRecord: vi.fn(async () => {}),
    reportPath: null,
    now,
    runId: "run-1",
  };
}

function deployedCanary(canaryModel = model) {
  let canary = createEnrichmentRunState({
    mode: "canary",
    manifest: ["a", "b", "c", "d", "e"],
    runId: "canary",
    now,
    model: canaryModel,
  });
  canary = applyAttemptResults(
    canary,
    ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  return approveCanaryDeployment(canary, {
    commitSha: "b".repeat(40),
    deploymentRunId: 12345,
    now,
  });
}

test.each([
  [{ apiUrl: "", apiKey: "key", model }, "URL"],
  [
    { apiUrl: "https://api.example.test", apiKey: "key", model: ` ${model}` },
    "whitespace",
  ],
] as const)(
  "preflight fails closed on provider configuration",
  async (configuration, message) => {
    await expect(
      runCli({
        mode: "preflight",
        providerConfiguration: configuration,
        provider: { generate: vi.fn() },
        reportPath: null,
      }),
    ).rejects.toThrow(message);
  },
);

test("preflight performs one synthetic call without loading or writing catalog data", async () => {
  const generate = vi.fn(async (_input: unknown) => providerOutput);
  const loadSource = vi.fn();
  const writeRecord = vi.fn();
  const result = await runCli({
    mode: "preflight",
    providerConfiguration,
    provider: { generate },
    loadSource,
    writeRecord,
    reportPath: null,
    now,
  });

  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0]).toMatchObject({
    id: "provider-preflight",
    repositoryDescription:
      "A synthetic source used only to verify structured catalog enrichment.",
  });
  expect(loadSource).not.toHaveBeenCalled();
  expect(writeRecord).not.toHaveBeenCalled();
  expect(result).toEqual({
    mode: "preflight",
    status: "passed",
    requested_model: model,
    returned_model: model,
    latency_ms: 10,
    validation_status: "passed",
  });
});

test("canary requires exactly five unique explicit IDs", async () => {
  await expect(
    runCli({
      mode: "canary",
      projectIds: ["a", "b", "c", "d"],
      ...executionOptions(["a", "b", "c", "d"]),
    }),
  ).rejects.toThrow("five unique");
});

test("an explicit canary replaces the obsolete pre-alpha report format", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  await expect(
    runCli({
      ...executionOptions(ids),
      mode: "canary",
      projectIds: ids,
      previousReport: {
        generated_at: now,
        enriched: [],
        fallback: [],
        skipped: [],
        failed: [],
      },
    }),
  ).resolves.toMatchObject({
    mode: "canary",
    status: "awaiting-deployment",
  });
});

test("a canary retry resumes only its failed IDs", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  let previousReport = createEnrichmentRunState({
    mode: "canary",
    manifest: ids,
    runId: "canary-1",
    now,
    model,
  });
  previousReport = applyAttemptResults(
    previousReport,
    ids.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: id === "e" ? ("failed" as const) : ("enriched" as const),
    })),
    now,
  );
  const options = executionOptions(ids);
  const report = await runCli({
    ...options,
    mode: "canary",
    projectIds: ids,
    previousReport,
    loadSource: async () => ({
      status: "fallback" as const,
      sourceKind: "confirmed-fallback" as const,
      readmePath: null,
      readmeRef: "a".repeat(40),
      repositoryId: 42,
      headSha: "a".repeat(40),
    }),
  });

  expect(options.writeRecord).toHaveBeenCalledOnce();
  expect(report).toMatchObject({
    status: "awaiting-deployment",
    phase: "complete",
    retry_cursor: 1,
  });
});

test("canary approval records verified deployment without provider access", async () => {
  const awaiting = applyAttemptResults(
    createEnrichmentRunState({
      mode: "canary",
      manifest: ["a", "b", "c", "d", "e"],
      runId: "canary",
      now,
      model,
    }),
    ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  const report = await runCli({
    mode: "approve-canary",
    previousReport: awaiting,
    reportPath: null,
    commitSha: "c".repeat(40),
    deploymentRunId: 67890,
    now,
  });

  expect(report).toMatchObject({
    status: "passed",
    deployment: {
      commit_sha: "c".repeat(40),
      run_id: 67890,
      verified_at: now,
    },
  });
});

test("start requires a deployed canary and freezes the complete eligible manifest", async () => {
  const ids = Array.from({ length: 25 }, (_, index) => `project-${index}`);
  await expect(
    runCli({ ...executionOptions(ids), mode: "start", previousReport: null }),
  ).rejects.toThrow("deployed canary");
  await expect(
    runCli({
      ...executionOptions(ids),
      mode: "start",
      previousReport: deployedCanary("other/model"),
    }),
  ).rejects.toThrow("configured model");

  const report = await runCli({
    ...executionOptions(ids),
    mode: "start",
    previousReport: deployedCanary(),
  });

  expect(report.manifest).toEqual([...ids].sort());
  expect(report.primary_cursor).toBe(20);
  expect(report.status).toBe("running");
});

test("resume uses the next state batch and rejects terminal or canary state", async () => {
  const ids = Array.from({ length: 25 }, (_, index) => `project-${index}`);
  let full = createEnrichmentRunState({
    mode: "full",
    manifest: ids,
    runId: "full",
    now,
    model,
  });
  full = applyAttemptResults(
    full,
    full.manifest.slice(0, 20).map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  const options = executionOptions(ids);
  const report = await runCli({
    ...options,
    mode: "resume",
    previousReport: full,
  });
  expect(options.writeRecord).toHaveBeenCalledTimes(5);
  expect(report).toMatchObject({
    status: "complete",
    phase: "complete",
    primary_cursor: 25,
  });

  await expect(
    runCli({
      ...options,
      mode: "resume",
      previousReport: report,
    }),
  ).rejects.toThrow("running full");
});

test("canary retry and full resume reject a changed configured model", async () => {
  const canaryIds = ["a", "b", "c", "d", "e"];
  let canary = createEnrichmentRunState({
    mode: "canary",
    manifest: canaryIds,
    runId: "canary",
    now,
    model: "other/model",
  });
  canary = applyAttemptResults(
    canary,
    canaryIds.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: id === "e" ? ("failed" as const) : ("enriched" as const),
    })),
    now,
  );
  await expect(
    runCli({
      ...executionOptions(canaryIds),
      mode: "canary",
      projectIds: canaryIds,
      previousReport: canary,
    }),
  ).rejects.toThrow("configured model");

  const full = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "full",
    now,
    model: "other/model",
  });
  await expect(
    runCli({
      ...executionOptions(["a"]),
      mode: "resume",
      previousReport: full,
    }),
  ).rejects.toThrow("configured model");
});

test("record failures advance durable state without rejecting the CLI", async () => {
  const ids = ["broken"];
  const report = await runCli({
    ...executionOptions(ids),
    mode: "start",
    previousReport: deployedCanary(),
    provider: {
      generate: vi.fn().mockRejectedValue(
        Object.assign(
          new Error("The enrichment provider returned a server error."),
          {
            code: "provider-server-error",
          },
        ),
      ),
    },
  });

  expect(report).toMatchObject({
    status: "running",
    phase: "retry",
    primary_cursor: 1,
    retry_queue: ["broken"],
  });
});

test("rejects the removed mutable backfill mode", async () => {
  await expect(runCli({ mode: "backfill" } as never)).rejects.toThrow(
    "unsupported enrichment mode",
  );
});
