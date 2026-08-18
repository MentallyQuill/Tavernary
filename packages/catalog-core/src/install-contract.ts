import type { InstallContract } from "./catalog-types";

const contractKeys = [
  "branch",
  "folderName",
  "kind",
  "manifestPath",
  "repositoryUrl",
].sort();
const safeFolderName = /^[A-Za-z0-9._-]+$/u;

export class InstallContractValidationError extends Error {
  readonly field: keyof InstallContract | "contract";

  constructor(field: keyof InstallContract | "contract", message: string) {
    super(message);
    this.name = "InstallContractValidationError";
    this.field = field;
  }
}

export function parseInstallContract(value: unknown): InstallContract {
  if (!isRecord(value)) {
    throw new InstallContractValidationError(
      "contract",
      "Install contract must be an object.",
    );
  }
  const keys = Object.keys(value).sort();
  if (
    keys.length !== contractKeys.length ||
    keys.some((key, index) => key !== contractKeys[index])
  ) {
    throw new InstallContractValidationError(
      "contract",
      "Install contract keys do not match schema 7.",
    );
  }
  if (value.kind !== "sillytavern-extension-git") {
    throw new InstallContractValidationError(
      "kind",
      "Install kind is unsupported.",
    );
  }
  if (value.manifestPath !== "manifest.json") {
    throw new InstallContractValidationError(
      "manifestPath",
      "SillyTavern manifests must be at the repository root.",
    );
  }
  const repositoryUrl = parseRepositoryUrl(value.repositoryUrl);
  const branch = parseBranch(value.branch);
  const folderName = parseFolderName(value.folderName);

  return {
    kind: "sillytavern-extension-git",
    repositoryUrl,
    branch,
    manifestPath: "manifest.json",
    folderName,
  };
}

function parseRepositoryUrl(value: unknown): string {
  if (typeof value !== "string" || containsControl(value)) {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL is invalid.",
    );
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL is invalid.",
    );
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL must use HTTP or HTTPS.",
    );
  }
  if (url.username || url.password) {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL cannot contain credentials.",
    );
  }
  if (url.search || url.hash) {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL cannot contain a query or fragment.",
    );
  }

  const decodedPath = decodeRepositoryPath(rawUrlPath(value));
  const segments = decodedPath.split("/").filter(Boolean);
  if (
    !url.hostname ||
    decodedPath.includes("\\") ||
    decodedPath.includes("//") ||
    segments.length < 2 ||
    segments.some((segment) => segment === "." || segment === "..") ||
    !segments.at(-1)?.endsWith(".git")
  ) {
    throw new InstallContractValidationError(
      "repositoryUrl",
      "Repository URL must identify a .git repository.",
    );
  }

  return url.href;
}

function decodeRepositoryPath(rawPath: string): string {
  let current = rawPath;
  for (let depth = 0; depth < 8; depth += 1) {
    if (/%(?:2f|5c)/iu.test(current)) {
      throw new InstallContractValidationError(
        "repositoryUrl",
        "Repository URL cannot contain encoded separators.",
      );
    }
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      throw new InstallContractValidationError(
        "repositoryUrl",
        "Repository URL path encoding is invalid.",
      );
    }
    if (containsControl(next)) {
      throw new InstallContractValidationError(
        "repositoryUrl",
        "Repository URL path contains control characters.",
      );
    }
    if (next === current) return next;
    current = next;
  }
  throw new InstallContractValidationError(
    "repositoryUrl",
    "Repository URL path encoding is excessive.",
  );
}

function parseBranch(value: unknown): string | null {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 255 ||
    containsControl(value) ||
    /[ ~^:?*\[\\]/u.test(value) ||
    value.includes("..") ||
    value.includes("@{") ||
    value.includes("//") ||
    value.startsWith("-") ||
    value.startsWith("/") ||
    value.endsWith("/") ||
    value.endsWith(".")
  ) {
    throw new InstallContractValidationError(
      "branch",
      "Branch name is invalid.",
    );
  }
  return value;
}

function parseFolderName(value: unknown): string {
  if (
    typeof value !== "string" ||
    !safeFolderName.test(value) ||
    value === "." ||
    value === ".."
  ) {
    throw new InstallContractValidationError(
      "folderName",
      "Install folder name is unsafe.",
    );
  }
  return value;
}

function rawUrlPath(value: string): string {
  const match = /^[a-z]+:\/\/[^/]*(\/[^?#]*)/iu.exec(value);
  return match?.[1] ?? "";
}

function containsControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
