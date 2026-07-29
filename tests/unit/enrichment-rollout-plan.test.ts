import { expect, test } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  createEnrichmentRunState,
  recordCheckpointPublication,
  recordFullDeployment,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import {
  createEnrichmentRolloutPlan,
  planEnrichmentRollout,
  runPlannerCli,
} from "../../scripts/catalog/enrichment-rollout-plan.mjs";

const model = "minimax/minimax-m3:thinking";
const now = "2026-07-25T00:00:00.000Z";

function sourcesFor(records: Array<{ source_id: string }>) {
  return Object.fromEntries(
    records.map(({ source_id }) => [
      source_id,
      {
        id: source_id,
        type: "github",
        repository: `Creator/${source_id}`,
        refresh_policy: "automatic",
      },
    ]),
  );
}

function passedCanary(selectionMode: "pending" | "all-automatic" = "pending") {
  const awaiting = applyAttemptResults(
    createEnrichmentRunState({
      mode: "canary",
      manifest: ["a", "b", "c", "d", "e"],
      runId: "canary",
      now,
      model,
      selectionMode,
    }),
    ["a", "b", "c", "d", "e"].map((id) => ({
      id,
      phase: "primary" as const,
      outcome: "enriched" as const,
    })),
    now,
  );
  return approveCanaryDeployment(awaiting, {
    commitSha: "a".repeat(40),
    deploymentRunId: 12345,
    now,
  });
}

test("resumes an unfinished full rollout before considering a new canary", () => {
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 10,
      fullReport: {
        mode: "full",
        status: "running",
        phase: "primary",
        expected_model: model,
      },
      canaryReport: null,
    }),
  ).toEqual({ action: "resume-full" });
});

test("rejects resuming a full rollout under a different configured model", () => {
  expect(() =>
    planEnrichmentRollout({
      model,
      eligibleCount: 10,
      fullReport: {
        mode: "full",
        status: "running",
        phase: "primary",
        expected_model: "other/model",
      },
      canaryReport: null,
    }),
  ).toThrow("configured model does not match the running full rollout");
});

test("restarts a failed full rollout only when recoverable work remains", () => {
  const failed = {
    schema_version: 1,
    run_id: "failed-full",
    mode: "full",
    status: "failed",
    phase: "complete",
    expected_model: model,
    batch_size: 20,
    concurrency: 4,
    created_at: now,
    updated_at: now,
    manifest: ["missing"],
    deferred_ids: [],
    authorized_canary_run_id: "canary",
    primary_cursor: 1,
    retry_queue: [],
    retry_cursor: 0,
    attempts: { missing: 1 },
    entries: {
      missing: {
        id: "missing",
        attempt: 1,
        phase: "primary",
        outcome: "final-failure",
        reason_code: "record-missing",
        completed_at: now,
      },
    },
    publication: null,
    deployment: null,
    aggregates: {},
  };

  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 10,
      fullReport: failed,
      canaryReport: passedCanary(),
    }),
  ).toEqual({ action: "restart-full" });
  expect(() =>
    planEnrichmentRollout({
      model,
      eligibleCount: 0,
      fullReport: failed,
      canaryReport: passedCanary(),
    }),
  ).toThrow("failed full rollout has no recoverable candidates");
});

test("completes without paid work when no enrichment candidates remain", () => {
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 0,
      fullReport: null,
      canaryReport: null,
    }),
  ).toEqual({ action: "complete" });
});

test("recovers an undeployed terminal full checkpoint before completing", () => {
  let full = applyAttemptResults(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["project"],
      runId: "full",
      now,
      model,
      authorizedCanaryRunId: "canary",
    }),
    [
      {
        id: "project",
        phase: "primary",
        outcome: "enriched",
      },
    ],
    now,
  );
  full = recordCheckpointPublication(full, {
    commitSha: "c".repeat(40),
    now,
  });

  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 0,
      fullReport: full,
      canaryReport: passedCanary(),
    }),
  ).toEqual({ action: "deploy-full" });

  full = recordFullDeployment(full, {
    commitSha: "c".repeat(40),
    deploymentRunId: 24680,
    now,
  });
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 0,
      fullReport: full,
      canaryReport: passedCanary(),
    }),
  ).toEqual({ action: "complete" });
});

test("starts a new full rollout from separately preserved canary authorization", () => {
  let previousFull = applyAttemptResults(
    createEnrichmentRunState({
      mode: "full",
      manifest: ["previous"],
      runId: "previous-full",
      now,
      model,
    }),
    [{ id: "previous", phase: "primary", outcome: "enriched" }],
    now,
  );
  previousFull = recordCheckpointPublication(previousFull, {
    commitSha: "d".repeat(40),
    now,
  });
  previousFull = recordFullDeployment(previousFull, {
    commitSha: "d".repeat(40),
    deploymentRunId: 24680,
    now,
  });

  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 190,
      fullReport: previousFull,
      canaryReport: passedCanary(),
    }),
  ).toEqual({ action: "start-full" });
});

test("rejects a corrupt ledger that claims the canary passed", () => {
  expect(() =>
    planEnrichmentRollout({
      model,
      eligibleCount: 190,
      fullReport: null,
      canaryReport: {
        ...passedCanary(),
        deployment: null,
      },
    }),
  ).toThrow("full rollout requires a deployed canary");
});

test.each([
  ["running", "continue-canary"],
  ["awaiting-deployment", "deploy-canary"],
] as const)("recovers a %s canary with %s", (status, action) => {
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 190,
      fullReport: null,
      canaryReport: {
        mode: "canary",
        status,
        phase: status === "running" ? "retry" : "complete",
        expected_model: model,
      },
    }),
  ).toEqual({ action });
});

test("starts a fresh canary when deployed authorization is absent", () => {
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 190,
      fullReport: null,
      canaryReport: null,
    }),
  ).toEqual({ action: "start-canary" });
});

test("blocks a new rollout when fewer than five candidates need enrichment", () => {
  expect(() =>
    planEnrichmentRollout({
      model,
      eligibleCount: 4,
      fullReport: null,
      canaryReport: null,
    }),
  ).toThrow("requires at least five enrichment candidates; found 4");
});

test("catalog inspection reports the action and exact eligible count", () => {
  const records = Array.from({ length: 6 }, (_, index) => ({
    id: `project-${index}`,
    kind: "extension",
    summary:
      index === 5 ? "A curated project summary." : "Generic intake details.",
    metadata_status: index === 5 ? "curated" : "provisional",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-project-${index}`,
  }));

  expect(
    createEnrichmentRolloutPlan({
      model,
      records,
      sourcesById: sourcesFor(records),
      fullReport: null,
      canaryReport: null,
    }),
  ).toEqual({
    action: "start-canary",
    eligible_count: 5,
    manual_exclusion_count: 0,
  });
});

test("all-automatic planning counts eligible records and manual exclusions separately", () => {
  const automatic = Array.from({ length: 204 }, (_, index) => ({
    id: `automatic-${index}`,
    kind: index === 0 ? "preset" : "extension",
    summary: "A complete editorial description.",
    metadata_status: "curated",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-automatic-${index}`,
  }));
  const manual = Array.from({ length: 7 }, (_, index) => ({
    id: `manual-${index}`,
    kind: "preset",
    summary: "A manually curated description.",
    metadata_status: "curated",
    enrichment_policy: "manual",
    enrichment_note: "Requires review.",
    listing_status: "active",
    source_id: `github-manual-${index}`,
  }));

  expect(
    createEnrichmentRolloutPlan({
      model,
      records: [...automatic, ...manual],
      sourcesById: sourcesFor([...automatic, ...manual]),
      fullReport: null,
      canaryReport: null,
      selectionMode: "all-automatic",
    }),
  ).toEqual({
    action: "start-canary",
    eligible_count: 204,
    manual_exclusion_count: 7,
  });
});

test("rejects a running rollout from another selection mode", () => {
  expect(() =>
    planEnrichmentRollout({
      model,
      selectionMode: "pending",
      eligibleCount: 10,
      fullReport: {
        mode: "full",
        status: "running",
        phase: "primary",
        expected_model: model,
        selection_mode: "all-automatic",
      },
      canaryReport: null,
    }),
  ).toThrow("selection mode");
});

test("ignores terminal authorization from another selection mode", () => {
  expect(
    planEnrichmentRollout({
      model,
      selectionMode: "pending",
      eligibleCount: 10,
      fullReport: null,
      canaryReport: passedCanary("all-automatic"),
    }),
  ).toEqual({ action: "start-canary" });
});

test("ignores a completed full rollout from another selection mode", () => {
  expect(
    planEnrichmentRollout({
      model,
      selectionMode: "pending",
      eligibleCount: 10,
      fullReport: {
        mode: "full",
        status: "complete",
        expected_model: model,
        selection_mode: "all-automatic",
      },
      canaryReport: null,
    }),
  ).toEqual({ action: "start-canary" });
});

test("planner CLI returns a machine-readable recovery decision", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `project-${index}`,
    summary: "Generic intake details.",
    metadata_status: "provisional",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-project-${index}`,
  }));

  await expect(
    runPlannerCli({
      model,
      records,
      sources: Object.values(sourcesFor(records)),
      fullReport: null,
      canaryReport: null,
    }),
  ).resolves.toEqual({
    action: "start-canary",
    eligible_count: 5,
    manual_exclusion_count: 0,
  });
});

test("planner CLI quarantines a pre-hardening terminal full ledger", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `project-${index}`,
    summary: "Generic intake details.",
    metadata_status: "provisional",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-project-${index}`,
  }));
  const manifest = records.map(({ id }) => id);
  const entries = Object.fromEntries(
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
  );

  await expect(
    runPlannerCli({
      model,
      records,
      sources: Object.values(sourcesFor(records)),
      fullReport: {
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
        entries,
        deployment: null,
      },
      canaryReport: null,
    }),
  ).resolves.toEqual({
    action: "start-canary",
    eligible_count: 5,
    manual_exclusion_count: 0,
  });
});

test("planner CLI still rejects corrupt current-format terminal ledgers", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `project-${index}`,
    summary: "Generic intake details.",
    metadata_status: "provisional",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-project-${index}`,
  }));
  const manifest = records.map(({ id }) => id);
  const entries = Object.fromEntries(
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
  );

  await expect(
    runPlannerCli({
      model,
      records,
      sources: Object.values(sourcesFor(records)),
      fullReport: {
        schema_version: 1,
        run_id: "current-full",
        mode: "full",
        status: "complete",
        phase: "complete",
        expected_model: model,
        batch_size: 20,
        concurrency: 4,
        created_at: now,
        updated_at: now,
        manifest,
        deferred_ids: [],
        authorized_canary_run_id: null,
        primary_cursor: manifest.length,
        retry_queue: [],
        retry_cursor: 0,
        attempts: Object.fromEntries(manifest.map((id) => [id, 1])),
        entries,
        publication: null,
        deployment: null,
      },
      canaryReport: null,
    }),
  ).rejects.toThrow("terminal full report accounting is invalid");
});

test("planner CLI rejects a corrupt durable ledger before taking action", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `project-${index}`,
    summary: "Generic intake details.",
    metadata_status: "provisional",
    enrichment_policy: "automatic",
    listing_status: "active",
    source_id: `github-project-${index}`,
  }));

  await expect(
    runPlannerCli({
      model,
      records,
      sources: Object.values(sourcesFor(records)),
      fullReport: null,
      canaryReport: {
        mode: "canary",
        status: "passed",
      },
    }),
  ).rejects.toThrow("schema is invalid");
});
