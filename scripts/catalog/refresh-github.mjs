import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import { calculateCommunity } from "../../src/lib/github/repository-metrics.ts";
import { recordIntervalActivity, weekStartUtc } from "./activity-evidence.mjs";
import { buildCatalog } from "./build.mjs";
import { fetchRepositoryContributors } from "./github-contributors.mjs";
import { buildRefreshManifest } from "./github-refresh-manifest.mjs";
import {
  inspectApiActivity,
  inspectDelta as inspectDeltaDefault,
  mapConcurrent,
} from "./github-inspector.mjs";
import { observeRepositories } from "./github-observer.mjs";
import { validateCatalog } from "./validate.mjs";

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotDirectory = resolve(rootDirectory, "data/snapshots/github");
const manifestPath = resolve(
  rootDirectory,
  "data/snapshots/github-refresh.json",
);
const githubApi = "https://api.github.com";

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readRecords() {
  const directory = resolve(rootDirectory, "data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(files.map((file) => readJson(resolve(directory, file))));
}

async function readSnapshots() {
  let files;
  try {
    files = (await readdir(snapshotDirectory))
      .filter((file) => file.endsWith(".json"))
      .sort();
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    files.map((file) => readJson(resolve(snapshotDirectory, file))),
  );
}

async function readRefreshManifest() {
  try {
    return await readJson(manifestPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function formatSnapshot(snapshot) {
  return format(JSON.stringify(snapshot), {
    parser: "json",
    filepath: "snapshot.json",
  });
}

function automaticRecords(records) {
  return records
    .filter(
      (record) =>
        record.source.type === "github" &&
        record.refresh_policy === "automatic",
    )
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function selectRefreshRecords(records, snapshots, options) {
  const automatic = automaticRecords(records);
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const mode = options.mode ?? "incremental";

  if (mode === "incremental") return automatic;
  if (mode === "baseline") {
    const batchSize = options.batchSize ?? 12;
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 24) {
      throw new Error("Baseline batch size must be between 1 and 24");
    }
    return automatic
      .filter(
        ({ id }) =>
          snapshotsById.get(id)?.activity?.evidence_status !== "complete",
      )
      .slice(0, batchSize);
  }
  if (mode === "project" || mode === "forensic") {
    if (!options.projectId) {
      throw new Error(`${mode} mode requires project_id`);
    }
    const selected = automatic.filter(({ id }) => id === options.projectId);
    if (selected.length !== 1) {
      throw new Error(`Unknown refreshable project: ${options.projectId}`);
    }
    return selected;
  }
  throw new Error(`Unknown refresh mode: ${mode}`);
}

function repositoryFacts(observation) {
  return {
    id: observation.id,
    owner: observation.owner,
    name: observation.name,
    url: observation.url,
    description: observation.description,
    default_branch: observation.defaultBranch,
    head_sha: observation.headSha,
    head_committed_at: observation.headCommittedAt,
    archived: observation.archived,
    created_at: observation.createdAt,
    size_kb: observation.sizeKb,
  };
}

function provisionalActivity() {
  return {
    latest_source_activity_at: null,
    source_weeks: [],
    provisional_weeks: Array.from({ length: 12 }, () => false),
    latest_release_at: null,
    evidence_status: "provisional",
    baseline_completed_at: null,
    baseline_attempts: 0,
  };
}

function defaultLicense(previous) {
  return (
    previous ?? {
      status: "missing",
      spdx_id: null,
      source_path: null,
    }
  );
}

function normalizedLicense(license) {
  return {
    status: license.status,
    spdx_id: license.spdxId,
    source_path: license.sourcePath,
  };
}

export function contributorSnapshotForSuccess(accounts, now) {
  return {
    accounts,
    refreshed_at: now,
    stale_since: null,
  };
}

export function contributorSnapshotForFailure(previous, now) {
  if (!previous) return undefined;
  return {
    ...previous,
    stale_since: previous.stale_since ?? now,
  };
}

function snapshotFromObservation(
  record,
  observation,
  previous,
  now,
  contributors,
) {
  const activity = {
    ...(previous?.activity ?? provisionalActivity()),
    latest_release_at: observation.latestReleaseAt,
  };
  const snapshot = {
    schema_version: 2,
    project_id: record.id,
    repository: repositoryFacts(observation.repository),
    source_health: "healthy",
    activity,
    community: calculateCommunity(observation.community),
    license: defaultLicense(previous?.license),
    refreshed_at: now,
    stale_since: null,
  };
  if (previous && Object.hasOwn(previous, "activity_scan")) {
    snapshot.activity_scan = previous.activity_scan;
  }
  if (contributors) {
    snapshot.contributors = contributors;
  }
  return snapshot;
}

function withoutRefreshTimestamp(snapshot) {
  if (!snapshot) return null;
  const copy = structuredClone(snapshot);
  delete copy.refreshed_at;
  return copy;
}

function preserveTimestampIfOnlyRefreshChanged(candidate, previous) {
  if (
    previous &&
    JSON.stringify(withoutRefreshTimestamp(candidate)) ===
      JSON.stringify(withoutRefreshTimestamp(previous))
  ) {
    return previous;
  }
  return candidate;
}

export function snapshotForFailure(previous, error, now, options = {}) {
  if (!previous) return null;
  const baselineAttempt = Boolean(options.baselineAttempt);
  const attempts =
    previous.activity.baseline_attempts + (baselineAttempt ? 1 : 0);
  const evidenceStatus =
    baselineAttempt &&
    previous.activity.evidence_status === "provisional" &&
    attempts >= 3
      ? "degraded"
      : previous.activity.evidence_status;
  return {
    ...previous,
    source_health:
      error?.status === 404 ? "unavailable" : previous.source_health,
    activity: {
      ...previous.activity,
      evidence_status: evidenceStatus,
      baseline_attempts: attempts,
    },
    stale_since: previous.stale_since ?? now,
  };
}

export function repositoryIdentityChanged(record, observation) {
  return (
    record.source.repository_id !== null &&
    observation.repository.id !== record.source.repository_id
  );
}

function identityFailure(previous, now) {
  if (!previous) return null;
  return {
    ...previous,
    source_health: "identity-change",
    stale_since: previous.stale_since ?? now,
  };
}

function hoursBetween(earlier, later) {
  const elapsed = new Date(later).getTime() - new Date(earlier).getTime();
  return Number.isFinite(elapsed) ? Math.max(0, elapsed / 3_600_000) : 49;
}

function lastSuccessfulObservationAt(previous, previousManifest) {
  if (!previousManifest || previous.stale_since !== null) {
    return previous.refreshed_at;
  }
  const covered =
    previousManifest.mode === "incremental" ||
    previousManifest.project_timings?.some(
      (timing) =>
        timing.project_id === previous.project_id &&
        !["failed", "unavailable", "identity-change"].includes(timing.outcome),
    );
  return covered ? previousManifest.completed_at : previous.refreshed_at;
}

function crossesAmbiguousWeeks(previous, observation) {
  const from = previous.repository.head_committed_at;
  const to = observation.repository.headCommittedAt;
  if (!from || !to) return true;
  const elapsed = new Date(to).getTime() - new Date(from).getTime();
  return (
    !Number.isFinite(elapsed) ||
    elapsed > 7 * 24 * 60 * 60 * 1_000 ||
    (elapsed > 0 && weekStartUtc(from) !== weekStartUtc(to))
  );
}

function errorCode(error) {
  if (typeof error?.code === "string") return error.code;
  if (Number.isInteger(error?.status)) return `HTTP_${error.status}`;
  return "PROJECT_REFRESH_FAILED";
}

function outcome(projectId, result, started, snapshot, changed, extra = {}) {
  return {
    projectId,
    result,
    durationMs: Math.max(0, Date.now() - started),
    snapshotChanged: changed,
    evidenceStatus: snapshot?.activity?.evidence_status,
    sourceHealth: snapshot?.source_health,
    ...extra,
  };
}

function replaceSnapshot(snapshotsById, snapshot) {
  if (snapshot) snapshotsById.set(snapshot.project_id, snapshot);
}

function defaultHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Tavernary-catalog-refresh",
    "X-GitHub-Api-Version": "2022-11-28",
    Authorization: `Bearer ${token}`,
  };
}

function retryDelayFromHeaders(headers) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const timestamp = new Date(retryAfter).getTime();
    if (Number.isFinite(timestamp)) {
      return Math.max(0, timestamp - Date.now());
    }
  }
  const resetSeconds = Number(headers.get("x-ratelimit-reset"));
  return Number.isFinite(resetSeconds)
    ? Math.max(0, resetSeconds * 1_000 - Date.now())
    : 0;
}

async function defaultCompare(input, token) {
  const response = await fetch(
    `${githubApi}/repos/${input.repository}/compare/${input.baseSha}...${input.headSha}`,
    { headers: defaultHeaders(token) },
  );
  if (!response.ok) {
    const error = new Error(`GitHub compare returned ${response.status}`);
    error.status = response.status;
    error.rateLimited =
      response.status === 429 ||
      (response.status === 403 &&
        (response.headers.get("x-ratelimit-remaining") === "0" ||
          response.headers.get("retry-after") !== null));
    error.systemic = response.status === 401 || error.rateLimited;
    error.retryAfterMs = retryDelayFromHeaders(response.headers);
    throw error;
  }
  return response.json();
}

export async function publishCandidates(
  { changedSnapshots, manifest },
  options = {},
) {
  const destinationDirectory = options.snapshotDirectory ?? snapshotDirectory;
  const destinationManifest = options.manifestPath ?? manifestPath;
  const renameFile = options.rename ?? rename;
  await mkdir(destinationDirectory, { recursive: true });
  const temporaryRoot = await mkdtemp(
    resolve(dirname(destinationDirectory), ".github-refresh-"),
  );
  try {
    const stagedSnapshots = resolve(temporaryRoot, "github");
    const backupDirectory = resolve(temporaryRoot, "backup");
    await mkdir(stagedSnapshots, { recursive: true });
    await mkdir(backupDirectory, { recursive: true });
    const replacements = [];
    for (const [index, snapshot] of changedSnapshots.entries()) {
      const temporaryPath = resolve(
        stagedSnapshots,
        `${snapshot.project_id}.json`,
      );
      const destinationPath = resolve(
        destinationDirectory,
        `${snapshot.project_id}.json`,
      );
      await writeFile(temporaryPath, await formatSnapshot(snapshot));
      replacements.push({
        temporaryPath,
        destinationPath,
        backupPath: resolve(backupDirectory, `${index}.json`),
      });
    }
    const temporaryManifest = resolve(temporaryRoot, "github-refresh.json");
    await writeFile(temporaryManifest, await formatSnapshot(manifest));
    replacements.push({
      temporaryPath: temporaryManifest,
      destinationPath: destinationManifest,
      backupPath: resolve(backupDirectory, "manifest.json"),
    });

    for (const replacement of replacements) {
      try {
        await copyFile(replacement.destinationPath, replacement.backupPath);
        replacement.existed = true;
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        replacement.existed = false;
      }
    }

    const installed = [];
    try {
      for (const replacement of replacements) {
        await renameFile(
          replacement.temporaryPath,
          replacement.destinationPath,
        );
        installed.push(replacement);
      }
    } catch (error) {
      for (const replacement of installed.reverse()) {
        if (replacement.existed) {
          await copyFile(replacement.backupPath, replacement.destinationPath);
        } else {
          await rm(replacement.destinationPath, { force: true });
        }
      }
      throw error;
    }
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 3,
      retryDelay: 100,
    });
  }
}

export async function runRefresh(options = {}) {
  const mode = options.mode ?? "incremental";
  const startedAt = new Date(options.startedAt ?? Date.now()).toISOString();
  const now = new Date(options.now ?? startedAt).toISOString();
  const records = options.records ?? (await readRecords());
  const snapshots = options.snapshots ?? (await readSnapshots());
  const previousManifest =
    options.previousManifest ??
    (options.records === undefined && options.snapshots === undefined
      ? await readRefreshManifest()
      : null);
  const selected = selectRefreshRecords(records, snapshots, {
    mode,
    batchSize: options.batchSize,
    projectId: options.projectId,
  });
  const logger = options.logger ?? console;
  const token =
    options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const observe =
    options.observe ??
    ((batch) => observeRepositories(batch, { token, logger }));
  const inspectDelta =
    options.inspectDelta ??
    ((input) =>
      inspectDeltaDefault(input, {
        fetchCompare: (compareInput) => defaultCompare(compareInput, token),
        logger,
      }));
  const inspectGit =
    options.inspectGit ?? ((input) => inspectApiActivity(input, { token }));
  const snapshotsById = new Map(
    snapshots.map((snapshot) => [
      snapshot.project_id,
      structuredClone(snapshot),
    ]),
  );
  const recordsById = new Map(selected.map((record) => [record.id, record]));
  const outcomes = [];
  const gitJobs = [];
  let restRequests = 0;

  logger.log(`GitHub refresh ${mode}: ${selected.length} project(s)`);
  const observed = await observe(selected);
  const observationsById = new Map(
    observed.observations.map((entry) => [entry.projectId, entry]),
  );
  const failuresById = new Map(
    observed.failures.map((failure) => [failure.projectId, failure]),
  );
  const fetchContributors =
    options.fetchContributors ??
    (token
      ? (repository) => fetchRepositoryContributors(repository, { token })
      : null);
  const contributorJobs = fetchContributors
    ? observed.observations.map((observation) => ({
        projectId: observation.projectId,
        repository: {
          owner: observation.repository.owner,
          name: observation.repository.name,
        },
      }))
    : [];
  const contributorResults = await mapConcurrent(contributorJobs, 3, (job) =>
    fetchContributors(job.repository),
  );
  const systemicContributorFailure = contributorResults.find(
    (result) =>
      result.status === "rejected" &&
      (result.reason?.systemic ||
        result.reason?.rateLimited ||
        result.reason?.status === 401),
  );
  if (systemicContributorFailure) {
    throw systemicContributorFailure.reason;
  }
  const contributorResultsById = new Map();
  contributorResults.forEach((result, index) => {
    restRequests +=
      result.status === "fulfilled"
        ? (result.value.requestCount ?? 0)
        : (result.reason?.requestCount ?? 0);
    contributorResultsById.set(contributorJobs[index].projectId, result);
  });

  for (const record of selected) {
    const started = Date.now();
    const previous = snapshotsById.get(record.id) ?? null;
    const failure = failuresById.get(record.id);
    if (failure) {
      const candidate =
        failure.kind === "identity-change"
          ? identityFailure(previous, now)
          : snapshotForFailure(previous, { status: 404 }, now);
      replaceSnapshot(snapshotsById, candidate);
      outcomes.push(
        outcome(
          record.id,
          failure.kind === "identity-change"
            ? "identity-change"
            : "unavailable",
          started,
          candidate,
          candidate !== previous,
          { errorCode: failure.kind.toUpperCase().replaceAll("-", "_") },
        ),
      );
      continue;
    }

    const observation = observationsById.get(record.id);
    if (!observation) {
      throw new Error(`Observation sweep omitted ${record.id}`);
    }
    if (repositoryIdentityChanged(record, observation)) {
      const candidate = identityFailure(previous, now);
      replaceSnapshot(snapshotsById, candidate);
      outcomes.push(
        outcome(
          record.id,
          "identity-change",
          started,
          candidate,
          candidate !== previous,
          { errorCode: "IDENTITY_CHANGE" },
        ),
      );
      continue;
    }

    const contributorResult = contributorResultsById.get(record.id);
    const contributors =
      contributorResult?.status === "fulfilled"
        ? contributorSnapshotForSuccess(contributorResult.value.accounts, now)
        : contributorResult?.status === "rejected"
          ? contributorSnapshotForFailure(previous?.contributors, now)
          : previous?.contributors;
    const candidate = snapshotFromObservation(
      record,
      observation,
      previous,
      now,
      contributors,
    );
    const lacksEvidenceWatermark =
      previous !== null &&
      previous.activity.evidence_status !== "complete" &&
      previous.activity.evidence_head_sha == null;
    const requiresDirectGit =
      previous?.activity_scan !== null && previous?.activity_scan !== undefined
        ? true
        : lacksEvidenceWatermark ||
          mode === "forensic" ||
          (previous === null && mode !== "incremental") ||
          ((mode === "baseline" || mode === "project") &&
            previous.activity.evidence_status !== "complete");
    if (requiresDirectGit) {
      gitJobs.push({
        record,
        observation,
        previous,
        candidate,
        started,
        result: mode === "incremental" ? "fallback" : "baseline",
      });
      continue;
    }

    if (previous === null) {
      replaceSnapshot(snapshotsById, candidate);
      outcomes.push(outcome(record.id, "unchanged", started, candidate, true));
      continue;
    }

    const evidenceHeadSha =
      previous.activity.evidence_head_sha ??
      (previous.activity.evidence_status === "complete"
        ? previous.repository.head_sha
        : null);
    if (evidenceHeadSha === null) {
      throw new Error(`${record.id}: activity evidence watermark is required`);
    }
    if (evidenceHeadSha === observation.repository.headSha) {
      const final = preserveTimestampIfOnlyRefreshChanged(candidate, previous);
      replaceSnapshot(snapshotsById, final);
      outcomes.push(
        outcome(record.id, "unchanged", started, final, final !== previous),
      );
      continue;
    }

    try {
      const delta = await inspectDelta({
        repository: record.source.repository,
        baseSha: evidenceHeadSha,
        headSha: observation.repository.headSha,
        hoursSinceLastSuccess: hoursBetween(
          lastSuccessfulObservationAt(previous, previousManifest),
          now,
        ),
        crossesAmbiguousWeeks:
          evidenceHeadSha !== previous.repository.head_sha ||
          crossesAmbiguousWeeks(previous, observation),
      });
      restRequests += delta.requestCount;
      if (delta.kind === "fallback" || delta.licenseChanged) {
        logger.log(
          `${record.id}: compare ${delta.kind === "fallback" ? delta.reason : "license-change"}; Git fallback required`,
        );
        gitJobs.push({
          record,
          observation,
          previous,
          candidate,
          started,
          result: "fallback",
        });
        continue;
      }
      if (delta.kind === "accepted-source") {
        candidate.activity = recordIntervalActivity(candidate.activity, {
          activityAt: delta.activityAt,
          observedAt: now,
        });
      }
      candidate.activity.evidence_head_sha = observation.repository.headSha;
      const final = preserveTimestampIfOnlyRefreshChanged(candidate, previous);
      replaceSnapshot(snapshotsById, final);
      outcomes.push(
        outcome(
          record.id,
          delta.kind === "accepted-source"
            ? "compare-source"
            : "compare-excluded",
          started,
          final,
          final !== previous,
        ),
      );
      logger.log(`${record.id}: ${delta.kind}`);
    } catch (error) {
      if (error?.systemic || error?.rateLimited || error?.status === 401) {
        throw error;
      }
      const recovered = snapshotForFailure(previous, error, now);
      replaceSnapshot(snapshotsById, recovered);
      outcomes.push(
        outcome(
          record.id,
          "failed",
          started,
          recovered,
          recovered !== previous,
          {
            errorCode: errorCode(error),
          },
        ),
      );
    }
  }

  const gitResults = await mapConcurrent(gitJobs, 3, async (job) => {
    logger.log(`${job.record.id}: ${job.result} Git inspection started`);
    const evidenceHeadSha =
      job.previous?.activity?.evidence_head_sha ??
      (job.previous?.activity?.evidence_status === "complete"
        ? job.previous.repository.head_sha
        : null);
    return inspectGit({
      repository: job.record.source.repository,
      defaultBranch: job.observation.repository.defaultBranch,
      expectedHeadSha:
        job.previous?.activity_scan?.head_sha ??
        job.observation.repository.headSha,
      headCommittedAt: job.observation.repository.headCommittedAt,
      now,
      activity: {
        ...job.candidate.activity,
        evidence_head_sha: evidenceHeadSha,
      },
      scan: job.previous?.activity_scan ?? null,
    });
  });
  const systemicGitFailure = gitResults.find(
    (result) =>
      result.status === "rejected" &&
      (result.reason?.systemic ||
        result.reason?.rateLimited ||
        result.reason?.status === 401),
  );
  if (systemicGitFailure) throw systemicGitFailure.reason;
  gitResults.forEach((result, index) => {
    const job = gitJobs[index];
    if (result.status === "fulfilled") {
      restRequests += result.value.requestCount ?? 0;
      const candidate = {
        ...job.candidate,
        activity: result.value.activity,
        license: result.value.license
          ? normalizedLicense(result.value.license)
          : job.candidate.license,
      };
      if (Object.hasOwn(result.value, "scan")) {
        candidate.activity_scan = result.value.scan;
      }
      const final = preserveTimestampIfOnlyRefreshChanged(
        candidate,
        job.previous,
      );
      replaceSnapshot(snapshotsById, final);
      outcomes.push(
        outcome(
          job.record.id,
          job.result,
          job.started,
          final,
          final !== job.previous,
        ),
      );
      logger.log(
        `${job.record.id}: ${job.result} Git inspection complete in ${Math.max(0, Date.now() - job.started)}ms`,
      );
      return;
    }
    const recovered = snapshotForFailure(
      {
        ...job.candidate,
        stale_since: job.previous?.stale_since ?? job.candidate.stale_since,
      },
      result.reason,
      now,
      {
        baselineAttempt: job.result === "baseline",
      },
    );
    replaceSnapshot(snapshotsById, recovered);
    outcomes.push(
      outcome(
        job.record.id,
        "failed",
        job.started,
        recovered,
        recovered !== job.previous,
        { errorCode: errorCode(result.reason) },
      ),
    );
  });

  outcomes.sort((left, right) => left.projectId.localeCompare(right.projectId));
  const finalSnapshots = [...snapshotsById.values()].sort((left, right) =>
    left.project_id.localeCompare(right.project_id),
  );
  const completedAt = new Date(
    options.completedAt ?? (options.now ? now : Date.now()),
  ).toISOString();
  const manifest = buildRefreshManifest({
    mode,
    startedAt,
    completedAt,
    outcomes,
    snapshots: finalSnapshots,
    usage: {
      graphqlRequests: observed.usage.requestCount,
      graphqlPoints: observed.usage.pointCost,
      graphqlRemaining: observed.usage.remainingPoints,
      restRequests,
    },
    deploymentRequested: options.deploymentRequested,
  });
  const previousById = new Map(
    snapshots.map((snapshot) => [snapshot.project_id, snapshot]),
  );
  const changedSnapshots = finalSnapshots.filter(
    (snapshot) =>
      JSON.stringify(snapshot) !==
      JSON.stringify(previousById.get(snapshot.project_id)),
  );

  if (options.write !== false) {
    const validateCandidates =
      options.validateCandidates ??
      ((input) =>
        validateCatalog({
          records: input.records,
          snapshots: input.snapshots,
          refreshManifest: input.manifest,
        }));
    const buildCandidates =
      options.buildCandidates ??
      ((input) =>
        buildCatalog({
          write: false,
          records: input.records,
          snapshots: input.snapshots,
          refreshManifest: input.manifest,
        }));
    const validation = await validateCandidates({
      records,
      snapshots: finalSnapshots,
      manifest,
    });
    if (validation?.errors?.length > 0) {
      throw new Error(
        `Candidate catalog validation failed:\n${validation.errors.join("\n")}`,
      );
    }
    await buildCandidates({ records, snapshots: finalSnapshots, manifest });
    const publish = options.publish ?? publishCandidates;
    await publish({ changedSnapshots, manifest });
  }

  return {
    selected,
    snapshots: finalSnapshots,
    changedSnapshots,
    manifest,
  };
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function main() {
  const mode = argument("--mode", "incremental");
  const batchSize = Number.parseInt(argument("--batch-size", "12"), 10);
  const projectId = argument("--project-id");
  const deploymentRequested = process.argv.includes("--deployment-requested");
  const result = await runRefresh({
    mode,
    batchSize,
    projectId,
    deploymentRequested,
  });
  console.table(result.manifest.counts);
  console.table(result.manifest.project_timings);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
