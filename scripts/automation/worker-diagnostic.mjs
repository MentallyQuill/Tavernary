import { decodePreparedArtifact } from "./prepared-artifact.mjs";
import { loadGithubRunArtifacts } from "./github-inventory.mjs";
import { AUTOMATION_FAILURE_REASON_KINDS } from "./failure.mjs";

export function trustedWorkerDiagnosticRun({
  run,
  repository,
  operationKey,
  publisherActorId,
}) {
  return (
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "") &&
    /^[a-f0-9]{64}$/u.test(operationKey ?? "") &&
    Number.isSafeInteger(publisherActorId) &&
    publisherActorId > 0 &&
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    run.path === ".github/workflows/automation-worker.yml" &&
    run.event === "workflow_dispatch" &&
    run.head_branch === "main" &&
    run.head_repository?.full_name === repository &&
    Number.isSafeInteger(run.repository?.id) &&
    run.repository.id > 0 &&
    run.repository.full_name === repository &&
    run.head_repository.id === run.repository.id &&
    /^[a-f0-9]{40}$/u.test(run.head_sha ?? "") &&
    run.display_title === `Automation ${operationKey}` &&
    run.actor?.id === publisherActorId &&
    run.actor.type === "Bot" &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt > 0 &&
    run.status === "completed" &&
    run.conclusion === "failure"
  );
}
function safeFailure(failure) {
  return (
    failure &&
    typeof failure === "object" &&
    Object.keys(failure).sort().join(",") === "kind,reasonCode" &&
    Object.hasOwn(AUTOMATION_FAILURE_REASON_KINDS, failure.reasonCode) &&
    AUTOMATION_FAILURE_REASON_KINDS[failure.reasonCode] === failure.kind
  );
}
export function validatedWorkerDiagnosticFailure(input) {
  const { run, operationKey } = input;
  const value = run.automationDiagnostic;
  if (
    !trustedWorkerDiagnosticRun(input) ||
    !value ||
    Object.keys(value).sort().join(",") !==
      "failure,operation_key,runAttempt,runId,schema_version,sourceSha" ||
    value.schema_version !== 1 ||
    value.operation_key !== operationKey ||
    value.runId !== run.id ||
    value.runAttempt !== run.run_attempt ||
    value.sourceSha !== run.head_sha ||
    !safeFailure(value.failure)
  )
    return null;
  return value.failure;
}
function invalid() {
  return Object.assign(new Error("Worker diagnostic is invalid."), {
    code: "worker-diagnostic-invalid",
  });
}
export async function loadWorkerGithubDiagnostic(input) {
  const { run, repository, operationKey } = input;
  if (!trustedWorkerDiagnosticRun(input)) throw invalid();
  const artifacts = await loadGithubRunArtifacts({
    gh: input.gh,
    repository,
    runId: run.id,
  });
  const matches = artifacts.filter(
    (artifact) => artifact.name === `automation-diagnostic-${run.id}`,
  );
  if (!matches.length) return null;
  if (matches.length !== 1) throw invalid();
  const artifact = matches[0];
  const origin = artifact.workflow_run;
  const attemptStart = Date.parse(
    run.run_started_at ?? (run.run_attempt === 1 ? run.created_at : ""),
  );
  const created = Date.parse(artifact.created_at ?? "");
  const terminal = Date.parse(run.updated_at ?? "");
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes > 16_384 ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "") ||
    origin?.id !== run.id ||
    origin.repository_id !== run.repository.id ||
    origin.head_repository_id !== run.repository.id ||
    origin.head_branch !== "main" ||
    origin.head_sha !== run.head_sha ||
    !Number.isFinite(attemptStart) ||
    !Number.isFinite(created) ||
    !Number.isFinite(terminal) ||
    created < attemptStart ||
    created > terminal
  )
    throw invalid();
  const archive = await input.download([
    "api",
    `repos/${repository}/actions/artifacts/${artifact.id}/zip`,
  ]);
  let value;
  try {
    value = decodePreparedArtifact({
      archive,
      digest: artifact.digest,
      filename: "automation-diagnostic.json",
    });
  } catch {
    throw invalid();
  }
  if (
    Object.keys(value).sort().join(",") !==
      "failure,operation_key,schema_version" ||
    value.schema_version !== 1 ||
    value.operation_key !== operationKey ||
    !safeFailure(value.failure)
  )
    throw invalid();
  return {
    ...value,
    runId: run.id,
    runAttempt: run.run_attempt,
    sourceSha: run.head_sha,
  };
}
