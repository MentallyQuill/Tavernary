import { classifyAutomationFailure } from "../automation/failure.mjs";
import { planAutomationRetry } from "../automation/retry.mjs";

export const PROJECT_VALIDATION_RETRY_LIMIT = 3;
export const PROJECT_VALIDATION_REGENERATION_GRACE_MS = 15 * 60_000;
export const PROJECT_VALIDATION_OWNED_LABELS = [
  "submission-validation-retrying",
  "submission-validation-blocked",
];
export const PROJECT_VALIDATION_STATE_MARKER =
  "<!-- tavernary-project-validation-state";

const TERMINAL_CONCLUSIONS = new Set([
  "success",
  "failure",
  "cancelled",
  "skipped",
  "timed_out",
  "action_required",
  "neutral",
  "stale",
]);
const ACTIVE_STATUSES = new Set([
  "queued",
  "in_progress",
  "pending",
  "requested",
  "waiting",
]);

function timestamp(run) {
  const value = run?.updated_at ?? run?.created_at;
  const milliseconds = Date.parse(value ?? "");
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function createdAt(run) {
  const milliseconds = Date.parse(run?.created_at ?? "");
  return Number.isFinite(milliseconds) ? milliseconds : 0;
}

function currentHeadRuns(runs, headSha) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.head_sha === headSha)
    .sort((left, right) => createdAt(right) - createdAt(left));
}

function activeRun(runs) {
  return runs.find(
    (run) =>
      ACTIVE_STATUSES.has(run?.status) ||
      !TERMINAL_CONCLUSIONS.has(run?.conclusion),
  );
}

function runFailure(run) {
  return classifyAutomationFailure({
    ...run?.failure,
    conclusion: run?.conclusion,
  });
}

function completedFailureAttempts(runs, kinds = ["unknown", "permanent"]) {
  return runs.reduce((attempts, run) => {
    const runAttempt =
      Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0
        ? run.run_attempt
        : 1;
    if (
      ACTIVE_STATUSES.has(run?.status) ||
      !TERMINAL_CONCLUSIONS.has(run?.conclusion)
    ) {
      return attempts;
    }
    return run.conclusion !== "success" && kinds.includes(runFailure(run).kind)
      ? attempts + runAttempt
      : attempts;
  }, 0);
}

function totalAttempts(runs) {
  return runs.reduce(
    (attempts, run) =>
      attempts +
      (Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0
        ? run.run_attempt
        : 1),
    0,
  );
}

function action(actionName, state, attempts, run, extra = {}) {
  return { action: actionName, state, attempts, run, ...extra };
}

function afterGrace(nowMs, run, graceMs) {
  return nowMs - timestamp(run) >= graceMs;
}

function recovery(
  input,
  runs,
  run,
  actionName,
  state,
  extra = {},
  forceProbe = false,
) {
  const failure = runFailure(run);
  const attempts = completedFailureAttempts(runs);
  const anchor = timestamp(run);
  const saved = input.retryState;
  const savedMatches =
    saved?.headSha === input.headSha &&
    saved.runId === run.id &&
    saved.runAttempt === (run.run_attempt ?? 1) &&
    saved.state === state &&
    saved.reasonCode === failure.reasonCode;
  const retry = planAutomationRetry({
    failure,
    transientAttempts: Math.max(
      0,
      completedFailureAttempts(runs, ["transient", "unknown"]) - 1,
    ),
    immediateAttempts: forceProbe
      ? PROJECT_VALIDATION_RETRY_LIMIT
      : completedFailureAttempts(runs, ["unknown"]),
    nowMs: anchor || input.nowMs,
    retryAfterMs: run.retryAfterMs,
    jitterSeed: `${input.headSha}:${state}:${run.id}:${run.run_attempt ?? 1}`,
  });
  // A missing terminal timestamp must not move the deadline on every poll.
  if (
    !anchor &&
    savedMatches &&
    Number.isFinite(Date.parse(saved.nextEligibleAt))
  ) {
    retry.nextEligibleAt = saved.nextEligibleAt;
  }
  const due = Date.parse(retry.nextEligibleAt);
  const selectedAction =
    retry.action === "stop"
      ? "block"
      : Number.isFinite(due) && due <= input.nowMs
        ? actionName
        : "wait";
  return action(
    selectedAction,
    selectedAction === "block"
      ? state.replace("retrying-", "") + "-blocked"
      : state,
    attempts,
    run,
    { ...extra, failure, retry },
  );
}

export function planProjectValidationReconciliation(input) {
  const transaction = input?.transaction;
  const headSha = input?.headSha;
  if (
    transaction?.schema_version !== 2 ||
    transaction.publication_mode !== "automatic" ||
    transaction.generated_head_sha !== headSha
  ) {
    return { action: "ignore" };
  }

  const nowMs = Number.isFinite(input?.nowMs) ? input.nowMs : Date.now();
  const recoveryInput = { ...input, nowMs };
  const validations = currentHeadRuns(input?.validationRuns, headSha);
  const activeValidation = activeRun(validations);
  const validationFailures = completedFailureAttempts(validations);
  const latestValidation = validations[0];

  if (!latestValidation) {
    return action("validate", "validating", 0, null);
  }
  if (activeValidation) {
    return action("wait", "validating", validationFailures, activeValidation);
  }
  if (latestValidation.conclusion !== "success") {
    return recovery(
      recoveryInput,
      validations,
      latestValidation,
      "retry-validation",
      "retrying-validation",
    );
  }

  const publications = currentHeadRuns(input?.publicationRuns, headSha);
  const activePublication = activeRun(publications);
  const publicationFailures = completedFailureAttempts(publications);
  const latestPublication = publications[0];
  const generations = currentHeadRuns(input?.generationRuns, headSha);
  const activeGeneration = activeRun(generations);
  const generationFailures = completedFailureAttempts(generations);
  const latestGeneration = generations[0];
  const generationIsLatestRecoveryAttempt =
    Boolean(latestGeneration) &&
    (!latestPublication ||
      createdAt(latestGeneration) >= createdAt(latestPublication));

  if (activePublication) {
    return action("wait", "publishing", publicationFailures, activePublication);
  }
  if (activeGeneration && generationIsLatestRecoveryAttempt) {
    return action("wait", "regenerating", generationFailures, activeGeneration);
  }
  if (
    generationIsLatestRecoveryAttempt &&
    latestGeneration.conclusion !== "success"
  ) {
    return recovery(
      recoveryInput,
      generations,
      latestGeneration,
      "regenerate",
      "retrying-regeneration",
      { validationRunId: latestValidation.id },
    );
  }
  if (
    generationIsLatestRecoveryAttempt &&
    latestGeneration.conclusion === "success"
  ) {
    const generationAttempts = totalAttempts(generations);
    if (
      !afterGrace(
        nowMs,
        latestGeneration,
        PROJECT_VALIDATION_REGENERATION_GRACE_MS,
      )
    ) {
      return action(
        "wait",
        "regenerating",
        generationAttempts,
        latestGeneration,
      );
    }
    return recovery(
      recoveryInput,
      generations,
      { ...latestGeneration, conclusion: "failure" },
      "regenerate",
      "retrying-regeneration",
      { attempts: generationAttempts, validationRunId: latestValidation.id },
      true,
    );
  }
  if (!latestPublication) {
    return action("publish", "publishing", 1, latestValidation);
  }
  if (latestPublication.conclusion !== "success") {
    return recovery(
      recoveryInput,
      publications,
      latestPublication,
      "retry-publication",
      "retrying-publication",
      { validationRunId: latestValidation.id },
    );
  }
  if (
    afterGrace(
      nowMs,
      latestPublication,
      PROJECT_VALIDATION_REGENERATION_GRACE_MS,
    ) &&
    afterGrace(nowMs, input?.pull, PROJECT_VALIDATION_REGENERATION_GRACE_MS)
  ) {
    return action("regenerate", "regenerating", 1, latestPublication, {
      validationRunId: latestValidation.id,
    });
  }
  return action("wait", "published", 1, latestPublication);
}

function humanText(state, run) {
  const runLink = run?.html_url
    ? ` [View the exact GitHub Actions run.](${run.html_url})`
    : "";
  const messages = {
    validating: "Tavernary is validating this exact generated head.",
    "retrying-validation":
      "Tavernary will resume validation when its recovery delay ends.",
    "validation-blocked":
      "Validation found a permanent input or policy failure that requires correction.",
    handoff:
      "Validation passed; Tavernary is waiting for the normal Publisher handoff.",
    "publication-queued":
      "Validation passed; Tavernary queued this transaction behind the active Publisher run.",
    publishing: "Tavernary is publishing this validated transaction.",
    "retrying-publication":
      "Tavernary will resume publication when its recovery delay ends.",
    "publication-blocked":
      "Publication found a permanent input or policy failure that requires correction.",
    regenerating: "Tavernary will regenerate this stale automatic transaction.",
    "retrying-regeneration":
      "Tavernary will resume regeneration when its recovery delay ends.",
    "regeneration-blocked":
      "Regeneration attempts are exhausted and require intervention.",
    published:
      "Publisher completed; Tavernary is waiting for the issue lifecycle to close.",
  };
  return `${messages[state] ?? "Tavernary is reconciling this transaction."}${runLink}`;
}

export function projectValidationStateComment({
  state,
  headSha,
  attempts,
  run,
  failure,
  retry,
}) {
  const marker = {
    schema_version: 1,
    status: state,
    head_sha: headSha,
    attempts,
    run_id: run?.id ?? null,
    ...(retry
      ? {
          schema_version: 2,
          run_attempt: run?.run_attempt ?? 1,
          failure_kind: failure.kind,
          reason_code: retry.reasonCode,
          retry_action: retry.action,
          next_eligible_at: retry.nextEligibleAt,
          incident: retry.incident === true,
        }
      : {}),
  };
  const timing = retry?.nextEligibleAt
    ? ` Next eligible: ${retry.nextEligibleAt}.`
    : "";
  const incident = retry?.incident
    ? " Repeated unknown or configuration failures require investigation; bounded probes continue."
    : "";
  return `${PROJECT_VALIDATION_STATE_MARKER}\n${JSON.stringify(marker)}\n-->\n${humanText(state, run)}${timing}${incident}`;
}

const SAFE_REASON_CODES = new Set([
  "authorization-lost",
  "validation-failed",
  "input-superseded",
  "provider-authentication-failed",
  "publisher-authentication-failed",
  "provider-configuration-invalid",
  "provider-model-mismatch",
  "budget-exhausted",
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
  "authentication-unavailable",
  "provider-unavailable",
  "workflow-skipped",
  "workflow-timeout",
  "workflow-cancelled",
  "unclassified-failure",
  "invalid-retry-clock",
  "invalid-retry-state",
]);

export function parseProjectValidationRetryState(body) {
  if (
    typeof body !== "string" ||
    body.split(PROJECT_VALIDATION_STATE_MARKER).length !== 2
  )
    return null;
  try {
    const marker = JSON.parse(
      body.split(PROJECT_VALIDATION_STATE_MARKER)[1].split("-->")[0].trim(),
    );
    if (
      marker.schema_version !== 2 ||
      !/^[a-f0-9]{40}$/u.test(marker.head_sha) ||
      !Number.isSafeInteger(marker.run_id) ||
      marker.run_id < 1 ||
      !Number.isSafeInteger(marker.run_attempt) ||
      marker.run_attempt < 1 ||
      ![
        "retrying-validation",
        "retrying-publication",
        "retrying-regeneration",
      ].includes(marker.status) ||
      !SAFE_REASON_CODES.has(marker.reason_code) ||
      typeof marker.next_eligible_at !== "string" ||
      !Number.isFinite(Date.parse(marker.next_eligible_at)) ||
      new Date(marker.next_eligible_at).toISOString() !==
        marker.next_eligible_at
    )
      return null;
    return {
      headSha: marker.head_sha,
      runId: marker.run_id,
      runAttempt: marker.run_attempt,
      state: marker.status,
      reasonCode: marker.reason_code,
      nextEligibleAt: marker.next_eligible_at,
    };
  } catch {
    return null;
  }
}
