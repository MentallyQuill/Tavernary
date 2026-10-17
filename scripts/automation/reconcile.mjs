import {
  selectDueOperations,
  validateAutomationOperation,
} from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { isDirectSubmissionKind } from "./submission-routing.mjs";

function validateAdmissionPlan(plan, operations, limit) {
  if (
    !plan ||
    typeof plan !== "object" ||
    ![plan.admissionKeys, plan.orderedKeys, plan.consumedKeys].every(
      (keys) =>
        Array.isArray(keys) &&
        Array.from(keys).every(
          (key) => typeof key === "string" && /^[a-f0-9]{64}$/.test(key),
        ) &&
        new Set(keys).size === keys.length,
    ) ||
    !Array.isArray(plan.consumedSubjects) ||
    !Array.from(plan.consumedSubjects).every(
      (subject) =>
        typeof subject === "string" &&
        /^(issue|source|report|revision|dependency|runtime|maintenance):[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(
          subject,
        ),
    ) ||
    plan.admissionKeys.length > Math.min(limit, 20) ||
    plan.orderedKeys.length !== plan.admissionKeys.length
  )
    throw new Error("Reconciliation admission plan is invalid.");
  const inventoryKeys = new Set(operations.map((operation) => operation.key));
  const admissionKeys = new Set(plan.admissionKeys);
  if (
    !plan.admissionKeys.every((key) => inventoryKeys.has(key)) ||
    !plan.orderedKeys.every((key) => admissionKeys.has(key))
  )
    throw new Error("Reconciliation admission plan is invalid.");
  return plan;
}

export async function reconcileAutomation(input) {
  if (!Number.isFinite(input.nowMs))
    throw new Error("Reconciliation clock is invalid.");
  const operations = await input.inventory();
  const admissionPlan =
    input.admissionPlan === undefined
      ? null
      : validateAdmissionPlan(
          input.admissionPlan,
          operations.map(validateAutomationOperation),
          input.limit ?? 20,
        );
  const admissionKeys = admissionPlan && new Set(admissionPlan.admissionKeys);
  const consumedKeys = new Set(admissionPlan?.consumedKeys ?? []);
  const consumedSubjects = new Set(admissionPlan?.consumedSubjects ?? []);
  const selected = selectDueOperations(
    admissionPlan
      ? operations.filter(
          (operation) =>
            admissionKeys.has(operation.key) &&
            !isDirectSubmissionKind(operation.identity.kind) &&
            !consumedKeys.has(operation.key) &&
            !consumedSubjects.has(operation.identity.subject),
        )
      : operations.filter(
          (operation) => !isDirectSubmissionKind(operation.identity.kind),
        ),
    {
      nowMs: input.nowMs,
      limit: input.limit ?? 20,
    },
  );
  if (admissionPlan) {
    const ranks = new Map(
      admissionPlan.orderedKeys.map((key, index) => [key, index]),
    );
    selected.sort((left, right) => ranks.get(left.key) - ranks.get(right.key));
  }
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
      !isDirectSubmissionKind(operation.identity.kind) &&
      !selected.includes(operation) &&
      !consumedKeys.has(operation.key) &&
      !consumedSubjects.has(operation.identity.subject) &&
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
  let inlineFinalizationUsed = false;
  for (const candidate of selected) {
    let operation = input.revalidate
      ? await input.revalidate(candidate)
      : candidate;
    if (
      !operation ||
      isDirectSubmissionKind(operation.identity.kind) ||
      operation.key !== candidate.key ||
      !selectDueOperations([operation], { nowMs: input.nowMs, limit: 1 }).length
    ) {
      result.waiting++;
      continue;
    }
    validateAutomationOperation(operation);
    if (input.dryRun) continue;
    const inlineFinalization =
      operation.stage === "deployment-confirmed" &&
      input.finalize &&
      !inlineFinalizationUsed;
    if (inlineFinalization) inlineFinalizationUsed = true;
    const intent = {
      ...operation,
      nextEligibleAt: new Date(input.nowMs + 15 * 60_000).toISOString(),
    };
    // The serialized finalizer owns its durable receipt; a future dispatch lease
    // would block an otherwise-due retry before lifecycle projection starts.
    if (!inlineFinalization) await persist(intent);
    try {
      const effect = await (inlineFinalization
        ? input.finalize(operation)
        : input.dispatch(operation));
      if (inlineFinalization && !effect.operation)
        throw new Error("Inline finalization requires the current operation.");
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
      if (inlineFinalization) {
        // The finalizer reconstructs authority and owns failure persistence.
        // A lost response can follow a durable terminal write; this earlier
        // candidate must never overwrite that receipt with a stale retry.
        result.waiting++;
        result.incidents++;
        continue;
      }
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
