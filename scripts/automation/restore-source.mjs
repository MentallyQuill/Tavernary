import { createHash } from "node:crypto";
import { decodePreparedArtifact } from "./prepared-artifact.mjs";
const sha = /^[a-f0-9]{40}$/u,
  digest = /^[a-f0-9]{64}$/u;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error("Owner restore source provenance or integrity is invalid."),
    { code },
  );
}
export function validateRestoreSource(value) {
  const keys = [
    "schema_version",
    "runId",
    "runAttempt",
    "headSha",
    "ownerActorId",
    "releaseId",
    "sourceSha",
    "buildId",
    "buildDigest",
    "archiveDigest",
    "catalogDigest",
    "targetDigest",
    "baselineSha",
    "reason",
    "dryRun",
  ];
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key)) ||
    value.schema_version !== 1 ||
    ![value.runId, value.runAttempt, value.releaseId].every(
      (n) => Number.isSafeInteger(n) && n > 0,
    ) ||
    value.ownerActorId !== 2625904 ||
    ![value.headSha, value.sourceSha, value.baselineSha].every(
      (s) => typeof s === "string" && sha.test(s),
    ) ||
    !/^run-[1-9]\d*-attempt-[1-9]\d*$/u.test(value.buildId ?? "") ||
    ![value.buildDigest, value.catalogDigest, value.targetDigest].every(
      (s) => typeof s === "string" && digest.test(s),
    ) ||
    !/^sha256:[a-f0-9]{64}$/u.test(value.archiveDigest ?? "") ||
    value.dryRun !== false ||
    typeof value.reason !== "string" ||
    !value.reason.trim() ||
    value.reason.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(value.reason)
  )
    fail();
  return structuredClone(value);
}
export function trustedRestoreRun(
  run,
  { repository, runId, currentMainSha, isAncestor },
) {
  return (
    repository === "MentallyQuill/Tavernary" &&
    Number.isSafeInteger(runId) &&
    runId > 0 &&
    sha.test(currentMainSha ?? "") &&
    run?.id === runId &&
    run.path === ".github/workflows/restore-site.yml" &&
    run.event === "workflow_dispatch" &&
    run.head_branch === "main" &&
    sha.test(run.head_sha ?? "") &&
    (run.head_sha === currentMainSha ||
      isAncestor(run.head_sha, currentMainSha) === true) &&
    run.actor?.id === 2625904 &&
    Number.isSafeInteger(run.repository?.id) &&
    run.repository.id > 0 &&
    run.repository.full_name === repository &&
    run.head_repository?.id === run.repository.id &&
    run.head_repository.full_name === repository &&
    /^Site restore [1-9]\d*$/u.test(run.display_title ?? "") &&
    Number.isSafeInteger(run.run_attempt) &&
    run.run_attempt > 0 &&
    run.status === "completed" &&
    ["success", "failure", "cancelled", "timed_out"].includes(run.conclusion)
  );
}
function parse(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 4 * 1024 * 1024)
    fail();
  return JSON.parse(text);
}
export async function loadGithubRestoreSource({
  gh,
  download,
  repository,
  runId,
  currentMainSha,
  isAncestor,
}) {
  if (
    repository !== "MentallyQuill/Tavernary" ||
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !sha.test(currentMainSha ?? "")
  )
    fail();
  const route = `repos/${repository}`;
  const run = parse(await gh(["api", `${route}/actions/runs/${runId}`]));
  if (
    !trustedRestoreRun(run, { repository, runId, currentMainSha, isAncestor })
  )
    fail();
  const response = parse(
    await gh(["api", `${route}/actions/runs/${runId}/artifacts?per_page=100`]),
  );
  if (
    !Array.isArray(response.artifacts) ||
    response.total_count !== response.artifacts.length ||
    response.artifacts.length > 100
  )
    fail();
  const matching = response.artifacts.filter(
    (artifact) =>
      artifact.name === `site-restore-source-${runId}-${run.run_attempt}`,
  );
  if (!matching.length) fail("provider-unavailable");
  if (matching.length !== 1) fail();
  const artifact = matching[0],
    origin = artifact.workflow_run;
  if (artifact.expired === true) fail("provider-unavailable");
  if (
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 22 ||
    artifact.size_in_bytes > 65536 ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "") ||
    origin?.id !== runId ||
    origin.head_branch !== "main" ||
    origin.head_sha !== run.head_sha ||
    origin.repository_id !== run.repository.id ||
    origin.head_repository_id !== run.repository.id
  )
    fail();
  const archive = await download([
    "api",
    `${route}/actions/artifacts/${artifact.id}/zip`,
  ]);
  if (
    archive.byteLength !== artifact.size_in_bytes ||
    `sha256:${createHash("sha256").update(archive).digest("hex")}` !==
      artifact.digest
  )
    fail();
  const value = validateRestoreSource(
    decodePreparedArtifact({
      archive,
      digest: artifact.digest,
      filename: "restore-source.json",
    }),
  );
  if (
    value.runId !== runId ||
    value.runAttempt !== run.run_attempt ||
    value.headSha !== run.head_sha ||
    run.display_title !== `Site restore ${value.releaseId}` ||
    (value.baselineSha !== currentMainSha &&
      isAncestor(value.baselineSha, currentMainSha) !== true)
  )
    fail();
  return value;
}
