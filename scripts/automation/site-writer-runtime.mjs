import { execFileSync } from "node:child_process";
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
  loadSiteWriterRecoveryRuns,
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
import { readRollbackCanonicalData } from "./rollback-canonical.mjs";
import {
  loadGithubRestoreSource,
  trustedRestoreRun,
} from "./restore-source.mjs";
import { confirmPublicDeployment } from "./confirm-deployment.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
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
  const runs = await loadSiteWriterRecoveryRuns({
    gh,
    repository,
    nowMs: state.nowMs,
    workflow: "restore-site.yml",
  });
  for (const run of runs) {
    const completed = run.status === "completed";
    if (
      !trustedRestoreRun(
        {
          ...run,
          status: "completed",
          conclusion: completed ? run.conclusion : "success",
        },
        {
          repository,
          runId: run.id,
          currentMainSha: state.revision,
          isAncestor,
        },
      )
    )
      continue;
    if (completed && state.activeDeployment?.confirmingRunId >= run.id)
      continue;
    const id = Number(
      /^Site restore ([1-9]\d*)$/u.exec(run.display_title)?.[1],
    );
    if (completed) {
      let release;
      try {
        release = parse(
          await gh(["api", `repos/${repository}/releases/${id}`]),
        );
      } catch (error) {
        if (githubFailureStatus(error) === 404) continue;
        throw error;
      }
      if (
        release.id !== id ||
        release.author?.id !== publisherActorId ||
        release.draft !== false ||
        release.immutable !== true
      )
        fail();
    }
    ids.add(id);
    if (ids.size > 1000) fail();
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
    root,
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
  readCurrent = () => readRollbackCanonicalData({ root }),
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
    readCurrent,
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
function recoveryRequestState({ runs, env, state, isAncestor, title, reason }) {
  const trusted = runs.filter(
    (run) =>
      run.display_title === title &&
      run.path === ".github/workflows/automation-writer.yml" &&
      run.event === "workflow_dispatch" &&
      run.head_branch === "main" &&
      run.actor?.id === Number(env.TAVERNARY_PUBLISHER_BOT_ID) &&
      run.repository?.full_name === env.GITHUB_REPOSITORY &&
      run.head_repository?.id === run.repository?.id &&
      run.head_repository?.full_name === env.GITHUB_REPOSITORY &&
      Number.isSafeInteger(run.id) &&
      run.id > 0 &&
      Number.isSafeInteger(run.repository?.id) &&
      run.repository.id > 0 &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0 &&
      sha.test(run.head_sha ?? "") &&
      (run.head_sha === state.revision ||
        isAncestor(run.head_sha, state.revision) === true),
  );
  if (
    trusted.some((run) =>
      ["queued", "in_progress", "waiting", "pending", "requested"].includes(
        run.status,
      ),
    )
  )
    return { status: "already-requested" };
  const completed = trusted.filter((run) => run.status === "completed");
  for (const run of completed) {
    const created = Date.parse(run.created_at),
      updated = Date.parse(run.updated_at);
    if (
      !Number.isSafeInteger(state.nowMs) ||
      !Number.isFinite(created) ||
      !Number.isFinite(updated) ||
      updated < created ||
      updated > state.nowMs + 300000
    )
      fail();
  }
  completed.sort(
    (a, b) =>
      Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
  );
  if (completed.length) {
    const latest = completed[0],
      firstSuccess = completed.findIndex((run) => run.conclusion === "success");
    const failures =
      latest.conclusion === "success"
        ? 1
        : firstSuccess < 0
          ? completed.length
          : firstSuccess;
    const retry = planAutomationRetry({
      failure: classifyAutomationFailure(
        latest.conclusion === "success"
          ? { diagnosticCode: "provider-unavailable" }
          : { conclusion: latest.conclusion },
      ),
      transientAttempts: Math.max(0, failures - 1),
      immediateAttempts: failures,
      nowMs: Date.parse(latest.updated_at),
      jitterSeed: title,
    });
    if (!retry.nextEligibleAt || Date.parse(retry.nextEligibleAt) > state.nowMs)
      return {
        status: "waiting",
        reason,
        nextEligibleAt: retry.nextEligibleAt,
      };
  }
  return null;
}
export async function recoverSiteWriterHandoffs(input) {
  const {
    gh,
    env,
    state,
    isAncestor,
    availableSlots = 1,
    download = downloadPreparedArtifact,
  } = input;
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20
  )
    fail();
  if (!availableSlots) return { status: "waiting", reason: "operation-limit" };
  if (env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED !== "true")
    return { status: "disabled" };
  const runs = await loadSiteWriterRecoveryRuns({
    gh,
    repository: env.GITHUB_REPOSITORY,
    nowMs: state.nowMs,
    workflow: "restore-site.yml",
  });
  const candidates = runs
    .filter(
      (run) =>
        trustedRestoreRun(run, {
          repository: env.GITHUB_REPOSITORY,
          runId: run.id,
          currentMainSha: state.revision,
          isAncestor,
        }) &&
        (!state.activeDeployment ||
          state.activeDeployment.confirmingRunId < run.id),
    )
    .sort((a, b) => b.id - a.id);
  let deferred;
  if (candidates.length) {
    const requests = await loadSiteWriterRecoveryRuns({
      gh,
      repository: env.GITHUB_REPOSITORY,
      nowMs: state.nowMs,
      workflow: "automation-writer.yml",
    });
    // Rotate bounded artifact probes so a failed latest restore cannot hide older intent.
    const offset = (Math.floor(state.nowMs / 900000) * 20) % candidates.length;
    for (let index = 0; index < Math.min(20, candidates.length); index++) {
      const run = candidates[(offset + index) % candidates.length];
      const pending = recoveryRequestState({
        runs: requests,
        env,
        state,
        isAncestor,
        title: `Site restore confirm ${run.id}`,
        reason: "restore-backoff",
      });
      if (pending?.status === "already-requested") return pending;
      if (pending) {
        deferred = pending;
        continue;
      }
      try {
        await loadGithubRestoreSource({
          gh,
          download,
          repository: env.GITHUB_REPOSITORY,
          runId: run.id,
          currentMainSha: state.revision,
          isAncestor,
        });
      } catch (error) {
        // A native owner run may have stopped before creating any restore source.
        if (error.code === "provider-unavailable") continue;
        throw error;
      }
      await gh([
        "workflow",
        "run",
        "automation-writer.yml",
        "--repo",
        env.GITHUB_REPOSITORY,
        "--ref",
        "main",
        "-f",
        "mode=confirm-restore",
        "-f",
        `result_run_id=${run.id}`,
      ]);
      return { status: "requested", mode: "confirm-restore", runId: run.id };
    }
  }
  const retention = await recoverSiteBundleRetention(input);
  return deferred ? { ...retention, restore: deferred } : retention;
}
export async function recoverSiteBundleRetention({
  gh,
  env,
  state,
  isAncestor,
  download = downloadSiteGithubBytes,
  availableSlots = 1,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (
    !Number.isSafeInteger(availableSlots) ||
    availableSlots < 0 ||
    availableSlots > 20
  )
    fail();
  if (!availableSlots) return { status: "waiting", reason: "operation-limit" };
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
  const runs = await loadSiteWriterRecoveryRuns({
    gh,
    repository: env.GITHUB_REPOSITORY,
    nowMs: state.nowMs,
    workflow: "automation-writer.yml",
  });
  const pending = recoveryRequestState({
    runs,
    env,
    state,
    isAncestor,
    title,
    reason: "retention-backoff",
  });
  if (pending) return pending;
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
