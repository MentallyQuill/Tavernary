import { createHash } from "node:crypto";
import {
  decodePreparedArtifact,
  decodePreparedArtifactBytes,
} from "./prepared-artifact.mjs";
import { decodeSiteBundle } from "./site-bundle.mjs";
import { validateRevisionManifest } from "./revision-manifest.mjs";
const sha = /^[a-f0-9]{40}$/u;
function fail() {
  throw Object.assign(
    new Error("Deployment artifact provenance or integrity is invalid."),
    { code: "validation-failed" },
  );
}
function parse(contents) {
  if (
    typeof contents !== "string" ||
    Buffer.byteLength(contents) > 4 * 1024 * 1024
  )
    fail();
  return JSON.parse(contents);
}
async function loadArtifact({
  gh,
  download,
  repository,
  publisherActorId,
  runId,
  currentMainSha,
  isAncestor,
  expectedSourceSha,
  kind,
}) {
  if (
    repository !== "MentallyQuill/Tavernary" ||
    !Number.isSafeInteger(runId) ||
    runId < 1 ||
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !sha.test(currentMainSha ?? "") ||
    (expectedSourceSha !== undefined && !sha.test(expectedSourceSha))
  )
    fail();
  const route = `repos/${repository}`,
    run = parse(await gh(["api", `${route}/actions/runs/${runId}`]));
  if (
    run.id !== runId ||
    run.path !== ".github/workflows/deploy-pages.yml" ||
    !["push", "workflow_dispatch"].includes(run.event) ||
    run.head_branch !== "main" ||
    !sha.test(run.head_sha ?? "") ||
    !Number.isSafeInteger(run.repository?.id) ||
    run.repository.id < 1 ||
    run.repository.full_name !== repository ||
    run.head_repository?.id !== run.repository.id ||
    run.head_repository.full_name !== repository ||
    !Number.isSafeInteger(run.actor?.id) ||
    run.actor.id < 1 ||
    (run.event === "workflow_dispatch" &&
      ![2625904, publisherActorId].includes(run.actor.id)) ||
    run.status !== "completed" ||
    !["success", "failure", "cancelled", "timed_out"].includes(
      run.conclusion,
    ) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    (run.head_sha !== currentMainSha &&
      isAncestor(run.head_sha, currentMainSha) !== true)
  )
    fail();
  const pages = parse(
    await gh([
      "api",
      "--paginate",
      "--slurp",
      `${route}/actions/runs/${runId}/artifacts?per_page=100`,
    ]),
  );
  if (
    !Array.isArray(pages) ||
    pages.length > 10 ||
    pages.some((page) => !Array.isArray(page.artifacts))
  )
    fail();
  const prefixes = {
    revision: "site-revision-",
    confirmation: "site-confirmation-",
    bundle: "site-bundle-",
  };
  const prefix = prefixes[kind];
  const candidates = pages
    .flatMap((page) => page.artifacts)
    .filter(
      (artifact) =>
        typeof artifact.name === "string" &&
        artifact.name.startsWith(prefix) &&
        (expectedSourceSha === undefined ||
          artifact.name === `${prefix}${expectedSourceSha}`),
    );
  if (candidates.length === 0)
    throw Object.assign(
      new Error("Validated deployment metadata is not available."),
      { code: "provider-unavailable" },
    );
  if (candidates.length !== 1) fail();
  const artifact = candidates[0],
    sourceSha = artifact.name.slice(prefix.length),
    origin = artifact.workflow_run;
  if (artifact.expired === true)
    throw Object.assign(new Error("Validated deployment metadata expired."), {
      code: "provider-unavailable",
    });
  if (
    !sha.test(sourceSha) ||
    artifact.expired !== false ||
    !Number.isSafeInteger(artifact.id) ||
    artifact.id < 1 ||
    !Number.isSafeInteger(artifact.size_in_bytes) ||
    artifact.size_in_bytes < 22 ||
    artifact.size_in_bytes >
      (kind === "bundle"
        ? 134_217_728
        : kind === "revision"
          ? 16_777_216
          : 65_536) ||
    !/^sha256:[a-f0-9]{64}$/u.test(artifact.digest ?? "") ||
    origin?.id !== runId ||
    origin.repository_id !== run.repository.id ||
    origin.head_repository_id !== run.repository.id ||
    origin.head_branch !== "main" ||
    origin.head_sha !== run.head_sha ||
    run.display_title !== `Site: Deploy ${sourceSha}` ||
    (sourceSha !== run.head_sha && isAncestor(sourceSha, run.head_sha) !== true)
  )
    fail();
  const archive = await download([
    "api",
    `${route}/actions/artifacts/${artifact.id}/zip`,
  ]);
  const value = (
    kind === "bundle" ? decodePreparedArtifactBytes : decodePreparedArtifact
  )({
    archive,
    digest: artifact.digest,
    filename:
      kind === "bundle"
        ? "site-bundle.tsb.gz"
        : kind === "revision"
          ? "revision.json"
          : "confirmation.json",
  });
  return { runId, runAttempt: run.run_attempt, sourceSha, value };
}
export async function loadGithubRevisionManifest(input) {
  const { runId, runAttempt, sourceSha, value } = await loadArtifact({
    ...input,
    kind: "revision",
  });
  const manifest = validateRevisionManifest(value);
  if (
    manifest.sourceSha !== sourceSha ||
    manifest.buildId !== `run-${runId}-attempt-${runAttempt}`
  )
    fail();
  return { runId, manifest };
}
export async function loadGithubSiteBundle(input) {
  const { runId, runAttempt, sourceSha, value } = await loadArtifact({
    ...input,
    kind: "bundle",
  });
  const bundle = decodeSiteBundle({
    archive: value,
    archiveDigest: `sha256:${createHash("sha256").update(value).digest("hex")}`,
  });
  if (
    bundle.manifest.sourceSha !== sourceSha ||
    bundle.manifest.buildId !== `run-${runId}-attempt-${runAttempt}`
  )
    fail();
  return { runId, bundle, archive: value };
}
