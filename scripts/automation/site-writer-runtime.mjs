import { execFileSync } from "node:child_process";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
} from "./writer-runtime.mjs";
import { readAuthoritativeActiveDeployment } from "./deployment-gate.mjs";
import {
  retainGithubSiteBundle,
  loadRetainedGithubSiteBundle,
  inspectRetainedGithubSiteBundle,
  downloadSiteGithubBytes,
} from "./site-bundle-github.mjs";
import { confirmRestoredDeployment } from "./restore-writer.mjs";
import { loadGithubRestoreSource } from "./restore-source.mjs";
import { confirmPublicDeployment } from "./confirm-deployment.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
const repositoryName = "MentallyQuill/Tavernary",
  sha = /^[a-f0-9]{40}$/u;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error("Site writer recovery context or retained proof is invalid."),
    { code },
  );
}
function parse(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 4 * 1024 * 1024)
    fail();
  return JSON.parse(text);
}
function git(root, args) {
  return execFileSync("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1048576,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}
function ancestry(root) {
  return (a, b) => {
    if (a === b) return true;
    try {
      git(root, ["merge-base", "--is-ancestor", a, b]);
      return true;
    } catch (error) {
      return error.status === 1 ? false : null;
    }
  };
}
export async function protectedRestoreBundleIds({
  gh,
  env,
  state,
  isAncestor,
}) {
  const repository = env.GITHUB_REPOSITORY,
    publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    ids = new Set();
  if (repository !== repositoryName || !sha.test(state.revision ?? "")) fail();
  for (const status of [
    "queued",
    "in_progress",
    "waiting",
    "pending",
    "requested",
  ]) {
    const page = parse(
      await gh([
        "api",
        `repos/${repository}/actions/workflows/restore-site.yml/runs?per_page=100&status=${status}`,
      ]),
    );
    if (
      !Array.isArray(page.workflow_runs) ||
      page.total_count !== page.workflow_runs.length ||
      page.workflow_runs.length > 100
    )
      fail();
    for (const run of page.workflow_runs) {
      if (
        run.actor?.id !== 2625904 ||
        run.event !== "workflow_dispatch" ||
        run.head_branch !== "main"
      )
        continue;
      const id = Number(
        /^Site restore ([1-9]\d*)$/u.exec(run.display_title ?? "")?.[1],
      );
      if (
        !Number.isSafeInteger(id) ||
        id < 1 ||
        run.path !== ".github/workflows/restore-site.yml" ||
        run.repository?.full_name !== repository ||
        !Number.isSafeInteger(run.repository.id) ||
        run.repository.id < 1 ||
        run.head_repository?.id !== run.repository.id ||
        run.head_repository.full_name !== repository ||
        !sha.test(run.head_sha ?? "") ||
        (run.head_sha !== state.revision &&
          isAncestor(run.head_sha, state.revision) !== true)
      )
        fail();
      ids.add(id);
    }
  }
  if (state.activeDeployment?.mode === "rollback") {
    const record = state.activeDeployment.deployment;
    const release = parse(
      await gh([
        "api",
        `repos/${repository}/releases/tags/site-bundle-${record.sourceSha}-${record.buildId}`,
      ]),
    );
    if (
      !Number.isSafeInteger(release.id) ||
      release.id < 1 ||
      release.author?.id !== publisherActorId ||
      release.immutable !== true ||
      release.draft !== false
    )
      fail();
    ids.add(release.id);
  }
  return [...ids];
}
async function loadSiteWriterState({ root, env }) {
  await synchronizeWriterCheckout({ root, env });
  const revision = git(root, ["rev-parse", "HEAD"]),
    nowMs = Date.now();
  if (!sha.test(revision)) fail();
  const directory = resolve(root, "data/maintenance/automation/deployments");
  let names = [];
  try {
    names = await readdir(directory);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const proofNames = names.filter((name) => /^[a-f0-9]{40}\.json$/u.test(name));
  if (proofNames.length > 2000) fail("provider-configuration-invalid");
  const deployments = [];
  for (const name of proofNames.sort()) {
    const path = resolve(directory, name),
      stat = await lstat(path);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) fail();
    const bytes = await readFile(path);
    if (bytes.length > 65536) fail();
    const record = JSON.parse(bytes.toString("utf8"));
    if (record.sourceSha !== name.slice(0, -5)) fail();
    deployments.push(record);
  }
  return {
    revision,
    nowMs,
    deployments,
    activeDeployment: readAuthoritativeActiveDeployment({ root, revision }),
  };
}
export async function runSiteWriterRetention({
  runId,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = () => loadSiteWriterState({ root, env }),
  download = downloadSiteGithubBytes,
  isAncestor = ancestry(root),
  retain = retainGithubSiteBundle,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  return retain({
    runId,
    env,
    gh,
    download,
    isAncestor,
    load: async () => {
      const state = await load();
      return {
        ...state,
        protectedBundleIds: await protectedRestoreBundleIds({
          gh,
          env,
          state,
          isAncestor,
        }),
      };
    },
  });
}
export async function runSiteWriterRestoreConfirmation({
  runId,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = () => loadSiteWriterState({ root, env }),
  download = downloadPreparedArtifact,
  bundleDownload = downloadSiteGithubBytes,
  isAncestor = ancestry(root),
  probe = confirmPublicDeployment,
  commit = (input) =>
    commitCanonicalData({ ...input, gh, repository: env.GITHUB_REPOSITORY }),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  const result = await confirmRestoredDeployment({
    runId,
    load,
    isAncestor,
    probe,
    commit,
    loadSource: ({ runId, revision }) =>
      loadGithubRestoreSource({
        gh,
        download,
        repository,
        runId,
        currentMainSha: revision,
        isAncestor,
      }),
    loadBundle: ({ releaseId, revision, nowMs }) =>
      loadRetainedGithubSiteBundle({
        gh,
        download: bundleDownload,
        repository,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
        releaseId,
        currentMainSha: revision,
        nowMs,
        isAncestor,
      }),
  });
  if (["waiting", "incident"].includes(result.status))
    fail(
      result.status === "waiting"
        ? "provider-unavailable"
        : "validation-failed",
    );
  return result;
}
export async function recoverSiteBundleRetention({
  gh,
  env,
  state,
  isAncestor,
  download = downloadSiteGithubBytes,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED !== "true")
    return { status: "disabled" };
  const record = state.activeDeployment?.deployment;
  if (
    !record ||
    !Number.isSafeInteger(record.workflowRunId) ||
    record.workflowRunId < 1
  )
    return { status: "waiting" };
  const route = `repos/${env.GITHUB_REPOSITORY}`;
  try {
    const release = parse(
      await gh([
        "api",
        `${route}/releases/tags/site-bundle-${record.sourceSha}-${record.buildId}`,
      ]),
    );
    if (release.author?.id !== Number(env.TAVERNARY_PUBLISHER_BOT_ID)) fail();
    if (release.draft === false && release.immutable === true) {
      const inspected = await inspectRetainedGithubSiteBundle({
        gh,
        download,
        repository: env.GITHUB_REPOSITORY,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
        releaseId: release.id,
        currentMainSha: state.revision,
        nowMs: state.nowMs,
        isAncestor,
      });
      if (
        inspected.deployment.sourceSha !== record.sourceSha ||
        inspected.deployment.buildId !== record.buildId ||
        inspected.deployment.bundleDigest !== record.bundleDigest
      )
        fail();
      return { status: "retained" };
    }
  } catch (error) {
    if (githubFailureStatus(error) !== 404) throw error;
  }
  const title = `Site bundle retain ${record.workflowRunId}`;
  const runs = parse(
    await gh([
      "api",
      `${route}/actions/workflows/automation-writer.yml/runs?per_page=100`,
    ]),
  );
  if (!Array.isArray(runs.workflow_runs) || runs.workflow_runs.length > 100)
    fail();
  if (
    runs.workflow_runs.some(
      (run) =>
        run.display_title === title &&
        run.path === ".github/workflows/automation-writer.yml" &&
        run.event === "workflow_dispatch" &&
        run.head_branch === "main" &&
        run.actor?.id === Number(env.TAVERNARY_PUBLISHER_BOT_ID) &&
        run.repository?.full_name === env.GITHUB_REPOSITORY &&
        run.head_repository?.id === run.repository?.id &&
        run.head_repository?.full_name === env.GITHUB_REPOSITORY &&
        run.status !== "completed" &&
        sha.test(run.head_sha ?? "") &&
        (run.head_sha === state.revision ||
          isAncestor(run.head_sha, state.revision) === true),
    )
  )
    return { status: "already-requested" };
  await gh([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    env.GITHUB_REPOSITORY,
    "--ref",
    "main",
    "-f",
    "mode=retain",
    "-f",
    `result_run_id=${record.workflowRunId}`,
  ]);
  return { status: "requested" };
}
