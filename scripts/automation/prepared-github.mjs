import {
  assertTrustedPreparedProducer,
  validatePreparedResult,
} from "./prepared-result.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { decodePreparedArtifact } from "./prepared-artifact.mjs";

export async function loadPreparedGithubArtifact({
  gh,
  repository,
  runId,
  operation,
  publisherActorId,
  allowMissing = false,
}) {
  validateAutomationOperation(operation);
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
      (artifact) => artifact.name === `automation-prepared-${operation.key}`,
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
    artifact.size_in_bytes > 33_554_432 ||
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
