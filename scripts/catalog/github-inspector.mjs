import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { classifyCommit } from "../../src/lib/github/activity.ts";
import { classifyRootLicense } from "../../src/lib/github/license.ts";
import { completeBaseline } from "./activity-evidence.mjs";

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
    comparison.files.every(({ filename }) => typeof filename === "string")
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
        error.status >= 500;
      if (retryable && attempt < maxRetries) {
        logger.log("Retrying GitHub compare request");
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
  const sourceBearing = classifyCommit(files) === "meaningful";
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
        `--shallow-since=${cutoffIso}`,
        "--single-branch",
        "--branch",
        input.defaultBranch,
        `https://github.com/${input.repository}.git`,
        cloneDirectory,
      ],
      GIT_OPTIONS,
    );
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
