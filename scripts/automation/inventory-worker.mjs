import { validateAutomationReceipt } from "./receipts.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
export function trustedOperationWorkerRuns(input, operation) {
  return (input.runs ?? [])
    .filter(
      (run) =>
        run.path === ".github/workflows/automation-worker.yml" &&
        run.event === "workflow_dispatch" &&
        run.head_branch === (input.defaultBranch ?? "main") &&
        run.display_title === `Automation ${operation.key}` &&
        Number.isSafeInteger(input.publisherActorId) &&
        run.actor?.id === input.publisherActorId &&
        run.actor.type === "Bot",
    )
    .sort(
      (left, right) =>
        Date.parse(right.created_at ?? "") -
          Date.parse(left.created_at ?? "") || right.id - left.id,
    );
}
const activeStatuses = new Set([
  "queued",
  "in_progress",
  "pending",
  "requested",
  "waiting",
]);
export function isInventoryWorkerActive(run) {
  return activeStatuses.has(run.status) || run.conclusion == null;
}
export function matchingOperationReceipt(input, operation) {
  return input.receipts
    .flatMap((value) => {
      try {
        return [validateAutomationReceipt(value)];
      } catch {
        return [];
      }
    })
    .filter(
      (receipt) =>
        receipt.operation.key === operation.key &&
        receipt.operation.stage === operation.stage &&
        receipt.operation.expectedSha === operation.expectedSha,
    )
    .sort(
      (left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt),
    )[0];
}

export function receiptBindsWorker(run, receipt) {
  return (
    receipt &&
    (receipt.operation.workerRunId === run.id ||
      (receipt.operation.nextEligibleAt !== null &&
        Date.parse(run.created_at ?? "") >=
          Date.parse(receipt.updatedAt) - 1000 &&
        Date.parse(run.created_at ?? "") <=
          Date.parse(receipt.updatedAt) + 15 * 60_000) ||
      (receipt.operation.retry !== null &&
        Date.parse(run.created_at ?? "") <= Date.parse(receipt.updatedAt)))
  );
}

export function recoverInventoryWorker(operation, input, runs) {
  const active = runs.find(isInventoryWorkerActive);
  if (active) {
    operation.workerRunId = active.id;
    return;
  }
  const receipt = matchingOperationReceipt(input, operation);
  const run = runs.find((candidate) => receiptBindsWorker(candidate, receipt));
  if (!run) {
    if (receipt?.operation.retry) {
      operation.retry = receipt.operation.retry;
      operation.nextEligibleAt = receipt.operation.nextEligibleAt;
    } else if (
      receipt?.operation.nextEligibleAt !== null &&
      receipt?.operation.nextEligibleAt !== undefined
    ) {
      operation.nextEligibleAt = receipt.operation.nextEligibleAt;
      if (Date.parse(operation.nextEligibleAt) <= input.nowMs) {
        operation.retry = {
          failure: classifyAutomationFailure(),
          transientAttempts: 0,
          immediateAttempts: 3,
        };
        operation.nextEligibleAt = planAutomationRetry({
          ...operation.retry,
          nowMs: Date.parse(receipt.updatedAt),
          jitterSeed: operation.key,
        }).nextEligibleAt;
      }
    }
    return;
  }
  const terminalAt = Date.parse(run.updated_at ?? run.created_at ?? "");
  if (
    run.conclusion === "success" &&
    Number.isFinite(terminalAt) &&
    input.nowMs < terminalAt + 15 * 60_000
  ) {
    operation.workerRunId = run.id;
    operation.nextEligibleAt = new Date(terminalAt + 15 * 60_000).toISOString();
    return;
  }
  const previous = receipt.operation.retry;
  if (
    previous &&
    (!Number.isFinite(terminalAt) ||
      Date.parse(receipt.updatedAt) >= terminalAt)
  ) {
    operation.retry = previous;
    operation.nextEligibleAt = receipt.operation.nextEligibleAt;
    return;
  }
  const failure = classifyAutomationFailure({
    ...run.failure,
    conclusion: run.conclusion,
  });
  const retryState = {
    failure,
    transientAttempts: (previous?.transientAttempts ?? -1) + 1,
    immediateAttempts:
      run.conclusion === "success"
        ? 3
        : (previous?.immediateAttempts ?? 0) +
          (failure.kind === "unknown" ? 1 : 0),
  };
  const retry = planAutomationRetry({
    ...retryState,
    nowMs: Number.isFinite(terminalAt) ? terminalAt : input.nowMs,
    retryAfterMs: run.retryAfterMs,
    jitterSeed: `${operation.key}:${run.id}:${run.run_attempt ?? 1}`,
  });
  operation.retry = retryState;
  operation.nextEligibleAt = retry.nextEligibleAt;
}
