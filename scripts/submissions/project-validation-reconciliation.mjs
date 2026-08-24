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

function currentHeadRuns(runs, headSha) {
  return (Array.isArray(runs) ? runs : [])
    .filter((run) => run?.head_sha === headSha)
    .sort((left, right) => timestamp(right) - timestamp(left));
}

function activeRun(runs) {
  return runs.find(
    (run) =>
      ACTIVE_STATUSES.has(run?.status) ||
      !TERMINAL_CONCLUSIONS.has(run?.conclusion),
  );
}

function failedRuns(runs) {
  return runs.filter(
    (run) =>
      TERMINAL_CONCLUSIONS.has(run?.conclusion) && run.conclusion !== "success",
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
  const validationFailures = failedRuns(validations);
  const latestValidation = validations[0];

  if (!latestValidation) {
    return action("validate", "validating", 0, null);
  }
  if (activeValidation) {
    return action(
      "wait",
      "validating",
      validationFailures.length,
      activeValidation,
    );
  }
  if (latestValidation.conclusion !== "success") {
    if (validationFailures.length >= PROJECT_VALIDATION_RETRY_LIMIT) {
      return action(
        "block",
        "validation-blocked",
        validationFailures.length,
        latestValidation,
      );
    }
    return action(
      "retry-validation",
      "retrying-validation",
      validationFailures.length,
      latestValidation,
    );
  }

  const publications = currentHeadRuns(input?.publicationRuns, headSha);
  const activePublication = activeRun(publications);
  const publicationFailures = failedRuns(publications);
  const latestPublication = publications[0];

  if (activePublication) {
    return action(
      "wait",
      "publishing",
      publicationFailures.length,
      activePublication,
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
    if (publicationFailures.length >= PROJECT_VALIDATION_RETRY_LIMIT) {
      return action(
        "block",
        "publication-blocked",
        publicationFailures.length,
        latestPublication,
      );
    }
    return action(
      "retry-publication",
      "retrying-publication",
      publicationFailures.length,
      latestPublication,
    );
  }
  if (
    afterGrace(
      nowMs,
      latestPublication,
      PROJECT_VALIDATION_REGENERATION_GRACE_MS,
    )
  ) {
    return action("regenerate", "regenerating", 1, latestPublication);
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
