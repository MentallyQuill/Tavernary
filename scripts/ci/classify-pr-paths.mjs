import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const contentPatterns = [
  /^data\/registry\/projects\/[^/]+\.json$/u,
  /^data\/registry\/sources\/[^/]+\.json$/u,
  /^data\/registry\/kits\/[^/]+\.json$/u,
  /^data\/snapshots\/github\/[^/]+\.json$/u,
  /^data\/snapshots\/codeberg\/[^/]+\.json$/u,
  /^data\/snapshots\/github\/kits\/[^/]+\.json$/u,
  /^data\/snapshots\/github-refresh\.json$/u,
];

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function classifyPullRequestPaths(paths) {
  const normalized = [...paths].map((path) => normalizePath(String(path)));
  if (normalized.length === 0) {
    return { route: "full", reason: "empty-diff" };
  }

  for (const path of normalized) {
    if (
      !path ||
      path.trim() !== path ||
      path.startsWith("/") ||
      path.split("/").includes("..") ||
      path.includes("\0")
    ) {
      return { route: "full", reason: "invalid-path", path };
    }
    if (!contentPatterns.some((pattern) => pattern.test(path))) {
      return { route: "full", reason: "full-path", path };
    }
  }

  return { route: "content", reason: "content-only" };
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 2 || argv[0] !== "--paths-file") {
    throw new Error("Usage: classify-pr-paths.mjs --paths-file <file>");
  }

  const buffer = await readFile(argv[1]);
  const paths = buffer
    .toString("utf8")
    .split("\0")
    .filter((path, index, all) => path.length > 0 || index < all.length - 1);
  process.stdout.write(classifyPullRequestPaths(paths).route);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
