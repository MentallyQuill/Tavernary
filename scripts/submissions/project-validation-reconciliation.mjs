export const PROJECT_VALIDATION_RETRY_LIMIT = 3;
export const PROJECT_VALIDATION_HANDOFF_GRACE_MS = 5 * 60_000;
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

function completedFailureAttempts(runs) {
  return runs.reduce((attempts, run) => {
    const runAttempt =
      Number.isSafeInteger(run?.run_attempt) && run.run_attempt > 0
        ? run.run_attempt
        : 1;
    if (
      ACTIVE_STATUSES.has(run?.status) ||
      !TERMINAL_CONCLUSIONS.has(run?.conclusion)
    ) {
      return attempts + Math.max(0, runAttempt - 1);
    }
    return run.conclusion === "success" ? attempts : attempts + runAttempt;
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
    if (validationFailures >= PROJECT_VALIDATION_RETRY_LIMIT) {
      return action(
        "block",
        "validation-blocked",
        validationFailures,
        latestValidation,
      );
    }
    return action(
      "retry-validation",
      "retrying-validation",
      validationFailures,
      latestValidation,
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
    if (generationFailures >= PROJECT_VALIDATION_RETRY_LIMIT) {
      return action(
        "block",
        "regeneration-blocked",
        generationFailures,
        latestGeneration,
      );
    }
    return action(
      "regenerate",
      "retrying-regeneration",
      generationFailures,
      latestGeneration,
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
    return action(
      "block",
      "regeneration-blocked",
      generationAttempts,
      latestGeneration,
    );
  }
  if (!latestPublication) {
    if (
      !afterGrace(nowMs, latestValidation, PROJECT_VALIDATION_HANDOFF_GRACE_MS)
    ) {
      return action("wait", "handoff", 1, latestValidation);
    }
    return action("publish", "publishing", 1, latestValidation);
  }
  if (latestPublication.conclusion !== "success") {
    if (publicationFailures >= PROJECT_VALIDATION_RETRY_LIMIT) {
      return action(
        "block",
        "publication-blocked",
        publicationFailures,
        latestPublication,
      );
    }
    return action(
      "retry-publication",
      "retrying-publication",
      publicationFailures,
      latestPublication,
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

function humanText(state, attempts, run) {
  const runLink = run?.html_url
    ? ` [View the exact GitHub Actions run.](${run.html_url})`
    : "";
  const messages = {
    validating: "Tavernary is validating this exact generated head.",
    "retrying-validation": `Tavernary will retry validation (attempt ${attempts} of ${PROJECT_VALIDATION_RETRY_LIMIT}).`,
    "validation-blocked":
      "Validation attempts are exhausted and require intervention.",
    handoff:
      "Validation passed; Tavernary is waiting for the normal Publisher handoff.",
    publishing: "Tavernary is publishing this validated transaction.",
    "retrying-publication": `Tavernary will retry publication (attempt ${attempts} of ${PROJECT_VALIDATION_RETRY_LIMIT}).`,
    "publication-blocked":
      "Publication attempts are exhausted and require intervention.",
    regenerating: "Tavernary will regenerate this stale automatic transaction.",
    "retrying-regeneration": `Tavernary will retry regeneration (attempt ${attempts} of ${PROJECT_VALIDATION_RETRY_LIMIT}).`,
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
}) {
  const marker = {
    schema_version: 1,
    status: state,
    head_sha: headSha,
    attempts,
    run_id: run?.id ?? null,
  };
  return `${PROJECT_VALIDATION_STATE_MARKER}\n${JSON.stringify(marker)}\n-->\n${humanText(state, attempts, run)}`;
}
