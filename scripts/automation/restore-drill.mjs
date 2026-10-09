import { execFileSync } from "node:child_process";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { readAuthoritativeActiveDeployment } from "./deployment-gate.mjs";
import { loadRetainedGithubSiteBundle } from "./site-bundle-github.mjs";
import { restoreSiteBundle, validateSiteBundle } from "./site-bundle.mjs";

const repository = "MentallyQuill/Tavernary",
  sha = /^[a-f0-9]{40}$/u;

export async function loadRestoreDrillHealth({
  repository: name,
  revision,
  gh = executeGh,
  isAncestor,
  nowMs = Date.now(),
}) {
  if (name !== repository || !sha.test(revision))
    throw new Error("Restore drill health context is invalid.");
  const parse = (text) => {
    if (Buffer.byteLength(text) > 1_048_576)
      throw new Error("Restore drill health exceeds its bound.");
    return JSON.parse(text);
  };
  const history = parse(
    await gh([
      "api",
      `repos/${name}/actions/workflows/restore-drill.yml/runs?branch=main&status=completed&per_page=1`,
    ]),
  );
  if (!Array.isArray(history.workflow_runs) || history.workflow_runs.length > 1)
    throw new Error("Restore drill history is invalid.");
  const run = history.workflow_runs[0];
  if (!run) return { status: "active" };
  if (
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    run.path !== ".github/workflows/restore-drill.yml" ||
    run.head_branch !== "main" ||
    !sha.test(run.head_sha ?? "") ||
    run.head_repository?.id !== 1309605115 ||
    run.head_repository.full_name !== name ||
    !["schedule", "workflow_dispatch"].includes(run.event) ||
    run.status !== "completed" ||
    (run.head_sha !== revision && isAncestor(run.head_sha, revision) !== true)
  )
    throw new Error("Restore drill health custody is invalid.");
  const observed = Date.parse(run.updated_at ?? "");
  if (
    run.conclusion !== "success" ||
    !Number.isFinite(observed) ||
    observed > nowMs + 300_000 ||
    nowMs - observed >= 8 * 86_400_000
  )
    return { status: "active" };
  const result = parse(
    await gh(["api", `repos/${name}/actions/runs/${run.id}/jobs?per_page=10`]),
  );
  if (
    !Array.isArray(result.jobs) ||
    result.jobs.length > 10 ||
    result.total_count !== result.jobs.length
  )
    throw new Error("Restore drill job inventory is invalid.");
  const jobs = result.jobs.filter((job) => job.name === "verify");
  const passed =
    jobs.length === 1 &&
    jobs[0].status === "completed" &&
    jobs[0].conclusion === "success" &&
    Array.isArray(jobs[0].steps) &&
    [
      "Restore the authenticated retained export into a clean workspace",
      "Verify restored behavior with all outbound browser requests blocked",
    ].every((name) =>
      jobs[0].steps.some(
        (step) => step.name === name && step.conclusion === "success",
      ),
    );
  return { status: passed ? "recovered" : "active" };
}

export async function prepareGithubRestoreDrill({
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  git = (args) =>
    execFileSync("git", args, {
      cwd: root,
      encoding: "utf8",
      timeout: 30_000,
      windowsHide: true,
    }).trim(),
  readActive = readAuthoritativeActiveDeployment,
  loadBundle = (input) => loadRetainedGithubSiteBundle({ ...input, gh }),
} = {}) {
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID);
  if (
    env.GITHUB_REPOSITORY !== repository ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_WORKFLOW_REF !==
      `${repository}/.github/workflows/restore-drill.yml@refs/heads/main` ||
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !["schedule", "workflow_dispatch"].includes(env.GITHUB_EVENT_NAME) ||
    (env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
      ![2625904, publisherActorId].includes(Number(env.GITHUB_ACTOR_ID)))
  )
    throw new Error("Restore drill custody is invalid.");
  const revision = git(["rev-parse", "HEAD"]);
  if (!sha.test(revision) || git(["rev-parse", "origin/main"]) !== revision)
    throw new Error("Restore drill main advanced.");
  const active = readActive({ root, revision }),
    record = active?.deployment;
  if (
    !record ||
    !["ordinary", "rollback"].includes(active.mode) ||
    !sha.test(record.sourceSha) ||
    !/^run-[1-9]\d*-attempt-[1-9]\d*$/u.test(record.buildId)
  )
    throw new Error("Restore drill has no verified active deployment.");
  const text = await gh([
    "api",
    `repos/${repository}/releases/tags/site-bundle-${record.sourceSha}-${record.buildId}`,
  ]);
  if (Buffer.byteLength(text) > 1_048_576)
    throw new Error("Restore drill release exceeds its bound.");
  const release = JSON.parse(text);
  if (
    !Number.isSafeInteger(release.id) ||
    release.id < 1 ||
    release.author?.id !== publisherActorId ||
    release.author.type !== "Bot" ||
    release.draft !== false ||
    release.immutable !== true
  )
    throw new Error("Restore drill release custody is invalid.");
  const loaded = await loadBundle({
    repository,
    publisherActorId,
    releaseId: release.id,
    currentMainSha: revision,
    nowMs: Date.now(),
    isAncestor: (a, b) => {
      if (a === b) return true;
      try {
        git(["merge-base", "--is-ancestor", a, b]);
        return true;
      } catch (error) {
        return error.status === 1 ? false : null;
      }
    },
  });
  const bundle = validateSiteBundle(loaded.bundle);
  if (
    loaded.releaseId !== release.id ||
    loaded.deployment.sourceSha !== record.sourceSha ||
    loaded.deployment.buildId !== record.buildId ||
    loaded.deployment.bundleDigest !== record.bundleDigest ||
    bundle.manifest.sourceSha !== record.sourceSha ||
    bundle.manifest.buildId !== record.buildId ||
    bundle.manifest.buildDigest !== record.bundleDigest ||
    git(["rev-parse", "HEAD"]) !== revision
  )
    throw new Error("Restore drill bundle changed.");
  const workspace = await mkdtemp(
    resolve(tmpdir(), "tavernary-restore-drill-"),
  );
  const outputDirectory = resolve(workspace, "out");
  await restoreSiteBundle({ verified: bundle, outputDirectory });
  return {
    status: "restored",
    releaseId: release.id,
    sourceSha: bundle.manifest.sourceSha,
    buildId: bundle.manifest.buildId,
    archiveDigest: bundle.archiveDigest,
    outputDirectory,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  let result;
  try {
    result = await prepareGithubRestoreDrill();
  } catch {
    result = { status: "failed", reason: "restore-drill-unavailable" };
    process.exitCode = 1;
  }
  await mkdir(".tmp", { recursive: true });
  await writeFile(
    ".tmp/restore-drill-decision.json",
    `${JSON.stringify(result, null, 2)}\n`,
  );
  console.log(JSON.stringify(result));
}
