import { expect, test } from "vitest";
import { confirmCanonicalDeployment } from "../../scripts/automation/deployment-writer.mjs";
import type { CanonicalConfirmationInput } from "../../scripts/automation/deployment-writer.mjs";
import { confirmationFixture } from "../helpers/confirmation-fixtures";
import { confirmDeployment } from "../../scripts/automation/confirm-deployment.mjs";
import type { PreparedFile } from "../../scripts/automation/prepared-result.mjs";
import { createHash } from "node:crypto";
import { runDeploymentWriterConfirmation } from "../../scripts/automation/writer-runtime.mjs";
import { deploymentArtifactFixture } from "../helpers/deployment-artifact-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";

test("the production writer authenticates the actual Pages archive and commits only verified public proof", async () => {
  const artifact = deploymentArtifactFixture(),
    publicSite = confirmationFixture();
  const proof = await confirmDeployment(publicSite.input);
  const writes: unknown[] = [];
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: artifact.input.repository,
    publisherActorId: artifact.input.publisherActorId,
    nowMs: publicSite.input.nowMs,
    operations: [],
    receipts: [],
    remote: {
      issues: [],
      pulls: [],
      runs: [],
      mainHeadSha: artifact.input.currentMainSha,
    },
    local: { revision: artifact.input.currentMainSha, deployments: [] },
  };
  expect(
    await runDeploymentWriterConfirmation({
      runId: artifact.input.runId,
      env: {
        GITHUB_REF: "refs/heads/main",
        GITHUB_REPOSITORY: artifact.input.repository,
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
        TAVERNARY_PUBLISHER_BOT_ID: String(artifact.input.publisherActorId),
      },
      gh: artifact.input.gh,
      download: artifact.input.download,
      load: async () => state,
      isAncestor: () => true,
      probe: async () => proof,
      commit: async (value) => {
        writes.push(value);
        return { sha: "e".repeat(40) };
      },
    }),
  ).toMatchObject({ status: "confirmed" });
  expect(writes).toHaveLength(1);
});

async function fixture(
  options: { unconfirmed?: boolean; alreadyConfirmed?: boolean } = {},
) {
  const confirmation = confirmationFixture({
    wrongRevision: options.unconfirmed,
  });
  const proof = await confirmDeployment(confirmation.input);
  const commits: Array<{ expectedMainSha: string; files: PreparedFile[] }> = [];
  let loads = 0;
  const state = {
    revision: "d".repeat(40),
    nowMs: confirmation.input.nowMs,
    deployments:
      options.alreadyConfirmed && proof.status === "confirmed"
        ? [{ ...proof.deployment, workflowRunId: 42 }]
        : [],
  };
  const input: CanonicalConfirmationInput = {
    runId: 42,
    load: async () => ({
      ...state,
      revision: ++loads === 1 ? "b".repeat(40) : state.revision,
    }),
    loadManifest: async () => ({
      runId: 42,
      manifest: confirmation.input.expected,
    }),
    probe: async () => proof,
    isAncestor: () => true,
    commit: async (value) => {
      commits.push(value);
      return { sha: "e".repeat(40) };
    },
  };
  return { input, commits, proof };
}
test("only exact public and browser proof writes a durable confirmation through the current canonical lane", async () => {
  const data = await fixture();
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "confirmed",
    revision: "e".repeat(40),
  });
  expect(data.commits).toHaveLength(1);
  expect(data.commits[0].expectedMainSha).toBe("d".repeat(40));
  const file = data.commits[0].files[0];
  expect(file.path).toBe(
    `data/maintenance/automation/deployments/${"c".repeat(40)}.json`,
  );
  expect(file.sha256).toBe(
    createHash("sha256").update(file.content).digest("hex"),
  );
  expect(JSON.parse(file.content)).toMatchObject({
    workflowRunId: 42,
    confirmation: { essentialSmokePassed: true },
  });
});
test("unconfirmed output produces no canonical mutation", async () => {
  const data = await fixture({ unconfirmed: true });
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "waiting",
  });
  expect(data.commits).toEqual([]);
});
test("replayed confirmation keeps the existing proof without heartbeat writes", async () => {
  const data = await fixture({ alreadyConfirmed: true });
  expect(await confirmCanonicalDeployment(data.input)).toMatchObject({
    status: "already-confirmed",
  });
  expect(data.commits).toEqual([]);
});
test("unknown ancestry and substituted probe output cannot write confirmation", async () => {
  const data = await fixture();
  data.input.isAncestor = () => null;
  await expect(confirmCanonicalDeployment(data.input)).rejects.toThrow();
  expect(data.commits).toEqual([]);
  const forged = await fixture();
  forged.input.probe = async () => ({
    status: "confirmed",
    deployment: {
      ...(forged.proof.status === "confirmed"
        ? forged.proof.deployment
        : (() => {
            throw new Error("Invalid fixture");
          })()),
      bundleDigest: "f".repeat(64),
    },
  });
  await expect(confirmCanonicalDeployment(forged.input)).rejects.toThrow();
  expect(forged.commits).toEqual([]);
});
