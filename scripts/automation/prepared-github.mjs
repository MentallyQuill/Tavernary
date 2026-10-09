import {
  assertTrustedPreparedProducer,
  assertTrustedPreparationOrigin,
  validatePreparedResult,
} from "./prepared-result.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { decodePreparedArtifact } from "./prepared-artifact.mjs";
import { loadGithubRunArtifacts } from "./github-inventory.mjs";
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
  const generation = ["generation-usage", "generation-checkpoint"].includes(
    artifactKind,
  );
  const generationTitle = new RegExp(
    `^Automation prepare ${operation?.key}(?: request[1-9]\\d*)?$`,
    "u",
  );
  if (generation) {
    if (
      !/^[a-f0-9]{64}$/u.test(operation?.key ?? "") ||
      !["project", "owner-request"].includes(operation?.identity?.kind) ||
      (artifactKind === "generation-checkpoint" &&
        operation.identity.kind !== "owner-request")
    )
      throw new Error("Generation artifact context is invalid.");
  } else validateAutomationOperation(operation);
  if (
    ![
      "result",
      "diagnostic",
      "generation-usage",
      "generation-checkpoint",
    ].includes(artifactKind)
  )
    throw new Error("Prepared artifact kind is invalid.");
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) ||
    !Number.isSafeInteger(runId) ||
    runId < 1
  )
    throw new Error("Prepared artifact context is invalid.");
  const root = `repos/${repository}`;
  const run = JSON.parse(await gh(["api", `${root}/actions/runs/${runId}`]));
  if (generation && run.status !== "completed") {
    assertTrustedPreparationOrigin({
      kind: operation.identity.kind,
      repository,
      run,
      publisherActorId,
    });
    if (
      run.id !== runId ||
      run.run_attempt !== 1 ||
      !generationTitle.test(run.display_title ?? "")
    )
      throw new Error("Generation usage producer is invalid.");
    return null;
  }
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
  if (
    generation &&
    (!["project", "owner-request"].includes(operation.identity.kind) ||
      run.run_attempt !== 1 ||
      !generationTitle.test(run.display_title ?? ""))
  )
    throw new Error("Generation usage producer is invalid.");
  const artifacts = await loadGithubRunArtifacts({ gh, repository, runId });
  const matches = artifacts.filter(
    (artifact) =>
      artifact.name ===
      (artifactKind === "result"
        ? `automation-prepared-${operation.key}`
        : artifactKind === "generation-usage"
          ? `automation-generation-${operation.key}-${runId}`
          : artifactKind === "generation-checkpoint"
            ? `automation-generation-checkpoint-${operation.key}-${runId}`
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
      (artifactKind === "result"
        ? 33_554_432
        : artifactKind === "generation-checkpoint"
          ? 262_144
          : 16_384) ||
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
