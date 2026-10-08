import { operationKey } from "./operation.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";
const digest = /^[a-f0-9]{64}$/u;
const sha = /^[a-f0-9]{40}$/u;

export function isConfirmedDeployment(deployment, commit) {
  const proof = deployment.confirmation;
  return (
    deployment.status === "confirmed" &&
    proof?.sourceSha === commit.sha &&
    proof.catalogDigest === commit.catalogDigest &&
    proof.targetDigest === commit.targetDigest &&
    digest.test(deployment.bundleDigest ?? "") &&
    proof.buildDigest === deployment.bundleDigest &&
    proof.essentialSmokePassed === true
  );
}

export function discoverDeploymentOperations(input) {
  const commit = input.mainCommits.find(
    (commit) => commit.sha === input.mainHeadSha,
  );
  if (
    !commit?.publishable ||
    !sha.test(commit.sha) ||
    !digest.test(commit.catalogDigest) ||
    !digest.test(commit.targetDigest)
  )
    return [];
  const identity = {
    kind: "deployment",
    subject: `revision:${commit.sha}`,
    inputDigest: fingerprintProjectPublicationInput({
      sha: commit.sha,
      catalogDigest: commit.catalogDigest,
      targetDigest: commit.targetDigest,
    }),
    policyVersion: "1",
  };
  const matching = input.deployments.filter(
    (deployment) => deployment.sourceSha === commit.sha,
  );
  const confirmed = matching.some((deployment) =>
    isConfirmedDeployment(deployment, commit),
  );
  const operation = {
    key: operationKey(identity),
    identity,
    stage: confirmed
      ? "deployment-confirmed"
      : matching.some((deployment) =>
            ["requested", "confirmed"].includes(deployment.status),
          )
        ? "deployment-requested"
        : "published",
    createdAt: new Date(commit.committedAt).toISOString(),
    nextEligibleAt: null,
    expectedSha: commit.sha,
    workerRunId: null,
    retry: null,
  };
  if (!confirmed)
    recoverInventoryWorker(
      operation,
      input,
      trustedOperationWorkerRuns(input, operation),
    );
  return [operation];
}
