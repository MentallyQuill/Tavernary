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
