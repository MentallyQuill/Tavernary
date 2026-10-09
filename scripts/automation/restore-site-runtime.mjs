import { execFileSync } from "node:child_process";
import { readFile, writeFile, appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  loadRetainedGithubSiteBundle,
  downloadSiteGithubBytes,
} from "./site-bundle-github.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { readRollbackCanonicalData } from "./rollback-canonical.mjs";
import { planRollback } from "./rollback.mjs";
import { restoreSiteBundle, validateSiteBundle } from "./site-bundle.mjs";
import { readLatestPublishableRevision } from "./deployment-gate.mjs";
import { validateRestoreSource } from "./restore-source.mjs";
const repositoryName = "MentallyQuill/Tavernary",
  sha = /^[a-f0-9]{40}$/u;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error("Trusted site restore context or current main is invalid."),
    { code },
  );
}
export async function runGithubSiteRestore({
  root = process.cwd(),
  env = process.env,
  inputs,
  outputDirectory = resolve(root, "out"),
  gh = executeGh,
  download = downloadSiteGithubBytes,
  git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 30000,
      maxBuffer: 1048576,
      windowsHide: true,
    }).trim(),
  readCurrent = () => readRollbackCanonicalData({ root }),
  loadBundle = (input) =>
    loadRetainedGithubSiteBundle({ ...input, gh, download }),
  nowMs = Date.now(),
  expectedSourceSha,
  expectedBuildId,
  latestPublishable = readLatestPublishableRevision,
}) {
  if (
    env.GITHUB_REPOSITORY !== repositoryName ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR_ID !== "2625904" ||
    env.GITHUB_WORKFLOW_REF !==
      `${repositoryName}/.github/workflows/restore-site.yml@refs/heads/main`
  )
    fail();
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    releaseId = Number(inputs?.release_id),
    dryRun = inputs?.dry_run ?? true;
  if (
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !Number.isSafeInteger(releaseId) ||
    releaseId < 1 ||
    ![true, false, "true", "false"].includes(dryRun) ||
    (typeof inputs?.release_id !== "number" &&
      !/^[1-9]\d*$/u.test(inputs?.release_id ?? ""))
  )
    fail();
  const currentMainSha = git(["rev-parse", "HEAD"]);
  if (
    !sha.test(currentMainSha) ||
    currentMainSha !== git(["rev-parse", "origin/main"])
  )
    fail("input-superseded");
  const isAncestor = (a, b) => {
    if (a === b) return true;
    try {
      git(["merge-base", "--is-ancestor", a, b]);
      return true;
    } catch (error) {
      return error.status === 1 ? false : null;
    }
  };
  const loaded = await loadBundle({
    repository: repositoryName,
    publisherActorId,
    releaseId,
    currentMainSha,
    nowMs,
    isAncestor,
  });
  if (loaded.releaseId !== releaseId) fail();
  const target = validateSiteBundle(loaded.bundle);
  if (
    (expectedSourceSha !== undefined &&
      expectedSourceSha !== target.manifest.sourceSha) ||
    (expectedBuildId !== undefined &&
      expectedBuildId !== target.manifest.buildId)
  )
    fail();
  const current = await readCurrent();
  if (
    git(["rev-parse", "HEAD"]) !== currentMainSha ||
    git(["rev-parse", "origin/main"]) !== currentMainSha
  )
    fail("input-superseded");
  const decision = planRollback({
    target,
    currentCatalogDigest: current.catalogDigest,
    currentTargetsDigest: current.targetDigest,
    ownerTombstones: current.ownerTombstones,
    authorizedReason: inputs.reason,
  });
  if (decision.action !== "deploy")
    return { status: "rejected", action: "reject", releaseId, decision };
  const baselineSha = latestPublishable({ root, revision: currentMainSha });
  if (!sha.test(baselineSha)) fail();
  await restoreSiteBundle({ verified: target, outputDirectory });
  return {
    status: "verified",
    action: dryRun === true || dryRun === "true" ? "verified" : "deploy",
    releaseId,
    sourceSha: target.manifest.sourceSha,
    buildId: target.manifest.buildId,
    buildDigest: target.manifest.buildDigest,
    archiveDigest: target.archiveDigest,
    catalogDigest: target.manifest.catalogDigest,
    targetDigest: target.manifest.targetDigest,
    baselineSha,
    decision,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const result = await runGithubSiteRestore({
    inputs: event.inputs,
    expectedSourceSha: process.env.TAVERNARY_EXPECTED_SOURCE_SHA,
    expectedBuildId: process.env.TAVERNARY_EXPECTED_BUILD_ID,
  });
  await mkdir(".tmp", { recursive: true });
  await writeFile(
    ".tmp/restore-decision.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );
  if (
    result.status === "verified" &&
    result.action === "deploy" &&
    process.env.TAVERNARY_EXPECTED_SOURCE_SHA
  ) {
    const source = validateRestoreSource({
      schema_version: 1,
      runId: Number(process.env.GITHUB_RUN_ID),
      runAttempt: Number(process.env.GITHUB_RUN_ATTEMPT),
      headSha: process.env.GITHUB_SHA,
      ownerActorId: Number(process.env.GITHUB_ACTOR_ID),
      releaseId: result.releaseId,
      sourceSha: result.sourceSha,
      buildId: result.buildId,
      buildDigest: result.buildDigest,
      archiveDigest: result.archiveDigest,
      catalogDigest: result.catalogDigest,
      targetDigest: result.targetDigest,
      baselineSha: result.baselineSha,
      reason: result.decision.reason,
      dryRun: false,
    });
    await writeFile(
      ".tmp/restore-source.json",
      `${JSON.stringify(source, null, 2)}\n`,
      { flag: "wx" },
    );
  }
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `action=${result.action}\n${result.status === "verified" ? `source_sha=${result.sourceSha}\nbuild_id=${result.buildId}\nbuild_digest=${result.buildDigest}\n` : ""}`,
    );
  console.log(JSON.stringify(result));
  if (result.status !== "verified") process.exitCode = 1;
}
