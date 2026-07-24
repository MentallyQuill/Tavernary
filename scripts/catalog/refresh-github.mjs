import { execFile as execFileCallback } from "node:child_process";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

import { format } from "prettier";

import {
  calculateActivity,
  classifyCommit,
} from "../../src/lib/github/activity.ts";
import { classifyRootLicense } from "../../src/lib/github/license.ts";
import { calculateCommunity } from "../../src/lib/github/repository-metrics.ts";

const execFile = promisify(execFileCallback);
const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const snapshotDirectory = resolve(rootDirectory, "data/snapshots/github");
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

function snapshotPath(projectId) {
  return resolve(snapshotDirectory, `${projectId}.json`);
}

async function readPriorSnapshot(projectId) {
  try {
    return await readJson(snapshotPath(projectId));
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function writeSnapshot(projectId, snapshot) {
  await access(snapshotDirectory).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(snapshotDirectory, { recursive: true });
  });
  const path = snapshotPath(projectId);
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, await formatSnapshot(snapshot));
  await rename(temporaryPath, path);
}

export async function formatSnapshot(snapshot) {
  return format(JSON.stringify(snapshot), {
    parser: "json",
    filepath: "snapshot.json",
  });
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "Tavernary-catalog-refresh",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function github(path, { optional = false } = {}) {
  const response = await fetch(`${githubApi}${path}`, {
    headers: githubHeaders(),
  });
  if (optional && response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    error.rateLimited =
      response.status === 403 &&
      (response.headers.get("x-ratelimit-remaining") === "0" ||
        response.headers.get("retry-after") !== null);
    throw error;
  }
  return response.json();
}

async function git(cwd, args) {
  const result = await execFile("git", args, {
    cwd,
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return result.stdout.trim();
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

async function collectCommits(cloneDirectory) {
  const output = await git(cloneDirectory, [
    "log",
    "-w",
    "--format=--TAVERNARY--%H%x09%cI%x09%P",
    "--name-only",
    "--no-renames",
  ]);
  return parseGitLog(output).map((commit) => ({
    ...commit,
    mergeOnly: commit.parents.length > 1,
  }));
}

async function rootLicenseFiles(cloneDirectory) {
  const names = (
    await git(cloneDirectory, ["ls-tree", "--name-only", "HEAD"])
  ).split(/\r?\n/);
  const licenseNames = names.filter((name) =>
    /^(?:licen[cs]e|copying)(?:[._-].*)?$/i.test(name),
  );
  return Promise.all(
    licenseNames.map(async (path) => ({
      path,
      content: await git(cloneDirectory, ["show", `HEAD:${path}`]),
    })),
  );
}

async function inspectRepositoryHistory(repository, defaultBranch, now) {
  const temporaryRoot = await mkdtemp(resolve(tmpdir(), "tavernary-refresh-"));
  const cloneDirectory = resolve(temporaryRoot, "repository");
  try {
    await git(temporaryRoot, [
      "clone",
      "--quiet",
      "--filter=blob:none",
      "--no-checkout",
      "--depth=500",
      "--single-branch",
      "--branch",
      defaultBranch,
      `https://github.com/${repository}.git`,
      cloneDirectory,
    ]);
    const [headSha, commits, licenseFiles] = await Promise.all([
      git(cloneDirectory, ["rev-parse", "HEAD"]),
      collectCommits(cloneDirectory),
      rootLicenseFiles(cloneDirectory),
    ]);
    return {
      headSha,
      activity: calculateActivity({ now, commits }),
      license: classifyRootLicense(licenseFiles),
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function resolveHeadSha(repository, defaultBranch) {
  const output = await git(rootDirectory, [
    "ls-remote",
    `https://github.com/${repository}.git`,
    `refs/heads/${defaultBranch}`,
  ]);
  const [headSha] = output.split(/\s+/);
  if (!/^[0-9a-f]{40}$/.test(headSha)) {
    throw new Error(`Could not resolve ${repository} ${defaultBranch}`);
  }
  return headSha;
}

function emptyActivity() {
  return {
    latest_meaningful_commit_at: null,
    weekly_meaningful_commits: Array.from({ length: 12 }, () => 0),
    active_weeks_12: 0,
    strength: 0,
    dormant: true,
    latest_release_at: null,
  };
}

function generatedActivity(activity, latestReleaseAt) {
  return {
    latest_meaningful_commit_at: activity.latestMeaningfulCommitAt,
    weekly_meaningful_commits: activity.weeklyMeaningfulCommits,
    active_weeks_12: activity.activeWeeks12,
    strength: activity.strength,
    dormant: activity.dormant,
    latest_release_at: latestReleaseAt,
  };
}

function generatedLicense(license) {
  return {
    status: license.status,
    spdx_id: license.spdxId,
    source_path: license.sourcePath,
  };
}

function repositoryFacts(repository, headSha) {
  return {
    id: repository.id,
    owner: repository.owner.login,
    name: repository.name,
    url: repository.html_url,
    default_branch: repository.default_branch,
    head_sha: headSha,
    archived: repository.archived,
    created_at: repository.created_at,
    size_kb: repository.size,
  };
}

async function preserveFailure(record, prior, error, now) {
  if (!prior) {
    throw error;
  }
  const snapshot = snapshotForFailure(prior, error, now);
  await writeSnapshot(record.id, snapshot);
  return snapshot;
}

export function snapshotForFailure(prior, error, now) {
  return {
    ...prior,
    source_health: error.status === 404 ? "unavailable" : prior.source_health,
    stale_since: prior.stale_since ?? now,
  };
}

export function identityChangeSnapshot({ record, repository, previous, now }) {
  return {
    schema_version: 1,
    project_id: record.id,
    repository: repositoryFacts(
      repository,
      previous?.repository.head_sha ?? "0".repeat(40),
    ),
    source_health: "identity-change",
    activity: previous?.activity ?? emptyActivity(),
    community: calculateCommunity({
      stargazersCount: repository.stargazers_count,
      forksCount: repository.forks_count,
      subscribersCount: repository.subscribers_count,
    }),
    license: previous?.license ?? {
      status: "missing",
      spdx_id: null,
      source_path: null,
    },
    refreshed_at: now,
    stale_since: previous?.stale_since ?? now,
  };
}

export async function refreshProject(record, options = {}) {
  if (record.source.type !== "github") {
    throw new Error(`${record.id}: refresh requires a GitHub source`);
  }
  if (record.refresh_policy === "paused") {
    return null;
  }

  const now = new Date(options.now ?? Date.now()).toISOString();
  const prior = await readPriorSnapshot(record.id);

  try {
    const repository = await github(`/repos/${record.source.repository}`);
    if (repository.id !== record.source.repository_id) {
      const snapshot = identityChangeSnapshot({
        record,
        repository,
        previous: prior,
        now,
      });
      await writeSnapshot(record.id, snapshot);
      return snapshot;
    }

    const release = await github(
      `/repos/${record.source.repository}/releases/latest`,
      { optional: true },
    );
    const headSha = await resolveHeadSha(
      record.source.repository,
      repository.default_branch,
    );
    const unchanged = prior?.repository.head_sha === headSha;
    const history = unchanged
      ? null
      : await inspectRepositoryHistory(
          record.source.repository,
          repository.default_branch,
          now,
        );
    const snapshot = {
      schema_version: 1,
      project_id: record.id,
      repository: repositoryFacts(repository, headSha),
      source_health: "healthy",
      activity: unchanged
        ? {
            ...prior.activity,
            latest_meaningful_commit_at:
              prior.activity.latest_meaningful_commit_at === null
                ? null
                : new Date(
                    prior.activity.latest_meaningful_commit_at,
                  ).toISOString(),
            latest_release_at: release?.published_at ?? null,
          }
        : generatedActivity(history.activity, release?.published_at ?? null),
      community: calculateCommunity({
        stargazersCount: repository.stargazers_count,
        forksCount: repository.forks_count,
        subscribersCount: repository.subscribers_count,
      }),
      license: unchanged ? prior.license : generatedLicense(history.license),
      refreshed_at: now,
      stale_since: null,
    };
    await writeSnapshot(record.id, snapshot);
    return snapshot;
  } catch (error) {
    return preserveFailure(record, prior, error, now);
  }
}

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

async function main() {
  const records = (await readRecords()).filter(
    (record) =>
      record.source.type === "github" && record.refresh_policy === "automatic",
  );
  const projectId = argument("--project-id");
  const mode = argument("--mode", "incremental");
  let selected;

  if (projectId) {
    selected = records.filter((record) => record.id === projectId);
    if (selected.length === 0) {
      throw new Error(`Unknown refreshable project: ${projectId}`);
    }
  } else if (mode === "backfill") {
    const startIndex = Number.parseInt(argument("--start-index", "0"), 10);
    const batchSize = Number.parseInt(argument("--batch-size", "20"), 10);
    selected = records.slice(startIndex, startIndex + batchSize);
  } else if (mode === "incremental") {
    selected = records;
  } else {
    throw new Error(`Unknown refresh mode: ${mode}`);
  }

  for (const record of selected) {
    const snapshot = await refreshProject(record);
    if (snapshot) {
      console.log(
        `${record.id}: ${snapshot.source_health} at ${snapshot.refreshed_at}`,
      );
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
