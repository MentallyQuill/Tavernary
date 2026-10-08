import {
  selectDueOperations,
  validateAutomationOperation,
} from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";

export async function reconcileAutomation(input) {
  if (!Number.isFinite(input.nowMs))
    throw new Error("Reconciliation clock is invalid.");
  const operations = await input.inventory();
  const selected = selectDueOperations(operations, {
    nowMs: input.nowMs,
    limit: input.limit ?? 20,
  });
  const result = {
    dispatched: 0,
    waiting: 0,
    finished: 0,
    incidents: 0,
    permanentFailures: 0,
    selectedKeys: selected.map((operation) => operation.key),
  };
  const receipts = new Map(
    (input.receipts ?? []).map((receipt) => [
      validateAutomationReceipt(receipt).operation.key,
      receipt,
    ]),
  );
  for (const operation of operations) {
    if (operation.stage === "finalized") result.finished++;
    else if (operation.retry?.failure.kind === "permanent")
      result.permanentFailures++;
    else if (!selected.includes(operation)) result.waiting++;
  }
  async function persist(operation) {
    const previous = receipts.get(operation.key);
    if (
      previous &&
      JSON.stringify(previous.operation) === JSON.stringify(operation)
    )
      return;
    const receipt = validateAutomationReceipt({
      schema_version: 1,
      operation,
      updatedAt: new Date(input.nowMs).toISOString(),
      completedAt:
        operation.stage === "finalized"
          ? new Date(input.nowMs).toISOString()
          : null,
    });
    if (!input.dryRun) await input.persist(receipt);
    receipts.set(operation.key, receipt);
  }
  let observationSlots = Math.min(input.limit ?? 20, 20) - selected.length;
  for (const operation of [...operations].sort(
    (left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt) ||
      left.key.localeCompare(right.key),
  )) {
    const peers = operations.filter((peer) => peer.key === operation.key);
    if (
      observationSlots > 0 &&
      !selected.includes(operation) &&
      peers.every(
        (peer) => JSON.stringify(peer) === JSON.stringify(operation),
      ) &&
      (operation.workerRunId !== null ||
        operation.retry !== null ||
        [
          "published",
          "deployment-requested",
          "deployment-confirmed",
          "finalized",
        ].includes(operation.stage))
    ) {
      await persist(operation);
      observationSlots--;
    }
  }
  for (const candidate of selected) {
    let operation = input.revalidate
      ? await input.revalidate(candidate)
      : candidate;
    if (
      !operation ||
      operation.key !== candidate.key ||
      !selectDueOperations([operation], { nowMs: input.nowMs, limit: 1 }).length
    ) {
      result.waiting++;
      continue;
    }
    validateAutomationOperation(operation);
    if (input.dryRun) continue;
    const intent = {
      ...operation,
      nextEligibleAt: new Date(input.nowMs + 15 * 60_000).toISOString(),
    };
    await persist(intent);
    try {
      const effect = await input.dispatch(operation);
      const next = effect.operation ?? {
        ...intent,
        workerRunId: effect.workerRunId ?? null,
      };
      validateAutomationOperation(next);
      if (next.key !== operation.key)
        throw new Error("Dispatch result operation identity changed.");
      operation = next;
      if (operation.stage === "finalized") result.finished++;
      else if (effect.waiting) result.waiting++;
      else result.dispatched++;
    } catch (error) {
      const failure = classifyAutomationFailure({
        diagnosticCode: error?.code,
        httpStatus: githubFailureStatus(error),
        superseded: error?.superseded,
      });
      const retryState = {
        failure,
        transientAttempts: (operation.retry?.transientAttempts ?? -1) + 1,
        immediateAttempts:
          (operation.retry?.immediateAttempts ?? 0) +
          (failure.kind === "unknown" ? 1 : 0),
      };
      const retry = planAutomationRetry({
        ...retryState,
        nowMs: input.nowMs,
        retryAfterMs: error?.retryAfterMs,
        jitterSeed: operation.key,
      });
      await persist({
        ...operation,
        workerRunId: null,
        retry: retryState,
        nextEligibleAt: retry.nextEligibleAt,
      });
      if (retry.incident) result.incidents++;
      if (failure.kind === "permanent") result.permanentFailures++;
      else result.waiting++;
      continue;
    }
    await persist(operation);
  }
  return result;
}
