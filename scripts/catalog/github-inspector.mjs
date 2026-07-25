import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { classifyCommit } from "../../src/lib/github/activity.ts";
import { classifyRootLicense } from "../../src/lib/github/license.ts";
import {
  completeBaseline,
  normalizeSourceWeeks,
  weekStartUtc,
  weekWindow,
} from "./activity-evidence.mjs";

const execFile = promisify(execFileCallback);
const DAY_MS = 24 * 60 * 60 * 1000;
const GIT_WINDOW_DAYS = 100;
const GIT_OPTIONS = {
  timeout: 300_000,
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true,
};
const defaultLogger = { log() {}, error() {} };

function isRootLicense(path) {
  return /^(?:licen[cs]e|copying)(?:[._-].*)?$/i.test(path);
}

function compareFallbackReason(input, comparison) {
  if (comparison.status !== "ahead") return "history-not-ahead";
  if (comparison.total_commits > comparison.commits.length) {
    return "commit-limit";
  }
  if (comparison.files.length >= 300) return "file-limit";
  if (input.hoursSinceLastSuccess > 48) return "stale-observation";
  if (input.crossesAmbiguousWeeks) return "multiweek";
  return null;
}

function validComparison(comparison) {
  return (
    comparison &&
    typeof comparison === "object" &&
    typeof comparison.status === "string" &&
    Number.isInteger(comparison.total_commits) &&
    comparison.total_commits > 0 &&
    Array.isArray(comparison.commits) &&
    comparison.commits.length > 0 &&
    Array.isArray(comparison.files) &&
    comparison.files.every(
      ({ filename, patch }) =>
        typeof filename === "string" &&
        (patch === undefined || patch === null || typeof patch === "string"),
    )
  );
}

function compareCommitTimestamp(commit) {
  const value =
    commit?.commit?.committer?.date ?? commit?.commit?.author?.date ?? null;
  const date = new Date(value);
  return typeof value === "string" && Number.isFinite(date.getTime())
    ? date.toISOString()
    : null;
}

async function fetchComparison(input, options) {
  const maxRetries = options.maxRetries ?? 2;
  const logger = options.logger ?? defaultLogger;
  const delay =
    options.delay ??
    ((milliseconds) =>
      new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds)));
  let requestCount = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    requestCount += 1;
    try {
      return {
        comparison: await options.fetchCompare(input),
        requestCount,
      };
    } catch (error) {
      if (error?.status === 404) {
        return { comparison: null, requestCount };
      }
      const retryable =
        error?.status === undefined ||
        error.status === 429 ||
        (error.status === 403 && error.rateLimited) ||
        error.status >= 500;
      if (retryable && attempt < maxRetries) {
        logger.log("Retrying GitHub compare request");
        await delay(error?.retryAfterMs ?? 0);
        continue;
      }
      throw error;
    }
  }

  throw new Error("GitHub compare retry limit reached");
}

export async function inspectDelta(input, options) {
  const fetched = await fetchComparison(input, options);
  if (fetched.comparison === null) {
    return {
      kind: "fallback",
      reason: "compare-unavailable",
      requestCount: fetched.requestCount,
    };
  }
  const comparison = fetched.comparison;
  if (!validComparison(comparison)) {
    return {
      kind: "fallback",
      reason: "malformed-compare",
      requestCount: fetched.requestCount,
    };
  }
  const timestamps = comparison.commits.map(compareCommitTimestamp);
  if (timestamps.some((timestamp) => timestamp === null)) {
    return {
      kind: "fallback",
      reason: "malformed-compare",
      requestCount: fetched.requestCount,
    };
  }
  const reason = compareFallbackReason(input, comparison);
  if (reason) {
    return {
      kind: "fallback",
      reason,
      requestCount: fetched.requestCount,
    };
  }

  const files = comparison.files.map(({ filename }) => filename);
  const licenseChanged = files.some(isRootLicense);
  const sourceBearing = comparison.files.some(
    ({ filename, patch }) =>
      classifyCommit([filename], { patch }) === "meaningful",
  );
  const activityAt = timestamps.sort((left, right) =>
    right.localeCompare(left),
  )[0];

  return sourceBearing
    ? {
        kind: "accepted-source",
        activityAt,
        licenseChanged,
        requestCount: fetched.requestCount,
      }
    : {
        kind: "accepted-excluded",
        licenseChanged,
        requestCount: fetched.requestCount,
      };
}

function stdout(result) {
  return typeof result === "string" ? result : (result?.stdout ?? "");
}

function activityWithExactSourceCommit(activity, committedAt, now) {
  const sourceWeeks = normalizeSourceWeeks(
    [
      ...activity.source_weeks,
      {
        week_start: weekStartUtc(committedAt),
        latest_at: committedAt,
        precision: "exact",
      },
    ],
    now,
  );
  const active = new Set(sourceWeeks.map(({ week_start }) => week_start));
  const latest =
    activity.latest_source_activity_at === null ||
    new Date(committedAt).getTime() >
      new Date(activity.latest_source_activity_at).getTime()
      ? committedAt
      : activity.latest_source_activity_at;
  return {
    ...activity,
    latest_source_activity_at: latest,
    source_weeks: sourceWeeks,
    provisional_weeks: weekWindow(now).map((week) => active.has(week)),
    evidence_status: "provisional",
    baseline_completed_at: null,
  };
}

function accumulateCommitClassification(files, previous = null) {
  let sourcePathSeen = previous?.source_path_seen ?? false;
  let substantivePatchSeen = previous?.substantive_patch_seen ?? false;
  let patchIncomplete = previous?.patch_incomplete ?? false;

  for (const file of files) {
    sourcePathSeen ||= classifyCommit([file.filename]) === "meaningful";
    if (typeof file.patch !== "string") {
      patchIncomplete = true;
    } else {
      substantivePatchSeen ||=
        classifyCommit(["src/tavernary-activity-scan.ts"], {
          patch: file.patch,
        }) === "meaningful";
    }
  }

  return {
    source_path_seen: sourcePathSeen,
    substantive_patch_seen: substantivePatchSeen,
    patch_incomplete: patchIncomplete,
    meaningful: sourcePathSeen && (patchIncomplete || substantivePatchSeen),
  };
}

function githubActivityClient(options = {}) {
  const token = options.token;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("GitHub REST authentication token is required");
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  let requestCount = 0;

  async function request(url, accept = "application/vnd.github+json") {
    requestCount += 1;
    const response = await fetchImpl(url, {
      headers: {
        Accept: accept,
        Authorization: `Bearer ${token}`,
        "User-Agent": "Tavernary-catalog-refresh",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!response.ok) {
      let responseMessage = "";
      try {
        const payload = await response.clone().json();
        responseMessage =
          typeof payload?.message === "string" ? payload.message : "";
      } catch {
        responseMessage = "";
      }
      const secondaryRateLimit =
        response.status === 403 &&
        /secondary rate limit|abuse detection/i.test(responseMessage);
      const error = new Error(
        `GitHub REST request returned ${response.status}`,
      );
      error.status = response.status;
      error.rateLimited =
        response.status === 429 ||
        secondaryRateLimit ||
        (response.status === 403 &&
          (response.headers.get("x-ratelimit-remaining") === "0" ||
            response.headers.get("retry-after") !== null));
      error.systemic = response.status === 401 || error.rateLimited;
      throw error;
    }
    return response;
  }

  return {
    requestCount: () => requestCount,
    async fetchCommitsPage({ repository, headSha, cutoffAt, page }) {
      const query = new URLSearchParams({
        sha: headSha,
        since: cutoffAt,
        per_page: "100",
        page: String(page),
      });
      const response = await request(
        `https://api.github.com/repos/${repository}/commits?${query}`,
      );
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("GitHub REST returned malformed commit history");
      }
      return payload.map((entry) => {
        const committedAt =
          entry?.commit?.committer?.date ?? entry?.commit?.author?.date;
        if (
          !/^[0-9a-f]{40}$/i.test(entry?.sha) ||
          !Number.isFinite(new Date(committedAt).getTime()) ||
          !Array.isArray(entry?.parents)
        ) {
          throw new Error("GitHub REST returned malformed commit metadata");
        }
        return {
          sha: entry.sha.toLowerCase(),
          committedAt: new Date(committedAt).toISOString(),
          parentCount: entry.parents.length,
        };
      });
    },
    async fetchCommitFiles({ repository, sha, startPage = 1, maxPages = 3 }) {
      const files = [];
      for (let offset = 0; offset < maxPages; offset += 1) {
        const page = startPage + offset;
        const response = await request(
          `https://api.github.com/repos/${repository}/commits/${sha}?per_page=100&page=${page}`,
        );
        const payload = await response.json();
        if (!Array.isArray(payload?.files)) {
          throw new Error("GitHub REST returned malformed commit files");
        }
        for (const file of payload.files) {
          if (
            typeof file?.filename !== "string" ||
            !(
              file.patch === undefined ||
              file.patch === null ||
              typeof file.patch === "string"
            )
          ) {
            throw new Error("GitHub REST returned malformed commit file");
          }
          files.push({ filename: file.filename, patch: file.patch });
        }
        if (payload.files.length < 100) {
          return { files, nextPage: null };
        }
      }
      return { files, nextPage: startPage + maxPages };
    },
    async fetchRootLicenses({ repository, headSha }) {
      const response = await request(
        `https://api.github.com/repos/${repository}/contents?ref=${headSha}`,
      );
      const payload = await response.json();
      if (!Array.isArray(payload)) {
        throw new Error("GitHub REST returned malformed root contents");
      }
      const licenses = payload.filter(
        (entry) =>
          entry?.type === "file" &&
          typeof entry.path === "string" &&
          isRootLicense(entry.path),
      );
      const entry = licenses[0];
      if (!entry) return [];
      if (typeof entry.url !== "string") {
        throw new Error("GitHub REST returned malformed license content");
      }
      const content = await request(
        entry.url,
        "application/vnd.github.raw+json",
      );
      return [{ path: entry.path, content: await content.text() }];
    },
  };
}

export async function inspectApiActivity(input, options = {}) {
  const maxCommitInspections = options.maxCommitInspections ?? 40;
  if (!Number.isInteger(maxCommitInspections) || maxCommitInspections < 1) {
    throw new Error("API activity commit budget must be a positive integer");
  }
  const maxHistoryPages = options.maxHistoryPages ?? 25;
  if (!Number.isInteger(maxHistoryPages) || maxHistoryPages < 1) {
    throw new Error(
      "API activity history-page budget must be a positive integer",
    );
  }
  const defaultClient =
    typeof options.fetchCommitsPage === "function" &&
    typeof options.fetchCommitFiles === "function"
      ? null
      : githubActivityClient(options);
  const fetchCommitsPage =
    options.fetchCommitsPage ?? defaultClient.fetchCommitsPage;
  const fetchCommitFiles =
    options.fetchCommitFiles ?? defaultClient.fetchCommitFiles;
  const fetchRootLicenses =
    options.fetchRootLicenses ?? defaultClient?.fetchRootLicenses;

  const cutoffAt =
    input.scan?.cutoff_at ??
    new Date(
      new Date(input.now).getTime() - GIT_WINDOW_DAYS * DAY_MS,
    ).toISOString();
  const scan = input.scan ?? {
    head_sha: input.expectedHeadSha,
    cutoff_at: cutoffAt,
    next_page: 1,
    next_index: 0,
    resolved_weeks: [],
    pending_commit: null,
  };
  const knownActiveWeeks = new Set(
    normalizeSourceWeeks(input.activity.source_weeks, input.now).map(
      ({ week_start }) => week_start,
    ),
  );
  let activity = {
    ...structuredClone(input.activity),
    provisional_weeks: weekWindow(input.now).map((week) =>
      knownActiveWeeks.has(week),
    ),
    evidence_status: "provisional",
    baseline_completed_at: null,
  };
  const resolvedWeeks = new Set(scan.resolved_weeks);
  async function completedResult() {
    const licenseFiles =
      typeof fetchRootLicenses === "function"
        ? await fetchRootLicenses({
            repository: input.repository,
            headSha: scan.head_sha,
          })
        : [];
    return {
      complete: true,
      activity: {
        ...activity,
        evidence_head_sha: scan.head_sha,
        provisional_weeks: null,
        evidence_status: "complete",
        baseline_completed_at: new Date(input.now).toISOString(),
      },
      license: classifyRootLicense(licenseFiles),
      requestCount: defaultClient?.requestCount() ?? 0,
      scan: null,
    };
  }
  const activityWeeks = weekWindow(input.now);
  if (activityWeeks.every((week) => resolvedWeeks.has(week))) {
    return completedResult();
  }
  let inspected = 0;
  let page = scan.next_page;
  let nextIndex = scan.next_index;

  for (
    let pagesFetched = 0;
    pagesFetched < maxHistoryPages;
    pagesFetched += 1
  ) {
    const commits = await fetchCommitsPage({
      repository: input.repository,
      headSha: scan.head_sha,
      cutoffAt: scan.cutoff_at,
      page,
    });

    for (let index = nextIndex; index < commits.length; index += 1) {
      const entry = commits[index];
      const week = weekStartUtc(entry.committedAt);
      if (!resolvedWeeks.has(week)) {
        if (entry.parentCount > 1) continue;
        if (inspected >= maxCommitInspections) {
          return {
            complete: false,
            activity,
            license: null,
            requestCount: defaultClient?.requestCount() ?? 0,
            scan: {
              ...scan,
              next_page: page,
              next_index: index,
              resolved_weeks: [...resolvedWeeks].sort(),
              pending_commit: null,
            },
          };
        }
        inspected += 1;
        const pendingCommit =
          scan.pending_commit?.sha === entry.sha ? scan.pending_commit : null;
        const fetchedFiles = await fetchCommitFiles({
          repository: input.repository,
          sha: entry.sha,
          startPage: pendingCommit?.next_file_page ?? 1,
          maxPages: 3,
        });
        const files = Array.isArray(fetchedFiles)
          ? fetchedFiles
          : fetchedFiles.files;
        const nextFilePage = Array.isArray(fetchedFiles)
          ? null
          : fetchedFiles.nextPage;
        const classification = accumulateCommitClassification(
          files,
          pendingCommit,
        );
        if (classification.meaningful) {
          activity = activityWithExactSourceCommit(
            activity,
            entry.committedAt,
            input.now,
          );
          resolvedWeeks.add(week);
          if (activityWeeks.every((entry) => resolvedWeeks.has(entry))) {
            return completedResult();
          }
        } else if (nextFilePage !== null) {
          return {
            complete: false,
            activity,
            license: null,
            requestCount: defaultClient?.requestCount() ?? 0,
            scan: {
              ...scan,
              next_page: page,
              next_index: index,
              resolved_weeks: [...resolvedWeeks].sort(),
              pending_commit: {
                sha: entry.sha,
                committed_at: entry.committedAt,
                parent_count: entry.parentCount,
                next_file_page: nextFilePage,
                source_path_seen: classification.source_path_seen,
                substantive_patch_seen: classification.substantive_patch_seen,
                patch_incomplete: classification.patch_incomplete,
              },
            },
          };
        }
      }
    }

    if (commits.length < 100) {
      page = null;
      break;
    }
    page += 1;
    nextIndex = 0;
  }

  if (page !== null) {
    return {
      complete: false,
      activity,
      license: null,
      requestCount: defaultClient?.requestCount() ?? 0,
      scan: {
        ...scan,
        next_page: page,
        next_index: 0,
        resolved_weeks: [...resolvedWeeks].sort(),
        pending_commit: null,
      },
    };
  }

  return completedResult();
}

async function runGitDefault(cwd, args, options) {
  return execFile("git", args, { cwd, ...options });
}

function parseGitLog(output) {
  const commits = [];
  let current = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith("--TAVERNARY--")) {
      const [sha, committedAt, parents = ""] = line
        .slice("--TAVERNARY--".length)
        .split("\t");
      current = {
        sha,
        committedAt,
        parents: parents.split(" ").filter(Boolean),
        files: [],
      };
      commits.push(current);
    } else if (current && line.trim()) {
      current.files.push(line.trim());
    }
  }
  return commits;
}

async function cleanupDefault(temporaryRoot) {
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
    maxRetries: 3,
    retryDelay: 100,
  });
}

async function collectRootLicenses(runGit, cloneDirectory) {
  const names = stdout(
    await runGit(
      cloneDirectory,
      ["ls-tree", "--name-only", "HEAD"],
      GIT_OPTIONS,
    ),
  )
    .split(/\r?\n/)
    .filter(isRootLicense);
  return Promise.all(
    names.map(async (path) => ({
      path,
      content: stdout(
        await runGit(cloneDirectory, ["show", `HEAD:${path}`], GIT_OPTIONS),
      ),
    })),
  );
}

export async function inspectGitBaseline(input, options = {}) {
  const runGit = options.runGit ?? runGitDefault;
  const makeTemporaryRoot =
    options.makeTemporaryRoot ??
    (() => mkdtemp(resolve(tmpdir(), "tavernary-inspection-")));
  const cleanup = options.cleanup ?? cleanupDefault;
  const now = new Date(input.now);
  if (!Number.isFinite(now.getTime())) {
    throw new Error(`Invalid activity timestamp: ${input.now}`);
  }
  const nowIso = now.toISOString();
  const cutoffIso = new Date(
    now.getTime() - GIT_WINDOW_DAYS * DAY_MS,
  ).toISOString();
  const headCommittedAt = new Date(input.headCommittedAt);
  if (!Number.isFinite(headCommittedAt.getTime())) {
    throw new Error(`Invalid head commit timestamp: ${input.headCommittedAt}`);
  }
  if (!/^[0-9a-f]{40}$/i.test(input.expectedHeadSha)) {
    throw new Error(`Invalid expected Git head: ${input.expectedHeadSha}`);
  }
  const cloneBoundary =
    headCommittedAt.getTime() < new Date(cutoffIso).getTime()
      ? "--depth=1"
      : `--shallow-since=${cutoffIso}`;
  const temporaryRoot = await makeTemporaryRoot();
  const cloneDirectory = resolve(temporaryRoot, "repository");

  try {
    await runGit(
      temporaryRoot,
      [
        "clone",
        "--quiet",
        "--filter=blob:none",
        "--no-checkout",
        cloneBoundary,
        "--single-branch",
        "--branch",
        input.defaultBranch,
        `https://github.com/${input.repository}.git`,
        cloneDirectory,
      ],
      GIT_OPTIONS,
    );
    const clonedHead = stdout(
      await runGit(cloneDirectory, ["rev-parse", "HEAD"], GIT_OPTIONS),
    ).trim();
    if (clonedHead.toLowerCase() !== input.expectedHeadSha.toLowerCase()) {
      throw new Error(
        `${input.repository}: default branch advanced after observation`,
      );
    }
    const logOutput = stdout(
      await runGit(
        cloneDirectory,
        [
          "log",
          "-w",
          `--since=${cutoffIso}`,
          "--format=--TAVERNARY--%H%x09%cI%x09%P",
          "--name-only",
          "--no-renames",
        ],
        GIT_OPTIONS,
      ),
    );
    const commits = parseGitLog(logOutput);
    const sourceCommits = commits
      .filter(
        (commit) =>
          classifyCommit(commit.files, {
            mergeOnly: commit.parents.length > 1,
          }) === "meaningful",
      )
      .map(({ committedAt }) => committedAt);
    const licenseFiles = await collectRootLicenses(runGit, cloneDirectory);

    return {
      activity: completeBaseline(input.activity, {
        now: nowIso,
        completedAt: nowIso,
        sourceCommits,
      }),
      license: classifyRootLicense(licenseFiles),
      sourceCommitCount: sourceCommits.length,
      cutoffIso,
    };
  } finally {
    await cleanup(temporaryRoot);
  }
}

export async function mapConcurrent(items, limit, worker) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 3) {
    throw new Error("Git inspection concurrency must be between 1 and 3");
  }
  const results = Array.from({ length: items.length });
  let nextIndex = 0;

  async function runWorker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = {
          status: "fulfilled",
          value: await worker(items[index], index),
        };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runWorker()),
  );
  return results;
}
