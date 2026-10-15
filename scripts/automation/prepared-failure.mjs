import {
  classifyAutomationFailure,
  AUTOMATION_FAILURE_REASON_KINDS,
} from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import {
  generationRequestOperation,
  generationRequestPublisherRecovery,
} from "./preparation-request.mjs";
import { isDeepStrictEqual } from "node:util";
import { validateAutomationOperation } from "./operation.mjs";
import {
  assertTrustedPreparedProducer,
  assertTrustedPreparationOrigin,
} from "./prepared-result.mjs";
import {
  isInventoryWorkerActive,
  trustedOperationWorkerRuns,
  trustedWriterHandoff,
} from "./inventory-worker.mjs";

export function isPreparedDiagnosticObsolete({ state, evidence }) {
  if (
    !evidence?.artifact ||
    !Number.isSafeInteger(evidence.artifact.id) ||
    evidence.artifact.id < 1 ||
    !/^sha256:[a-f0-9]{64}$/u.test(evidence.artifact.digest ?? "") ||
    evidence.run?.run_attempt !== 1 ||
    evidence.run.conclusion === "success" ||
    !Number.isFinite(state.nowMs)
  )
    return false;
  const operations = state.operations.filter(
    (operation) => operation.key === evidence.operation.key,
  );
  const receipts = state.receipts.filter(
    (receipt) => receipt?.operation?.key === evidence.operation.key,
  );
  if (operations.length !== 1 || receipts.length !== 1) return false;
  const operation = operations[0];
  const receipt = receipts[0];
  try {
    validateAutomationOperation(evidence.operation);
    validateAutomationOperation(operation);
    validateAutomationReceipt(receipt);
    assertTrustedPreparedProducer({
      kind: operation.identity.kind,
      repository: state.repository,
      publisherActorId: state.publisherActorId,
      run: evidence.run,
      requireSuccess: false,
    });
  } catch {
    return false;
  }
  const terminalAt = Date.parse(evidence.run.updated_at ?? "");
  const createdAt = Date.parse(evidence.run.created_at ?? "");
  const receiptAt = Date.parse(receipt.updatedAt);
  if (
    !operation.retry ||
    !["transient", "unknown", "configuration"].includes(
      operation.retry.failure.kind,
    ) ||
    operation.workerRunId !== null ||
    [
      "published",
      "deployment-requested",
      "deployment-confirmed",
      "finalized",
    ].includes(operation.stage) ||
    !isDeepStrictEqual(operation, receipt.operation) ||
    !isDeepStrictEqual(operation.identity, evidence.operation.identity) ||
    operation.stage !== evidence.operation.stage ||
    operation.expectedSha !== evidence.operation.expectedSha ||
    operation.createdAt !== evidence.operation.createdAt ||
    !isDeepStrictEqual(operation.retry.failure, evidence.failure) ||
    evidence.run.display_title !== `Automation prepare ${operation.key}` ||
    !Number.isFinite(terminalAt) ||
    !Number.isFinite(createdAt) ||
    createdAt < Date.parse(operation.createdAt) ||
    createdAt > terminalAt ||
    terminalAt >= receiptAt ||
    receiptAt > state.nowMs
  )
    return false;
  const workerInput = {
    ...state,
    runs: state.remote.runs,
  };
  const workers = trustedOperationWorkerRuns(workerInput, operation);
  const observed = state.remote.runs.find((run) => run.id === evidence.run.id);
  if (
    !observed ||
    [
      "run_attempt",
      "created_at",
      "updated_at",
      "head_sha",
      "status",
      "conclusion",
      "display_title",
      "path",
      "event",
      "head_branch",
    ].some((field) => observed[field] !== evidence.run[field])
  )
    return false;
  try {
    assertTrustedPreparedProducer({
      kind: operation.identity.kind,
      repository: state.repository,
      publisherActorId: state.publisherActorId,
      run: observed,
      requireSuccess: false,
    });
  } catch {
    return false;
  }
  for (const run of state.remote.runs) {
    let preparation = false;
    if (run.display_title === `Automation prepare ${operation.key}`) {
      try {
        assertTrustedPreparationOrigin({
          kind: operation.identity.kind,
          repository: state.repository,
          publisherActorId: state.publisherActorId,
          run,
        });
        preparation = true;
      } catch {
        continue;
      }
    }
    const worker = workers.some((candidate) => candidate.id === run.id);
    const writer = trustedWriterHandoff(run, workerInput, operation);
    if (!preparation && !worker && !writer) continue;
    if (writer && run.id === state.executingWriterRunId) continue;
    const updatedAt = Date.parse(run.updated_at ?? "");
    if (
      isInventoryWorkerActive(run) ||
      !Number.isFinite(updatedAt) ||
      updatedAt > receiptAt ||
      (preparation && run.id !== evidence.run.id && updatedAt >= terminalAt)
    )
      return false;
  }
  return true;
}

export async function persistPreparedFailure({
  operationKey,
  load,
  persist,
  error,
  phase,
  generationRequest,
  isRequestAncestor,
}) {
  if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Prepared failure key is invalid.");
  const state = await load();
  let operation = state.operations.find(
    (operation) => operation.key === operationKey,
  );
  if (generationRequest) {
    if (
      isRequestAncestor?.(generationRequest.sourceSha, state.local.revision) !==
      true
    )
      return { persisted: false, incident: false };
    const requested = generationRequestOperation(state, generationRequest);
    if (!requested || requested.key !== operationKey)
      return { persisted: false, incident: false };
    const recovery = generationRequestPublisherRecovery(
      state,
      generationRequest,
    );
    if (
      recovery &&
      isDeepStrictEqual(
        { ...recovery, nextEligibleAt: requested.nextEligibleAt },
        requested,
      )
    )
      operation = requested;
    else if (
      requested.stage !== operation?.stage ||
      requested.expectedSha !== operation.expectedSha
    )
      return { persisted: false, incident: false };
    else if (
      operation?.retry?.failure.kind === "configuration" &&
      ["budget-exhausted", "publisher-authentication-failed"].includes(
        operation.retry.failure.reasonCode,
      ) &&
      requested.stage === operation.stage &&
      requested.expectedSha === operation.expectedSha
    )
      operation = requested;
  }
  if (
    !operation ||
    operation.retry?.failure.kind === "permanent" ||
    (operation.retry &&
      operation.nextEligibleAt !== null &&
      Date.parse(operation.nextEligibleAt) > state.nowMs) ||
    operation.stage === "finalized" ||
    (operation.stage === "deployment-confirmed" && phase !== "finalization") ||
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
