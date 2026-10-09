import { validateAutomationOperation } from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";

export function applyFinalizationReceipt(operation, receipts) {
  validateAutomationOperation(operation);
  if (operation.stage !== "deployment-confirmed") return operation;
  const completed = receipts
    .map(validateAutomationReceipt)
    .some(
      (receipt) =>
        receipt.operation.key === operation.key &&
        receipt.operation.expectedSha === operation.expectedSha &&
        receipt.operation.stage === "finalized",
    );
  return completed
    ? {
        ...operation,
        stage: "finalized",
        workerRunId: null,
        retry: null,
        nextEligibleAt: null,
      }
    : operation;
}

export async function finalizeAutomationOperation({
  operationKey,
  load,
  project,
  persist,
}) {
  if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Finalization identity is invalid.");
  const initial = await load();
  if (!Number.isFinite(initial.nowMs))
    throw new Error("Finalization clock is invalid.");
  const operation = initial.operations.find(
    (value) => value.key === operationKey,
  );
  if (!operation) return { status: "superseded" };
  validateAutomationOperation(operation);
  if (operation.stage === "finalized") return { status: "already-finalized" };
  if (operation.stage !== "deployment-confirmed") return { status: "waiting" };
  if (
    operation.retry &&
    (operation.retry.failure.kind === "permanent" ||
      (operation.nextEligibleAt !== null &&
        Date.parse(operation.nextEligibleAt) > initial.nowMs))
  )
    return { status: "waiting" };
  const projection = await project(operation, initial);
  if (projection?.status === "waiting") return { status: "waiting" };
  if (!["complete", "superseded"].includes(projection?.status))
    throw new Error("Finalization projection is invalid.");
  const fresh = await load();
  if (!Number.isFinite(fresh.nowMs))
    throw new Error("Finalization clock is invalid.");
  const current = fresh.operations.find((value) => value.key === operationKey);
  if (!current) return { status: "superseded" };
  validateAutomationOperation(current);
  if (current.stage === "finalized") return { status: "already-finalized" };
  if (
    current.stage !== "deployment-confirmed" ||
    current.expectedSha !== operation.expectedSha
  )
    return { status: "waiting" };
  const finished = {
    ...current,
    stage: "finalized",
    workerRunId: null,
    nextEligibleAt: null,
    retry: null,
  };
  const receipt = validateAutomationReceipt({
    schema_version: 1,
    operation: finished,
    updatedAt: new Date(fresh.nowMs).toISOString(),
    completedAt: new Date(fresh.nowMs).toISOString(),
  });
  await persist(receipt);
  return { status: "finalized" };
}
