import { expect, test } from "vitest";

import {
  applyAttemptResults,
  approveCanaryDeployment,
  createEnrichmentRunState,
} from "../../scripts/catalog/enrichment-run-state.mjs";
import {
  createEnrichmentRolloutPlan,
  planEnrichmentRollout,
  runPlannerCli,
} from "../../scripts/catalog/enrichment-rollout-plan.mjs";

const model = "minimax/minimax-m3:thinking";
const now = "2026-07-25T00:00:00.000Z";

function passedCanary() {
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

test("starts a new full rollout from separately preserved canary authorization", () => {
  expect(
    planEnrichmentRollout({
      model,
      eligibleCount: 190,
      fullReport: {
        mode: "full",
        status: "complete",
        phase: "complete",
        expected_model: model,
      },
      canaryReport: passedCanary(),
    }),
  ).toEqual({ action: "start-full" });
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
    visibility: "published",
    source: { type: "github", repository: `Creator/project-${index}` },
  }));

  expect(
    createEnrichmentRolloutPlan({
      model,
      records,
      fullReport: null,
      canaryReport: null,
    }),
  ).toEqual({ action: "start-canary", eligible_count: 5 });
});

test("planner CLI returns a machine-readable recovery decision", async () => {
  const records = Array.from({ length: 5 }, (_, index) => ({
    id: `project-${index}`,
    summary: "Generic intake details.",
    metadata_status: "provisional",
    visibility: "published",
    source: { type: "github", repository: `Creator/project-${index}` },
  }));

  await expect(
    runPlannerCli({
      model,
      records,
      fullReport: null,
      canaryReport: null,
    }),
  ).resolves.toEqual({ action: "start-canary", eligible_count: 5 });
});
