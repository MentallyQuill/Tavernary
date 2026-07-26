import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { expect, test, vi } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  createEnrichmentRunState,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import { cliOptions, runCli } from "../../scripts/catalog/enrich-readmes.mjs";

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
      "Fixture organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator-facing controls, and keeps complex configuration work clear and accessible throughout.",
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
    enrichment_policy: "automatic",
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

function awaitingCanary(canaryModel = model) {
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
  return canary;
}

function deployedCanary(canaryModel = model) {
  const canary = awaitingCanary(canaryModel);
  return approveCanaryDeployment(canary, {
    commitSha: "b".repeat(40),
    deploymentRunId: 12345,
    now,
  });
}

function legacyMixedOutcomeFullReport() {
  const manifest = ["legacy-a", "legacy-b", "legacy-c", "legacy-d", "legacy-e"];
  return {
    schema_version: 1,
    run_id: "legacy-full",
    mode: "full",
    status: "complete",
    phase: "complete",
    expected_model: model,
    batch_size: 20,
    concurrency: 4,
    created_at: now,
    updated_at: now,
    manifest,
    primary_cursor: manifest.length,
    retry_queue: [],
    retry_cursor: 0,
    attempts: Object.fromEntries(manifest.map((id) => [id, 1])),
    entries: Object.fromEntries(
      manifest.map((id, index) => [
        id,
        {
          id,
          attempt: 1,
          phase: "primary",
          outcome: index === 0 ? "enriched" : "source-not-ready",
          completed_at: now,
        },
      ]),
    ),
    deployment: null,
  };
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

test("a retry tells the provider which validation defect to correct", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  let previousReport = createEnrichmentRunState({
    mode: "canary",
    manifest: ids,
    runId: "canary-repair",
    now,
    model,
  });
  previousReport = applyAttemptResults(
    previousReport,
    ids.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: id === "e" ? ("failed" as const) : ("enriched" as const),
      ...(id === "e"
        ? {
            reasonCode: "output-invalid",
            message: "Summary must contain 24-36 words.",
            repairHint: "Summary must contain 24-36 words.",
          }
        : {}),
    })),
    now,
  );
  const options = executionOptions(ids);
  const generate = vi.fn(async (_input: unknown) => providerOutput);

  await runCli({
    ...options,
    provider: { generate },
    mode: "canary",
    projectIds: ids,
    previousReport,
  });

  expect(generate).toHaveBeenCalledOnce();
  expect(generate.mock.calls[0][0]).toMatchObject({
    id: "e",
    repair: {
      reasonCode: "output-invalid",
      message: "Summary must contain 24-36 words.",
    },
  });
});

test("a structured-content retry uses its sanitized transport diagnostic", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  let previousReport = createEnrichmentRunState({
    mode: "canary",
    manifest: ids,
    runId: "canary-json-repair",
    now,
    model,
  });
  previousReport = applyAttemptResults(
    previousReport,
    ids.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: id === "e" ? ("failed" as const) : ("enriched" as const),
      ...(id === "e"
        ? {
            reasonCode: "provider-response-invalid",
            diagnosticCode: "json-invalid",
          }
        : {}),
    })),
    now,
  );
  const options = executionOptions(ids);
  const generate = vi.fn(async (_input: unknown) => providerOutput);

  await runCli({
    ...options,
    provider: { generate },
    mode: "canary",
    projectIds: ids,
    previousReport,
  });

  expect(generate.mock.calls[0][0]).toMatchObject({
    repair: {
      reasonCode: "provider-response-invalid",
      message: "Return one valid JSON object without surrounding prose.",
    },
  });
});

test("a canary primary phase resumes from its committed cursor", async () => {
  const ids = ["a", "b", "c", "d", "e"];
  let previousReport = createEnrichmentRunState({
    mode: "canary",
    manifest: ids,
    runId: "canary-primary",
    now,
    model,
    batchSize: 2,
  });
  previousReport = applyAttemptResults(
    previousReport,
    ids.slice(0, 2).map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  const options = executionOptions(ids);
  const report = await runCli({
    ...options,
    mode: "canary",
    projectIds: ids,
    previousReport,
  });

  expect(options.writeRecord).toHaveBeenCalledTimes(2);
  expect(report).toMatchObject({
    run_id: "canary-primary",
    status: "running",
    phase: "primary",
    primary_cursor: 4,
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

test("canary approval writes its durable ledger without replacing the full report", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-canary-ledger-"));
  const canaryReportPath = join(directory, "enrichment-canary.json");
  const reportPath = join(directory, "enrichment-report.json");
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

  await runCli({
    mode: "approve-canary",
    previousReport: awaiting,
    canaryReportPath,
    reportPath,
    commitSha: "c".repeat(40),
    deploymentRunId: 67890,
    now,
  });

  const canary = JSON.parse(await readFile(canaryReportPath, "utf8"));
  const full = await readFile(reportPath, "utf8").catch(() => null);
  expect(canary).toMatchObject({ mode: "canary", status: "passed" });
  expect(full).toBeNull();
});

test("start authorizes from the durable canary ledger and writes separate full progress", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-full-ledger-"));
  const canaryReportPath = join(directory, "enrichment-canary.json");
  const reportPath = join(directory, "enrichment-report.json");
  const ids = ["project-a"];

  await runCli({
    mode: "approve-canary",
    previousReport: awaitingCanary(),
    canaryReportPath,
    reportPath,
    commitSha: "c".repeat(40),
    deploymentRunId: 67890,
    now,
  });
  const report = await runCli({
    ...executionOptions(ids),
    mode: "start",
    previousReport: undefined,
    canaryReportPath,
    reportPath,
  });

  const canary = JSON.parse(await readFile(canaryReportPath, "utf8"));
  const full = JSON.parse(await readFile(reportPath, "utf8"));
  expect(canary).toMatchObject({ mode: "canary", status: "passed" });
  expect(report).toMatchObject({ mode: "full", status: "complete" });
  expect(full.run_id).toBe(report.run_id);
});

test("authorize-full validates durable canary proof without touching catalog data", async () => {
  const loadSource = vi.fn();
  const writeRecord = vi.fn();
  const result = await runCli({
    mode: "authorize-full",
    previousReport: deployedCanary(),
    providerConfiguration,
    loadSource,
    writeRecord,
    reportPath: null,
    canaryReportPath: null,
  });

  expect(result).toEqual({
    mode: "authorize-full",
    status: "passed",
    canary_run_id: "canary",
    requested_model: model,
  });
  expect(loadSource).not.toHaveBeenCalled();
  expect(writeRecord).not.toHaveBeenCalled();
});

test("records an exact checkpoint publication without provider configuration", async () => {
  const reports: unknown[] = [];
  const report = await runCli({
    mode: "record-full-publication",
    previousReport: createEnrichmentRunState({
      mode: "full",
      manifest: ["a"],
      runId: "full",
      now,
      model,
    }),
    reportPath: null,
    commitSha: "d".repeat(40),
    now,
    writeReport: async (value) => {
      reports.push(value);
    },
  });

  expect(report.publication).toEqual({
    checkpoint_commit_sha: "d".repeat(40),
    recorded_at: now,
  });
  expect(reports).toEqual([report]);
});

test("records a verified full deployment without provider configuration", async () => {
  let full = createEnrichmentRunState({
    mode: "full",
    manifest: ["a"],
    runId: "full",
    now,
    model,
  });
  full = applyAttemptResults(
    full,
    [{ id: "a", phase: "primary", outcome: "enriched" }],
    now,
  );
  full.publication = {
    checkpoint_commit_sha: "d".repeat(40),
    recorded_at: now,
  };

  const report = await runCli({
    mode: "record-full-deployment",
    previousReport: full,
    reportPath: null,
    commitSha: "d".repeat(40),
    deploymentRunId: 98765,
    now,
  });

  expect(report.deployment).toEqual({
    commit_sha: "d".repeat(40),
    run_id: 98765,
    verified_at: now,
  });
});

test("CLI report flags keep canary authorization and full progress separate", () => {
  expect(
    cliOptions([
      "--mode",
      "authorize-full",
      "--report-path",
      "full.json",
      "--canary-report-path",
      "canary.json",
    ]),
  ).toMatchObject({
    mode: "authorize-full",
    reportPath: "full.json",
    canaryReportPath: "canary.json",
  });
});

test("writes enrichment reports in repository Prettier format", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-report-"));
  const reportPath = join(directory, "enrichment-report.json");
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

  await runCli({
    mode: "approve-canary",
    previousReport: awaiting,
    reportPath,
    commitSha: "c".repeat(40),
    deploymentRunId: 67890,
    now,
  });

  const serialized = await readFile(reportPath, "utf8");
  expect(serialized).toContain('"manifest": ["a", "b", "c", "d", "e"]');
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

test("start replaces a valid legacy ledger before the first full provider call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tavernary-legacy-full-"));
  const reportPath = join(directory, "enrichment-report.json");
  await writeFile(
    reportPath,
    `${JSON.stringify(legacyMixedOutcomeFullReport(), null, 2)}\n`,
    "utf8",
  );
  const generate = vi.fn(async () => {
    const checkpoint = JSON.parse(await readFile(reportPath, "utf8"));
    expect(checkpoint).toMatchObject({
      mode: "full",
      status: "running",
      run_id: "run-1",
      primary_cursor: 0,
    });
    return providerOutput;
  });

  await expect(
    runCli({
      ...executionOptions(["fresh-project"]),
      mode: "start",
      previousReport: deployedCanary(),
      reportPath,
      provider: { generate },
    }),
  ).resolves.toMatchObject({
    mode: "full",
    status: "complete",
    run_id: "run-1",
  });
  expect(generate).toHaveBeenCalledOnce();
});

test("defers unsuccessful canary members until the next dispatch", async () => {
  let canary = createEnrichmentRunState({
    mode: "canary",
    manifest: ["a", "b", "c", "d", "e", "f", "g"],
    runId: "canary-seven",
    now,
    model,
  });
  canary = applyAttemptResults(
    canary,
    [
      ...["a", "b", "c", "d", "e"].map((id) => ({
        id,
        phase: "primary" as const,
        outcome: "enriched" as const,
      })),
      {
        id: "f",
        phase: "primary" as const,
        outcome: "source-not-ready" as const,
      },
      {
        id: "g",
        phase: "primary" as const,
        outcome: "source-not-ready" as const,
      },
    ],
    now,
  );
  const deployed = approveCanaryDeployment(canary, {
    commitSha: "b".repeat(40),
    deploymentRunId: 12345,
    now,
  });
  const firstRecords = ["f", "g", "h"].map(record);
  const first = await runCli({
    ...executionOptions(["f", "g", "h"]),
    records: firstRecords,
    mode: "start",
    previousReport: deployed,
  });

  expect(first).toMatchObject({
    status: "complete-with-errors",
    manifest: ["h"],
    deferred_ids: ["f", "g"],
    authorized_canary_run_id: "canary-seven",
    attempts: { h: 1 },
  });

  const second = await runCli({
    ...executionOptions(["f", "g"]),
    mode: "start",
    previousReport: deployed,
    previousFullReport: first,
  });
  expect(second).toMatchObject({
    status: "complete",
    manifest: ["f", "g"],
    deferred_ids: [],
    authorized_canary_run_id: "canary-seven",
    attempts: { f: 1, g: 1 },
  });

  const third = await runCli({
    ...executionOptions(["f", "g"]),
    mode: "start",
    previousReport: deployed,
    previousFullReport: second,
  });
  expect(third).toMatchObject({
    status: "complete",
    manifest: ["f", "g"],
    deferred_ids: [],
    authorized_canary_run_id: "canary-seven",
  });
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
