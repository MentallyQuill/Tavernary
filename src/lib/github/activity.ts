const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;
const DORMANT_AFTER_MS = 84 * DAY_MS;

const documentationExtensions = new Set([
  ".adoc",
  ".markdown",
  ".md",
  ".mdx",
  ".rst",
]);
const documentationNames =
  /^(?:authors|changelog|code_of_conduct|contributing|license|readme|security)(?:\.[^.]+)?$/i;
const lockfileNames =
  /^(?:bun\.lockb?|cargo\.lock|composer\.lock|gemfile\.lock|package-lock\.json|pnpm-lock\.yaml|poetry\.lock|uv\.lock|yarn\.lock)$/i;
const excludedDirectories = new Set([
  "coverage",
  "dist",
  "generated",
  "node_modules",
  "vendor",
]);

export interface CommitFixture {
  sha: string;
  committedAt: string;
  files: string[];
  mergeOnly?: boolean;
  patch?: string | null;
}

export interface ActivityResult {
  latestMeaningfulCommitAt: string | null;
  weeklyMeaningfulCommits: [
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  activeWeeks12: number;
  strength: number;
  dormant: boolean;
}

function extension(path: string) {
  const filename = path.split("/").at(-1) ?? "";
  const index = filename.lastIndexOf(".");
  return index < 0 ? "" : filename.slice(index).toLowerCase();
}

function isExcludedPath(path: string) {
  const normalized = path.replaceAll("\\", "/").replace(/^\.?\//, "");
  const parts = normalized.split("/");
  const filename = parts.at(-1) ?? "";

  return (
    parts.slice(0, -1).some((part) => excludedDirectories.has(part)) ||
    parts[0]?.toLowerCase() === "docs" ||
    documentationExtensions.has(extension(normalized)) ||
    documentationNames.test(filename) ||
    lockfileNames.test(filename)
  );
}

function patchHasSubstantiveChange(patch: string) {
  return patch.split(/\r?\n/).some((line) => {
    if (
      (!line.startsWith("+") && !line.startsWith("-")) ||
      line.startsWith("+++") ||
      line.startsWith("---")
    ) {
      return false;
    }
    return line.slice(1).trim().length > 0;
  });
}

export function classifyCommit(
  files: string[],
  options: Pick<CommitFixture, "mergeOnly" | "patch"> = {},
): "meaningful" | "excluded" {
  if (options.mergeOnly || files.length === 0) {
    return "excluded";
  }
  if (options.patch !== undefined && options.patch !== null) {
    if (!patchHasSubstantiveChange(options.patch)) {
      return "excluded";
    }
  }
  return files.some((file) => !isExcludedPath(file))
    ? "meaningful"
    : "excluded";
}

export function calculateActivity(input: {
  now: string;
  commits: CommitFixture[];
}): ActivityResult {
  const now = new Date(input.now).getTime();
  if (!Number.isFinite(now)) {
    throw new Error(`Invalid activity timestamp: ${input.now}`);
  }

  const meaningful = input.commits
    .filter(
      (commit) =>
        classifyCommit(commit.files, commit) === "meaningful" &&
        Number.isFinite(new Date(commit.committedAt).getTime()),
    )
    .sort(
      (left, right) =>
        new Date(right.committedAt).getTime() -
        new Date(left.committedAt).getTime(),
    );

  const weeklyMeaningfulCommits = Array.from(
    { length: 12 },
    () => 0,
  ) as ActivityResult["weeklyMeaningfulCommits"];

  for (const commit of meaningful) {
    const age = now - new Date(commit.committedAt).getTime();
    const weekNumber = Math.floor(age / WEEK_MS);
    if (weekNumber >= 0 && weekNumber < weeklyMeaningfulCommits.length) {
      weeklyMeaningfulCommits[weekNumber] += 1;
    }
  }

  const strength = weeklyMeaningfulCommits.reduce(
    (total, commitCount, weekNumber) =>
      total +
      (commitCount > 0 ? (12 - weekNumber) * 100 : 0) +
      Math.min(commitCount, 5),
    0,
  );
  const latestMeaningfulCommitAt = meaningful[0]
    ? new Date(meaningful[0].committedAt).toISOString()
    : null;
  const latestAge = latestMeaningfulCommitAt
    ? now - new Date(latestMeaningfulCommitAt).getTime()
    : Number.POSITIVE_INFINITY;

  return {
    latestMeaningfulCommitAt,
    weeklyMeaningfulCommits,
    activeWeeks12: weeklyMeaningfulCommits.filter((count) => count > 0).length,
    strength,
    dormant: latestAge > DORMANT_AFTER_MS,
  };
}
