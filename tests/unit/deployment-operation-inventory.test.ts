import { expect, test } from "vitest";
import { discoverDeploymentOperations } from "../../scripts/automation/deployment-operations.mjs";
import { deploymentInventoryFixture } from "../helpers/automation-fixtures";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";

test("an authoritative in-flight Pages run coalesces the current deployment while a fork or foreign dispatch cannot", () => {
  const input = deploymentInventoryFixture(),
    run = deploymentArtifactFixture().run;
  input.repository = "MentallyQuill/Tavernary";
  input.publisherActorId = 4624827;
  run.display_title = `Site: Deploy ${input.mainHeadSha}`;
  run.status = "in_progress";
  input.runs = [run];
  expect(discoverDeploymentOperations(input)[0]).toMatchObject({
    stage: "deployment-requested",
    workerRunId: 42,
  });
  run.actor.id = 99;
  expect(discoverDeploymentOperations(input)[0]).toMatchObject({
    stage: "published",
    workerRunId: null,
  });
  run.actor.id = 4624827;
  run.head_repository.id = 101;
  expect(discoverDeploymentOperations(input)[0]).toMatchObject({
    stage: "published",
    workerRunId: null,
  });
});

test("a bookkeeping-only head recovers the latest publishable ancestor exactly once", () => {
  const input = deploymentInventoryFixture();
  input.mainHeadSha = "e".repeat(40);
  input.latestPublishableSha = "d".repeat(40);
  expect(discoverDeploymentOperations(input)).toMatchObject([
    { expectedSha: "d".repeat(40), stage: "published" },
  ]);
  input.mainCommits[0].publishable = false;
  expect(discoverDeploymentOperations(input)).toEqual([]);
});

test("a lost deployment event is reconstructed only for the current trusted main revision", () => {
  const input = deploymentInventoryFixture();
  input.mainCommits.push({ ...input.mainCommits[0], sha: "a".repeat(40) });
  const operations = discoverDeploymentOperations(input);
  expect(operations).toHaveLength(1);
  expect(operations[0]).toMatchObject({
    stage: "published",
    expectedSha: "d".repeat(40),
  });
  expect(() => validateAutomationOperation(operations[0])).not.toThrow();
});

test("duplicate requests coalesce while a confirmed deployment requires exact content and smoke proof", () => {
  const input = deploymentInventoryFixture();
  input.deployments = [
    { sourceSha: "d".repeat(40), status: "requested" },
    { sourceSha: "d".repeat(40), status: "requested" },
  ];
  expect(discoverDeploymentOperations(input)).toHaveLength(1);
  expect(discoverDeploymentOperations(input)[0].stage).toBe(
    "deployment-requested",
  );
  input.deployments[0] = {
    sourceSha: "d".repeat(40),
    status: "confirmed",
    bundleDigest: "e".repeat(64),
    confirmation: {
      sourceSha: "d".repeat(40),
      catalogDigest: "b".repeat(64),
      targetDigest: "c".repeat(64),
      buildDigest: "e".repeat(64),
      essentialSmokePassed: true,
    },
  };
  expect(discoverDeploymentOperations(input)[0].stage).toBe(
    "deployment-confirmed",
  );
  input.deployments[0].confirmation!.essentialSmokePassed = false;
  expect(discoverDeploymentOperations(input)[0].stage).not.toBe(
    "deployment-confirmed",
  );
});

test.each(["revision", "catalog", "target", "build"])(
  "a %s-diverged confirmation cannot finalize main",
  (condition) => {
    const input = deploymentInventoryFixture();
    const confirmation = {
      sourceSha: "d".repeat(40),
      catalogDigest: "b".repeat(64),
      targetDigest: "c".repeat(64),
      buildDigest: "e".repeat(64),
      essentialSmokePassed: true,
    };
    if (condition === "revision") confirmation.sourceSha = "a".repeat(40);
    if (condition === "catalog") confirmation.catalogDigest = "f".repeat(64);
    if (condition === "target") confirmation.targetDigest = "f".repeat(64);
    if (condition === "build") confirmation.buildDigest = "f".repeat(64);
    input.deployments = [
      {
        sourceSha: "d".repeat(40),
        status: "confirmed",
        bundleDigest: "e".repeat(64),
        confirmation,
      },
    ];
    expect(discoverDeploymentOperations(input)[0].stage).not.toBe(
      "deployment-confirmed",
    );
  },
);

test("a workflow success without public proof remains pending confirmation", () => {
  const input = deploymentInventoryFixture();
  input.deployments = [{ sourceSha: "d".repeat(40), status: "confirmed" }];
  expect(discoverDeploymentOperations(input)[0].stage).toBe(
    "deployment-requested",
  );
});

test("unknown, malformed and nonpublishable revisions cannot become deployment targets", () => {
  const input = deploymentInventoryFixture();
  input.mainHeadSha = "a".repeat(40);
  expect(discoverDeploymentOperations(input)).toEqual([]);
  input.mainHeadSha = "d".repeat(40);
  input.mainCommits[0].publishable = false;
  expect(discoverDeploymentOperations(input)).toEqual([]);
});
