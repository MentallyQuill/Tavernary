import { operationKey } from "./operation.mjs";
import { applyFinalizationReceipt } from "./finalization.mjs";
import {
  activeRollbackCoversMain,
  validateActiveDeployment,
} from "./deployment-state.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
  isInventoryWorkerActive,
} from "./inventory-worker.mjs";
const digest = /^[a-f0-9]{64}$/u;
const sha = /^[a-f0-9]{40}$/u;

export function isConfirmedDeployment(deployment, commit) {
  const proof = deployment.confirmation;
  return (
    sha.test(commit.sha ?? "") &&
    digest.test(commit.catalogDigest ?? "") &&
    digest.test(commit.targetDigest ?? "") &&
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
    (commit) =>
      commit.sha === (input.latestPublishableSha ?? input.mainHeadSha),
  );
  if (
    !commit?.publishable ||
    !sha.test(commit.sha) ||
    !digest.test(commit.catalogDigest) ||
    !digest.test(commit.targetDigest)
  )
    return [];
  const active =
    input.activeDeployment == null
      ? null
      : validateActiveDeployment(input.activeDeployment, {
          nowMs: input.nowMs,
        });
  if (
    active &&
    activeRollbackCoversMain({
      active,
      latestPublishableSha: commit.sha,
      catalogDigest: commit.catalogDigest,
      targetDigest: commit.targetDigest,
      nowMs: input.nowMs,
    })
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
  const confirmed = active
    ? isConfirmedDeployment(active.deployment, commit)
    : matching.some((deployment) => isConfirmedDeployment(deployment, commit));
  const pages = (input.runs ?? [])
    .filter(
      (run) =>
        input.repository === "MentallyQuill/Tavernary" &&
        Number.isSafeInteger(input.publisherActorId) &&
        input.publisherActorId > 0 &&
        run.path === ".github/workflows/deploy-pages.yml" &&
        run.head_branch === "main" &&
        run.display_title === `Site: Deploy ${commit.sha}` &&
        Number.isSafeInteger(run.id) &&
        run.id > 0 &&
        Number.isSafeInteger(run.run_attempt) &&
        run.run_attempt > 0 &&
        sha.test(run.head_sha ?? "") &&
        Number.isSafeInteger(run.repository?.id) &&
        run.repository.id > 0 &&
        run.repository.full_name === input.repository &&
        run.head_repository?.id === run.repository.id &&
        run.head_repository.full_name === input.repository &&
        Number.isSafeInteger(run.actor?.id) &&
        run.actor.id > 0 &&
        (run.event === "push" ||
          (run.event === "workflow_dispatch" &&
            [2625904, input.publisherActorId].includes(run.actor.id))) &&
        (run.head_sha === commit.sha ||
          run.head_sha === input.mainHeadSha ||
          input.isAncestor?.(run.head_sha, input.mainHeadSha) === true),
    )
    .sort((a, b) => b.id - a.id);
  const inFlight = pages.find(isInventoryWorkerActive);
  const successful = pages.find(
    (run) => run.status === "completed" && run.conclusion === "success",
  );
  const operation = {
    key: operationKey(identity),
    identity,
    stage: confirmed
      ? "deployment-confirmed"
      : inFlight ||
          successful ||
          matching.some(
            (deployment) =>
              deployment.status === "requested" ||
              (!active && deployment.status === "confirmed"),
          )
        ? "deployment-requested"
        : "published",
    createdAt: new Date(commit.committedAt).toISOString(),
    nextEligibleAt: null,
    expectedSha: commit.sha,
    workerRunId: null,
    retry: null,
  };
  Object.assign(operation, applyFinalizationReceipt(operation, input.receipts));
  if (!confirmed && inFlight) operation.workerRunId = inFlight.id;
  else if (operation.stage !== "finalized")
    recoverInventoryWorker(operation, input, [
      ...(!confirmed ? pages : []),
      ...trustedOperationWorkerRuns(input, operation),
    ]);
  return [operation];
}
