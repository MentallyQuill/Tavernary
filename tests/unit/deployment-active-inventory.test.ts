import { expect, test } from "vitest";
import { deploymentInventoryFixture } from "../helpers/automation-fixtures";
import { discoverDeploymentOperations } from "../../scripts/automation/deployment-operations.mjs";
import { verifiedAutomationDeployments } from "../../scripts/automation/data-digests.mjs";
import { createActiveDeployment } from "../../scripts/automation/deployment-state.mjs";

function fixture() {
  const input = deploymentInventoryFixture();
  const deployment = {
    schema_version: 1 as const,
    sourceSha: "a".repeat(40),
    status: "confirmed" as const,
    buildId: "run-41-attempt-1",
    workflowRunId: 41,
    bundleDigest: "e".repeat(64),
    confirmedAt: new Date(input.nowMs).toISOString(),
    confirmation: {
      sourceSha: "a".repeat(40),
      catalogDigest: "b".repeat(64),
      targetDigest: "c".repeat(64),
      buildDigest: "e".repeat(64),
      essentialSmokePassed: true as const,
    },
  };
  const activeDeployment = createActiveDeployment({
    deployment,
    confirmingRunId: 88,
    nowMs: input.nowMs,
    mode: "rollback",
    rollbackBaselineSha: input.mainHeadSha,
    rollbackReason: "Restore working presentation",
    ownerActorId: 2625904,
  });
  return { ...input, activeDeployment };
}

test("reconciliation respects a confirmed owner rollback until public code or data changes", () => {
  const input = fixture();
  expect(discoverDeploymentOperations(input)).toEqual([]);
  input.mainHeadSha = "f".repeat(40);
  input.mainCommits[0].sha = input.mainHeadSha;
  expect(discoverDeploymentOperations(input)).toMatchObject([
    { expectedSha: input.mainHeadSha, stage: "published" },
  ]);
  input.mainHeadSha = "d".repeat(40);
  input.mainCommits[0].sha = input.mainHeadSha;
  input.mainCommits[0].catalogDigest = "f".repeat(64);
  expect(discoverDeploymentOperations(input)[0].stage).toBe("published");
});

test("historical deployment proof cannot replace proof of the currently active site", () => {
  const input = fixture();
  input.activeDeployment = createActiveDeployment({
    deployment: input.activeDeployment.deployment,
    confirmingRunId: 41,
    nowMs: input.nowMs,
  });
  input.deployments = [
    {
      ...input.activeDeployment.deployment,
      sourceSha: input.mainHeadSha,
      confirmation: {
        ...input.activeDeployment.deployment.confirmation,
        sourceSha: input.mainHeadSha,
      },
    },
  ];
  expect(discoverDeploymentOperations(input)[0].stage).toBe("published");
  expect(
    verifiedAutomationDeployments({
      ...input,
      revision: input.mainHeadSha,
      catalogDigest: "b".repeat(64),
      targetDigest: "c".repeat(64),
      isAncestor: () => true,
    }),
  ).toEqual(["a".repeat(40)]);
});
