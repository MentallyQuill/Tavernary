import {
  assertTrustedPreparedProducer,
  validatePreparedResult,
} from "./prepared-result.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { decodePreparedArtifact } from "./prepared-artifact.mjs";
import {
  AUTOMATION_FAILURE_REASON_KINDS,
  classifyAutomationFailure,
} from "./failure.mjs";

export async function loadPreparedGithubArtifact({
  gh,
  repository,
  runId,
  operation,
  publisherActorId,
  allowMissing = false,
  artifactKind = "result",
}) {
  validateAutomationOperation(operation);
  if (!["result", "diagnostic"].includes(artifactKind))
    throw new Error("Prepared artifact kind is invalid.");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !Number.isSafeInteger(runId) ||
    runId < 1
  )
    throw new Error("Prepared artifact context is invalid.");
  const root = `repos/${repository}`;
  const run = JSON.parse(await gh(["api", `${root}/actions/runs/${runId}`]));
  assertTrustedPreparedProducer({
    kind: operation.identity.kind,
    repository,
    run,
    publisherActorId,
    requireSuccess: artifactKind === "result",
  });
  if (
    run.id !== runId ||
    !Number.isSafeInteger(run.repository?.id) ||
    run.repository.id < 1 ||
    run.head_repository?.id !== run.repository.id
  )
    throw new Error("Prepared run origin is invalid.");
  const pages = JSON.parse(
    await gh([
      "api",
      "--paginate",
      "--slurp",
      "--method",
      "GET",
      `${root}/actions/runs/${runId}/artifacts`,
      "-f",
      "per_page=100",
    ]),
  );
  if (
    !Array.isArray(pages) ||
    pages.some(
      (page) =>
        !Array.isArray(page.artifacts) ||
        !Number.isSafeInteger(page.total_count),
    )
  )
    throw new Error("Prepared artifact inventory is invalid.");
  const matches = pages
    .flatMap((page) => page.artifacts)
    .filter(
      (artifact) =>
        artifact.name ===
        (artifactKind === "result"
          ? `automation-prepared-${operation.key}`
          : `automation-failure-${operation.key}-${runId}`),
    );
  if (!matches.length && allowMissing) return null;
  if (matches.length !== 1)
    throw new Error("Prepared artifact is missing or ambiguous.");
  const artifact = matches[0];
  const origin = artifact.workflow_run;
  if (
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 1 ||
    artifact.size_in_bytes >
      (artifactKind === "diagnostic" ? 16_384 : 33_554_432) ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "") ||
    origin?.id !== runId ||
    origin.repository_id !== run.repository.id ||
    origin.head_repository_id !== run.repository.id ||
    origin.head_branch !== "main" ||
    origin.head_sha !== run.head_sha
  )
    throw new Error("Prepared artifact origin or integrity is invalid.");
  return { run, artifact };
}
export async function loadPreparedGithubResult({
  gh,
  download,
  repository,
  runId,
  operation,
  currentState,
  publisherActorId,
}) {
  const { run, artifact } = await loadPreparedGithubArtifact({
    gh,
    repository,
    runId,
    operation,
    publisherActorId,
  });
  const archive = await download([
    "api",
    `repos/${repository}/actions/artifacts/${artifact.id}/zip`,
  ]);
  return validatePreparedResult(
    decodePreparedArtifact({ archive, digest: artifact.digest }),
    { operation, run, currentState, publisherActorId },
  );
}

export async function loadPreparedGithubDiagnostic(input) {
  const context = await loadPreparedGithubArtifact({
    ...input,
    artifactKind: "diagnostic",
    allowMissing: true,
  });
  if (!context) {
    const run = JSON.parse(
      await input.gh([
        "api",
        `repos/${input.repository}/actions/runs/${input.runId}`,
      ]),
    );
    assertTrustedPreparedProducer({
      kind: input.operation.identity.kind,
      repository: input.repository,
      run,
      publisherActorId: input.publisherActorId,
      requireSuccess: false,
    });
    if (run.id !== input.runId) throw new Error("Diagnostic run changed.");
    return classifyAutomationFailure({ conclusion: run.conclusion });
  }
  const archive = await input.download([
    "api",
    `repos/${input.repository}/actions/artifacts/${context.artifact.id}/zip`,
  ]);
  const value = decodePreparedArtifact({
    archive,
    digest: context.artifact.digest,
    filename: "diagnostic.json",
  });
  if (
    value.schema_version !== 1 ||
    value.operation_key !== input.operation.key ||
    Object.keys(value).sort().join(",") !==
      "failure,operation_key,schema_version" ||
    !value.failure ||
    Object.keys(value.failure).sort().join(",") !== "kind,reasonCode" ||
    !Object.hasOwn(AUTOMATION_FAILURE_REASON_KINDS, value.failure.reasonCode) ||
    AUTOMATION_FAILURE_REASON_KINDS[value.failure.reasonCode] !==
      value.failure.kind
  )
    throw Object.assign(new Error("Prepared diagnostic is invalid."), {
      code: "prepared-diagnostic-invalid",
    });
  return value.failure;
}
