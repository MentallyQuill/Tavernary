import {
  classifyAutomationFailure,
  AUTOMATION_FAILURE_REASON_KINDS,
} from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";

export async function persistPreparedFailure({
  operationKey,
  load,
  persist,
  error,
}) {
  if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Prepared failure key is invalid.");
  const state = await load();
  const operation = state.operations.find(
    (operation) => operation.key === operationKey,
  );
  if (
    !operation ||
    operation.retry?.failure.kind === "permanent" ||
    (operation.retry &&
      operation.nextEligibleAt !== null &&
      Date.parse(operation.nextEligibleAt) > state.nowMs) ||
    ["deployment-confirmed", "finalized"].includes(operation.stage) ||
    (operation.identity.kind !== "deployment" &&
      ["published", "deployment-requested"].includes(operation.stage))
  )
    return { persisted: false, incident: false };
  const code = error?.code;
  const diagnostic = error?.failure;
  const failure = classifyAutomationFailure({
    diagnosticCode:
      diagnostic &&
      Object.hasOwn(AUTOMATION_FAILURE_REASON_KINDS, diagnostic.reasonCode) &&
      AUTOMATION_FAILURE_REASON_KINDS[diagnostic.reasonCode] === diagnostic.kind
        ? diagnostic.reasonCode
        : code,
    httpStatus: githubFailureStatus(error),
    authorizationLost: [
      "authorization-lost",
      "prepared-authority-lost",
    ].includes(code),
    superseded: [
      "input-superseded",
      "prepared-input-stale",
      "prepared-source-changed",
      "prepared-base-stale",
      "prepared-path-conflict",
    ].includes(code),
    validationErrors:
      typeof code === "string" &&
      code.startsWith("prepared-") &&
      ![
        "prepared-load-unavailable",
        "prepared-authority-lost",
        "prepared-input-stale",
        "prepared-source-changed",
        "prepared-base-stale",
        "prepared-path-conflict",
      ].includes(code)
        ? ["invalid-prepared-data"]
        : [],
  });
  const retry = {
    failure,
    transientAttempts: Math.min(
      Number.MAX_SAFE_INTEGER,
      (operation.retry?.transientAttempts ?? -1) + 1,
    ),
    immediateAttempts: Math.min(
      Number.MAX_SAFE_INTEGER,
      (operation.retry?.immediateAttempts ?? 0) +
        (failure.kind === "unknown" ? 1 : 0),
    ),
  };
  const decision = planAutomationRetry({
    ...retry,
    nowMs: state.nowMs,
    retryAfterMs: error?.retryAfterMs,
    jitterSeed: operation.key,
  });
  await persist(
    validateAutomationReceipt({
      schema_version: 1,
      operation: {
        ...operation,
        retry,
        workerRunId: null,
        nextEligibleAt: decision.nextEligibleAt,
      },
      updatedAt: new Date(state.nowMs).toISOString(),
      completedAt: null,
    }),
  );
  return { persisted: true, incident: decision.incident === true };
}
