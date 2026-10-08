import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { expect, test, vi } from "vitest";
import { catalogInventoryFixture } from "../helpers/automation-fixtures";
import {
  createEnrichmentRunState,
  applyAttemptResults,
  approveCanaryDeployment,
  recordCheckpointPublication,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import { createEnrichmentReport } from "../../scripts/catalog/enrichment-report.mjs";
import {
  discoverEnrichmentOperations,
  acquirePreparedEnrichmentData,
  createPreparedEnrichmentContext,
  hasConfirmedEnrichmentCanary,
} from "../../scripts/automation/enrichment-preparation.mjs";
import { prepareCatalogOperation } from "../../scripts/automation/catalog-preparation.mjs";
import { validatePreparedResult } from "../../scripts/automation/prepared-result.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { planAutomationWorker } from "../../scripts/automation/worker.mjs";
import { selectPreparedWakes } from "../../scripts/automation/prepared-wake.mjs";
import { formatJson } from "../../scripts/catalog/json-format.mjs";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";

const now = "2026-10-08T18:00:00.000Z";
const model = "fixture-model";
const providerConfiguration = {
  apiUrl: "https://api.example.test/v1/chat/completions",
  apiKey: "test-key",
  model,
};
const summary =
  "Example organizes repeatable prompt workflows for SillyTavern projects. It automates routine setup, preserves creator controls, and keeps complex configuration work clear and accessible.";
function fixture() {
  const base = catalogInventoryFixture();
  const ids = ["a", "b", "c", "d", "e"];
  const projects = ids.map((id) => ({
    ...base.catalog.projects[0],
    id,
    name: "Example",
    source_id: `github-${id}`,
    summary: "Provisional project description.",
    tags: [],
    metadata_status: "provisional",
    metadata_policy: {
      summary: { mode: "automatic" },
      tags: { mode: "manual", note: "Owner chooses tags." },
    },
  }));
  const sources = ids.map((id) => ({
    ...base.catalog.sources[0],
    id: `github-${id}`,
    repository: `Owner/${id}`,
  }));
  const snapshots = ids.map((id) => ({
    ...base.evidence[0],
    source_id: `github-${id}`,
    stale_since: null,
    repository: {
      id: 42,
      head_sha: "a".repeat(40),
      owner: "Owner",
      name: id,
      description: summary,
    },
  }));
  const report = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "canary",
      runId: "owner-canary",
      manifest: ids,
      batchSize: 30,
      concurrency: 6,
      model,
      now,
      selectionMode: "all-automatic",
    }),
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const state = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 900,
    nowMs: Date.parse(now),
    remote: { mainHeadSha: sha, runs: [] },
    receipts: [],
    local: {
      revision: sha,
      projects,
      sources,
      snapshots,
      enrichmentCanary: report,
      enrichmentFull: null,
      vocabularyHash: "c".repeat(64),
      publications: [],
      confirmedRevisions: [],
    },
    operations: [],
  } as unknown as AutomationInventoryState;
  state.operations = discoverEnrichmentOperations(state);
  const observation = {
    source: {
      status: "ready" as const,
      sourceKind: "description" as const,
      sourceIdentity: "github:owner/a",
      text: summary,
      repositoryDescription: summary,
      readmeText: null,
      readmePath: null,
      readmeRef: null,
      repositoryId: 42,
      headSha: "a".repeat(40),
    },
    evidence: {},
  };
  const provider = {
    generate: vi.fn(async () => ({
      output: {
        summary: { value: summary, evidence: ["description:1-2"] },
        result: "accepted-unchanged" as const,
        change_reasons: [],
        policy_signal: "none" as const,
      },
      metadata: { requestedModel: model, returnedModel: model, latencyMs: 1 },
    })),
  };
  return {
    state,
    report,
    projects,
    sources,
    observation,
    provider,
    observe: vi.fn(async () => observation),
  };
}
test("native acquisition emits one actual CLI checkpoint and immutable rollout configuration", async () => {
  const f = fixture();
  const operation = f.state.operations[0];
  const output = await acquirePreparedEnrichmentData({
    state: f.state,
    operation,
    options: {
      provider: f.provider,
      observe: f.observe,
      providerConfiguration,
    },
  });
  expect(Object.keys(output).sort()).toEqual([
    "data/registry/projects/a.json",
    "data/reports/enrichment-canary.json",
  ]);
  expect(f.provider.generate).toHaveBeenCalledOnce();
  const next = JSON.parse(output["data/reports/enrichment-canary.json"]);
  expect(next).toMatchObject({
    run_id: "owner-canary",
    primary_cursor: 1,
    batch_size: 30,
    concurrency: 6,
    selection_mode: "all-automatic",
    expected_model: model,
    manifest: ["a", "b", "c", "d", "e"],
  });
  expect(f.report.primary_cursor).toBe(0);
  const updated = JSON.parse(output["data/registry/projects/a.json"]);
  expect(updated.summary).toBe(summary);
  expect(updated.metadata_policy).toEqual(f.projects[0].metadata_policy);
  expect(updated.tags).toEqual([]);
});
test("a verified empty repository source produces a validated fallback without model allowance", async () => {
  const f = fixture();
  (
    f.state.local.snapshots as Array<{
      repository: { description: string | null };
    }>
  )[0].repository.description = null;
  f.state.operations = discoverEnrichmentOperations(f.state);
  const observe = vi.fn(async () => ({
    source: {
      ...f.observation.source,
      status: "fallback" as const,
      sourceKind: "confirmed-fallback" as const,
    },
  }));
  const budgetGuard = vi.fn();
  const operation = f.state.operations[0];
  const outputs = await acquirePreparedEnrichmentData({
    state: f.state,
    operation,
    options: { observe, providerConfiguration, budgetGuard },
  });
  const context = await createPreparedEnrichmentContext({
    state: f.state,
    operation,
    observe,
  });
  expect(
    context.validateFiles!(
      Object.entries(outputs).map(([path, content]) => ({ path, content })),
    ),
  ).toBe(true);
  expect(
    JSON.parse(outputs["data/reports/enrichment-canary.json"]).entries.a
      .outcome,
  ).toBe("fallback");
  expect(budgetGuard).not.toHaveBeenCalled();
});
test("the real immutable envelope rejects changes to frozen rollout state and owner fields", async () => {
  const f = fixture();
  const operation = f.state.operations[0];
  const context = await createPreparedEnrichmentContext({
    state: f.state,
    operation,
    observe: f.observe,
  });
  const producer = {
    workflow: ".github/workflows/enrich-catalog.yml",
    runId: 42,
    sourceSha: String(f.state.local.revision),
  };
  const result = await prepareCatalogOperation({
    state: f.state,
    operation,
    producer,
    context: async () => context,
    acquire: (input) =>
      acquirePreparedEnrichmentData({
        ...input,
        options: {
          provider: f.provider,
          observe: f.observe,
          providerConfiguration,
        },
      }),
  });
  expect(result?.kind).toBe("enrichment");
  const files = result!.files;
  expect(context.validateFiles!(files)).toBe(true);
  const unproved = structuredClone(files);
  const unprovedFile = unproved.find((row) => row.path.includes("reports/"))!;
  const unprovedReport = JSON.parse(unprovedFile.content);
  for (const field of [
    "requested_model",
    "returned_model",
    "latency_ms",
    "provider_calls",
    "provider_repair_calls",
    "provider_rate_limit_events",
    "provider_latency_ms_total",
  ])
    delete unprovedReport.entries.a[field];
  unprovedFile.content = JSON.stringify(createEnrichmentReport(unprovedReport));
  expect(
    context.validateFiles!(unproved),
    "a model-produced success must carry its actual model/accounting evidence",
  ).toBe(false);
  for (const field of [
    "manifest",
    "selection_mode",
    "expected_model",
    "batch_size",
    "run_id",
    "authorized_canary_run_id",
    "deployment",
    "publication",
    "primary_cursor",
  ]) {
    const changed = structuredClone(files);
    const file = changed.find((row) => row.path.includes("reports/"))!;
    const value = JSON.parse(file.content);
    value[field] =
      field === "manifest"
        ? ["a", "b", "c", "d", "unexpected"]
        : field === "primary_cursor"
          ? 2
          : "altered";
    file.content = JSON.stringify(value);
    expect(context.validateFiles!(changed), field).toBe(false);
  }
  const changed = structuredClone(files);
  const projectFile = changed.find((row) => row.path.includes("projects/"))!;
  const project = JSON.parse(projectFile.content);
  project.metadata_policy.tags.mode = "automatic";
  projectFile.content = JSON.stringify(project);
  expect(context.validateContent(projectFile.path, project)).toBe(false);
  const run = {
    id: 42,
    path: producer.workflow,
    actor: { id: 900, type: "Bot" },
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: producer.sourceSha,
    head_repository: { full_name: f.state.repository },
    status: "completed",
    conclusion: "success",
  };
  expect(
    validatePreparedResult(result, {
      operation,
      run,
      publisherActorId: 900,
      currentState: context,
    }),
  ).toBe(result);
});
test.each([
  "provider-server-error",
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-authentication-failed",
  "provider-model-mismatch",
])(
  "native preparation keeps %s pending rather than charging a record attempt",
  async (code) => {
    const f = fixture();
    f.provider.generate.mockRejectedValueOnce(
      Object.assign(new Error("Unavailable"), { code }),
    );
    await expect(
      acquirePreparedEnrichmentData({
        state: f.state,
        operation: f.state.operations[0],
        options: {
          provider: f.provider,
          observe: f.observe,
          providerConfiguration,
        },
      }),
    ).rejects.toMatchObject({ code });
    expect(f.report.primary_cursor).toBe(0);
    expect(f.report.attempts).toEqual({});
  },
);
test("a lexical legacy passed canary cannot authorize native full rollout", () => {
  const f = fixture();
  const completed = applyAttemptResults(
    f.report,
    f.report.manifest.map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  f.state.local.enrichmentCanary = createEnrichmentReport(
    approveCanaryDeployment(completed, {
      commitSha: "a".repeat(40),
      deploymentRunId: 100,
      now,
    }),
  );
  f.state.local.enrichmentFull = createEnrichmentReport(
    createEnrichmentRunState({
      mode: "full",
      runId: "legacy-full",
      manifest: ["a"],
      model,
      now,
      selectionMode: "all-automatic",
      authorizedCanaryRunId: "owner-canary",
    }),
  );
  expect(discoverEnrichmentOperations(f.state)).toEqual([]);
});
test("a changed current record or frozen report supersedes a captured operation", async () => {
  const f = fixture();
  const operation = f.state.operations[0];
  f.projects[0].summary = "Owner edited this summary.";
  await expect(
    createPreparedEnrichmentContext({
      state: f.state,
      operation,
      observe: f.observe,
    }),
  ).rejects.toMatchObject({ code: "input-superseded" });
  expect(f.provider.generate).not.toHaveBeenCalled();
});
test("native acquisition rejects exhausted verified allowance before any actual model HTTP", async () => {
  const f = fixture();
  const transport = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected HTTP"));
  const beforeRequest = vi.fn(() => {
    throw Object.assign(new Error("Denied"), { code: "budget-exhausted" });
  });
  try {
    await expect(
      acquirePreparedEnrichmentData({
        state: f.state,
        operation: f.state.operations[0],
        options: {
          providerConfiguration,
          observe: f.observe,
          budgetGuard: async () => ({ beforeRequest }),
        },
      }),
    ).rejects.toMatchObject({ code: "budget-exhausted" });
    expect(beforeRequest).toHaveBeenCalledOnce();
    expect(transport).not.toHaveBeenCalled();
    expect(f.report.attempts).toEqual({});
  } finally {
    transport.mockRestore();
  }
});
test("native model configuration changes are surfaced before reserving or calling a provider", async () => {
  const f = fixture();
  const budgetGuard = vi.fn();
  await expect(
    acquirePreparedEnrichmentData({
      state: f.state,
      operation: f.state.operations[0],
      options: {
        providerConfiguration: {
          ...providerConfiguration,
          model: "changed-model",
        },
        observe: f.observe,
        budgetGuard,
      },
    }),
  ).rejects.toMatchObject({ code: "provider-model-mismatch" });
  expect(budgetGuard).not.toHaveBeenCalled();
  const commit = vi.fn();
  const transport = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValue(new Error("Unexpected probe"));
  try {
    const env = {
      GITHUB_REPOSITORY: f.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_ACTOR_ID: "2625904",
      TAVERNARY_PUBLISHER_BOT_ID: "900",
      GITHUB_RUN_ID: "77",
      GITHUB_RUN_ATTEMPT: "1",
      UTILITY_MODEL: "changed-model",
    };
    await expect(
      runModelWriterPreparation({
        operationKey: f.state.operations[0].key,
        env,
        load: async () => f.state,
        commit,
        persistFailure: vi.fn(async () => {}),
      }),
    ).rejects.toMatchObject({ code: "provider-model-mismatch" });
    expect(commit).not.toHaveBeenCalled();
    expect(transport).not.toHaveBeenCalled();
  } finally {
    transport.mockRestore();
  }
});
test("a newly manual record advances through native preparation without reserving model allowance", async () => {
  const f = fixture();
  f.projects[0].metadata_policy.summary.mode = "manual";
  Object.assign(f.projects[0].metadata_policy.summary, {
    note: "Owner writes the summary.",
  });
  f.state.operations = discoverEnrichmentOperations(f.state);
  const operation = f.state.operations[0];
  const commit = vi.fn();
  const dispatch = vi.fn();
  const dispatchCached = vi.fn(async () => ({
    runId: 88,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const env = {
    GITHUB_REPOSITORY: f.state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    GITHUB_ACTOR_ID: "2625904",
    TAVERNARY_PUBLISHER_BOT_ID: "900",
    GITHUB_RUN_ID: "77",
    GITHUB_RUN_ATTEMPT: "1",
    UTILITY_MODEL: model,
  };
  expect(
    await runModelWriterPreparation({
      operationKey: operation.key,
      env,
      load: async () => f.state,
      commit,
      dispatch,
      dispatchCached,
      persistFailure: vi.fn(async () => {}),
    }),
  ).toMatchObject({ status: "cache-dispatched", runId: 88 });
  expect(commit).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  const budgetGuard = vi.fn();
  const outputs = await acquirePreparedEnrichmentData({
    state: f.state,
    operation,
    options: { providerConfiguration, observe: f.observe, budgetGuard },
  });
  expect(Object.keys(outputs)).toEqual(["data/reports/enrichment-canary.json"]);
  expect(
    JSON.parse(outputs["data/reports/enrichment-canary.json"]).entries.a,
  ).toMatchObject({
    outcome: "skipped",
    reason_code: "manual-enrichment-policy",
  });
  expect(budgetGuard).not.toHaveBeenCalled();
  expect(f.observe).not.toHaveBeenCalled();
});
test("the normal worker and immutable-result wake route the native rollout through the existing writer", () => {
  const f = fixture();
  const operation = f.state.operations[0];
  expect(planAutomationWorker(operation)).toMatchObject({
    action: "dispatch",
    workflow: "automation-writer.yml",
    inputs: { mode: "prepare", operation_key: operation.key },
  });
  const run = {
    id: 42,
    path: ".github/workflows/enrich-catalog.yml",
    actor: { id: 900, type: "Bot" },
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: String(f.state.local.revision),
    head_repository: { full_name: f.state.repository },
    status: "completed",
    conclusion: "success",
    display_title: `Automation prepare ${operation.key}`,
  };
  expect(
    selectPreparedWakes({
      runs: [run],
      operations: [operation],
      repository: f.state.repository,
      publisherActorId: 900,
      nowMs: f.state.nowMs,
    }),
  ).toEqual([{ operationKey: operation.key, runId: 42 }]);
});
test("full resumption requires the actual historical checkpoint and native public confirmation", async () => {
  const f = fixture();
  const prefix = join(tmpdir(), "tavernary-native-canary-");
  const root = await mkdtemp(prefix);
  try {
    const checkpoint = createEnrichmentReport(
      applyAttemptResults(
        f.report,
        f.report.manifest.map((id) => ({
          id,
          phase: "primary" as const,
          outcome: "enriched" as const,
        })),
        now,
      ),
    );
    const content = await formatJson(checkpoint);
    await mkdir(join(root, "data/reports"), { recursive: true });
    await writeFile(join(root, "data/reports/enrichment-canary.json"), content);
    const git = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }).trim();
    git("init", "--initial-branch=main");
    git("add", "data/reports/enrichment-canary.json");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.test",
      "commit",
      "-m",
      "Checkpoint",
    );
    const revision = git("rev-parse", "HEAD");
    const canary = createEnrichmentReport(
      approveCanaryDeployment(
        recordCheckpointPublication(checkpoint, { commitSha: revision, now }),
        { commitSha: revision, deploymentRunId: 100, now },
      ),
    );
    const full = createEnrichmentReport(
      createEnrichmentRunState({
        mode: "full",
        runId: "native-full",
        manifest: ["a"],
        model,
        now,
        selectionMode: "all-automatic",
        authorizedCanaryRunId: canary.run_id,
      }),
    );
    const hash = createHash("sha256").update(content).digest("hex");
    f.state.root = root;
    f.state.local.enrichmentCanary = canary;
    f.state.local.enrichmentFull = full;
    f.state.local.publications = [
      {
        revision,
        record: {
          operation: { identity: { kind: "enrichment" } },
          files: [
            { path: "data/reports/enrichment-canary.json", sha256: hash },
          ],
        },
      },
    ];
    f.state.local.publicationFileDigests = {
      [`${revision}:data/reports/enrichment-canary.json`]: hash,
    };
    f.state.local.deployments = [
      {
        sourceSha: revision,
        workflowRunId: 100,
        status: "confirmed",
        bundleDigest: "b".repeat(64),
        confirmation: {
          sourceSha: revision,
          catalogDigest: "c".repeat(64),
          targetDigest: "d".repeat(64),
          buildDigest: "b".repeat(64),
          essentialSmokePassed: true,
        },
      },
    ];
    // Later data writes must not erase the already proved canary admission.
    f.state.local.confirmedRevisions = [];
    expect(hasConfirmedEnrichmentCanary(f.state, full)).toBe(true);
    expect(discoverEnrichmentOperations(f.state)[0].identity.kind).toBe(
      "enrichment",
    );
    for (const mutation of [
      "run",
      "browser",
      "bundle",
      "file",
      "authority",
    ] as const) {
      const changed = structuredClone(f.state);
      if (mutation === "run")
        (
          changed.local.deployments as Array<{ workflowRunId: number }>
        )[0].workflowRunId = 101;
      if (mutation === "browser")
        (
          changed.local.deployments as Array<{
            confirmation: { essentialSmokePassed: boolean };
          }>
        )[0].confirmation.essentialSmokePassed = false;
      if (mutation === "bundle")
        (
          changed.local.deployments as Array<{ bundleDigest: string }>
        )[0].bundleDigest = "f".repeat(64);
      if (mutation === "file") changed.local.publicationFileDigests = {};
      if (mutation === "authority")
        changed.local.enrichmentFull = {
          ...full,
          authorized_canary_run_id: "different-canary",
        };
      expect(
        hasConfirmedEnrichmentCanary(
          changed,
          changed.local.enrichmentFull as typeof full,
        ),
        mutation,
      ).toBe(false);
    }
  } finally {
    if (!root.startsWith(prefix)) throw new Error("Unsafe fixture cleanup");
    await rm(root, { recursive: true, force: true });
  }
});
