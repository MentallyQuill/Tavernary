import { createHash, randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const repositoryRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export function evidenceDirectory(root, source) {
  if (!isRepositorySource(source)) {
    throw new Error("Evidence requires a GitHub or Codeberg repository source");
  }
  return resolve(root, source.type, String(source.repository_id));
}

function isRepositorySource(source) {
  return (
    (source.type === "github" || source.type === "codeberg") &&
    Number.isSafeInteger(source.repository_id) &&
    source.repository_id > 0
  );
}

export function parseEvidenceArguments(arguments_) {
  const selection = {
    all: false,
    sourceIds: [],
    projectIds: [],
  };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--all") {
      selection.all = true;
      continue;
    }
    if (argument === "--source" || argument === "--project") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${argument}`);
      }
      if (argument === "--source") {
        selection.sourceIds.push(value);
      } else {
        selection.projectIds.push(value);
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (
    selection.all &&
    (selection.sourceIds.length > 0 || selection.projectIds.length > 0)
  ) {
    throw new Error("--all cannot be combined with --source or --project");
  }
  if (
    !selection.all &&
    selection.sourceIds.length === 0 &&
    selection.projectIds.length === 0
  ) {
    throw new Error("Choose --all, --source <id>, or --project <id>");
  }

  return selection;
}

export function selectEvidenceSources({ sources, projects, selection }) {
  if (selection.all) {
    return sources.filter(isRepositorySource);
  }

  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const projectsById = new Map(
    projects.map((project) => [project.id, project]),
  );
  const selectedIds = new Set();

  for (const sourceId of selection.sourceIds) {
    const source = sourcesById.get(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }
    if (!isRepositorySource(source)) {
      throw new Error(`Source ${sourceId} is not a repository evidence source`);
    }
    selectedIds.add(sourceId);
  }

  for (const projectId of selection.projectIds) {
    const project = projectsById.get(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }
    const source = sourcesById.get(project.source_id);
    if (!source || !isRepositorySource(source)) {
      throw new Error(`Project ${projectId} has no repository evidence source`);
    }
    selectedIds.add(source.id);
  }

  return sources.filter((source) => selectedIds.has(source.id));
}

function repositoryEndpoint(source) {
  const parts = source.repository.split("/");
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || part === "." || part === "..")
  ) {
    throw new Error(`Invalid repository location for ${source.id}`);
  }
  return parts.map((part) => encodeURIComponent(part)).join("/");
}

async function githubApi(endpoint) {
  try {
    const { stdout } = await execFileAsync("gh", ["api", endpoint], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    return JSON.parse(stdout);
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "stderr" in error &&
      typeof error.stderr === "string" &&
      /\bHTTP 404\b/u.test(error.stderr)
    ) {
      return null;
    }
    throw error;
  }
}

async function codebergApi(endpoint) {
  const response = await fetch(`https://codeberg.org/api/v1/${endpoint}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Tavernary-catalog-evidence",
    },
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Codeberg request failed with status ${response.status}`);
  }
  return response.json();
}

function decodeReadmeContent(readme, sourceId) {
  if (
    !readme ||
    readme.encoding !== "base64" ||
    typeof readme.content !== "string"
  ) {
    throw new Error(`README content is not base64 for ${sourceId}`);
  }
  return Buffer.from(readme.content.replace(/\s/gu, ""), "base64");
}

async function fetchGitHubEvidence(input, options) {
  const endpoint = repositoryEndpoint(input.source);
  const repository = await options.githubApi(`repos/${endpoint}`);
  if (repository === null) {
    throw new Error(`GitHub repository unavailable: ${input.source.id}`);
  }
  if (repository.id !== input.source.repository_id) {
    throw new Error(`GitHub repository identity changed: ${input.source.id}`);
  }
  if (typeof repository.default_branch !== "string") {
    throw new Error(`GitHub default branch unavailable: ${input.source.id}`);
  }

  const defaultBranch = repository.default_branch;
  const commit = await options.githubApi(
    `repos/${endpoint}/commits/${encodeURIComponent(defaultBranch)}`,
  );
  if (!commit || !/^[0-9a-f]{40}$/u.test(commit.sha ?? "")) {
    throw new Error(`GitHub branch head unavailable: ${input.source.id}`);
  }
  if (commit.sha === input.commitSha) {
    return { status: "unchanged", checkedAt: options.clock() };
  }

  const readme = await options.githubApi(
    `repos/${endpoint}/readme?ref=${encodeURIComponent(commit.sha)}`,
  );
  if (readme === null) {
    return {
      status: "missing",
      repositoryDescription: repository.description?.trim() || null,
    };
  }
  if (
    typeof readme.name !== "string" ||
    typeof readme.path !== "string" ||
    typeof readme.download_url !== "string"
  ) {
    throw new Error(`GitHub README metadata is invalid: ${input.source.id}`);
  }

  return {
    status: "fetched",
    readmeFilename: readme.name,
    readmeBytes: decodeReadmeContent(readme, input.source.id),
    readmePath: readme.path,
    downloadUrl: readme.download_url,
    repositoryDescription: repository.description?.trim() || null,
    defaultBranch,
    commitSha: commit.sha,
    etag: typeof readme.sha === "string" ? `blob:${readme.sha}` : null,
  };
}

async function fetchCodebergEvidence(input, options) {
  const endpoint = repositoryEndpoint(input.source);
  const repository = await options.codebergApi(`repos/${endpoint}`);
  if (repository === null) {
    throw new Error(`Codeberg repository unavailable: ${input.source.id}`);
  }
  if (repository.id !== input.source.repository_id) {
    throw new Error(`Codeberg repository identity changed: ${input.source.id}`);
  }
  if (typeof repository.default_branch !== "string") {
    throw new Error(`Codeberg default branch unavailable: ${input.source.id}`);
  }

  const defaultBranch = repository.default_branch;
  const commits = await options.codebergApi(
    `repos/${endpoint}/commits?sha=${encodeURIComponent(defaultBranch)}&page=1&limit=1`,
  );
  const commit = Array.isArray(commits) ? commits[0] : null;
  if (!commit || !/^[0-9a-f]{40}$/u.test(commit.sha ?? "")) {
    throw new Error(`Codeberg branch head unavailable: ${input.source.id}`);
  }
  if (commit.sha === input.commitSha) {
    return { status: "unchanged", checkedAt: options.clock() };
  }

  const rootContents = await options.codebergApi(
    `repos/${endpoint}/contents?ref=${encodeURIComponent(commit.sha)}`,
  );
  const readme = (Array.isArray(rootContents) ? rootContents : []).find(
    (entry) =>
      entry.type === "file" &&
      /^readme(?:\.[a-z0-9._-]+)?$/iu.test(entry.name ?? entry.path ?? ""),
  );
  if (!readme) {
    return {
      status: "missing",
      repositoryDescription: repository.description?.trim() || null,
    };
  }

  const readmePath = String(readme.path)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const content = await options.codebergApi(
    `repos/${endpoint}/contents/${readmePath}?ref=${encodeURIComponent(commit.sha)}`,
  );
  if (
    content === null ||
    typeof content.name !== "string" ||
    typeof content.path !== "string" ||
    typeof content.download_url !== "string"
  ) {
    throw new Error(`Codeberg README metadata is invalid: ${input.source.id}`);
  }

  return {
    status: "fetched",
    readmeFilename: content.name,
    readmeBytes: decodeReadmeContent(content, input.source.id),
    readmePath: content.path,
    downloadUrl: content.download_url,
    repositoryDescription: repository.description?.trim() || null,
    defaultBranch,
    commitSha: commit.sha,
    etag: typeof content.sha === "string" ? `blob:${content.sha}` : null,
  };
}

export function createEvidenceAdapter(options = {}) {
  const resolvedOptions = {
    githubApi: options.githubApi ?? githubApi,
    codebergApi: options.codebergApi ?? codebergApi,
    clock: options.clock ?? (() => new Date().toISOString()),
  };
  return {
    async fetch(input) {
      if (input.source.type === "github") {
        return fetchGitHubEvidence(input, resolvedOptions);
      }
      return fetchCodebergEvidence(input, resolvedOptions);
    },
  };
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readSourceMetadata(root, source) {
  try {
    return JSON.parse(
      await readFile(
        resolve(evidenceDirectory(root, source), "source.json"),
        "utf8",
      ),
    );
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }
    throw error;
  }
}

async function writeMetadataAtomically(directory, metadata) {
  const metadataPath = resolve(directory, "source.json");
  const temporaryPath = `${metadataPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporaryPath, `${JSON.stringify(metadata, null, 2)}\n`);
    await rename(temporaryPath, metadataPath);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function replaceDirectoryAtomically(temporaryDirectory, directory) {
  const backupDirectory = `${directory}.${randomUUID()}.backup`;
  let hasBackup = false;
  try {
    await rename(directory, backupDirectory);
    hasBackup = true;
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  try {
    await rename(temporaryDirectory, directory);
  } catch (error) {
    if (hasBackup) {
      await rename(backupDirectory, directory);
    }
    throw error;
  }

  if (hasBackup) {
    await rm(backupDirectory, { recursive: true, force: true });
  }
}

async function writeFetchedEvidence({ root, source, fetched, fetchedAt }) {
  const directory = evidenceDirectory(root, source);
  const temporaryDirectory = `${directory}.${randomUUID()}.tmp`;
  const readmeFilename = basename(fetched.readmeFilename);
  const metadata = {
    schema_version: 1,
    provider: source.type,
    source_id: source.id,
    repository_id: source.repository_id,
    repository: source.repository,
    default_branch: fetched.defaultBranch,
    readme_path: fetched.readmePath,
    readme_filename: readmeFilename,
    download_url: fetched.downloadUrl,
    commit_sha: fetched.commitSha,
    etag: fetched.etag,
    content_sha256: sha256(fetched.readmeBytes),
    repository_description: fetched.repositoryDescription,
    fetched_at: fetchedAt,
    outcome: "fetched",
  };

  await mkdir(temporaryDirectory, { recursive: true });
  try {
    await Promise.all([
      writeFile(
        resolve(temporaryDirectory, readmeFilename),
        fetched.readmeBytes,
      ),
      writeFile(
        resolve(temporaryDirectory, "source.json"),
        `${JSON.stringify(metadata, null, 2)}\n`,
      ),
    ]);
    await mkdir(dirname(directory), { recursive: true });
    await replaceDirectoryAtomically(temporaryDirectory, directory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

async function writeMissingEvidence({ root, source, missing, fetchedAt }) {
  const directory = evidenceDirectory(root, source);
  const temporaryDirectory = `${directory}.${randomUUID()}.tmp`;
  const metadata = {
    schema_version: 1,
    provider: source.type,
    source_id: source.id,
    repository_id: source.repository_id,
    repository: source.repository,
    readme_path: null,
    readme_filename: null,
    download_url: null,
    commit_sha: null,
    etag: null,
    content_sha256: null,
    repository_description: missing.repositoryDescription,
    fetched_at: fetchedAt,
    outcome: "missing",
  };

  await mkdir(temporaryDirectory, { recursive: true });
  try {
    await writeFile(
      resolve(temporaryDirectory, "source.json"),
      `${JSON.stringify(metadata, null, 2)}\n`,
    );
    await mkdir(dirname(directory), { recursive: true });
    await replaceDirectoryAtomically(temporaryDirectory, directory);
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
}

export async function refreshCatalogEvidence({
  root,
  sources,
  adapter,
  clock = () => new Date().toISOString(),
}) {
  const report = {
    fetched: 0,
    unchanged: 0,
    missing: 0,
    failed: 0,
    entries: [],
  };
  for (const source of sources) {
    try {
      const previousMetadata = await readSourceMetadata(root, source);
      const result = await adapter.fetch({
        source,
        etag: previousMetadata?.etag ?? null,
        commitSha: previousMetadata?.commit_sha ?? null,
      });
      if (result.status === "fetched") {
        await writeFetchedEvidence({
          root,
          source,
          fetched: result,
          fetchedAt: clock(),
        });
        report.fetched += 1;
      } else if (result.status === "unchanged") {
        if (previousMetadata === null) {
          throw new Error(
            `Source ${source.id} returned unchanged without stored evidence`,
          );
        }
        await writeMetadataAtomically(evidenceDirectory(root, source), {
          ...previousMetadata,
          checked_at: result.checkedAt,
          outcome: "unchanged",
        });
        report.unchanged += 1;
      } else if (result.status === "missing") {
        await writeMissingEvidence({
          root,
          source,
          missing: result,
          fetchedAt: clock(),
        });
        report.missing += 1;
      }
      report.entries.push({ sourceId: source.id, status: result.status });
    } catch (error) {
      report.failed += 1;
      report.entries.push({
        sourceId: source.id,
        status: "failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return report;
}

async function readJsonDirectory(directory) {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

async function loadEvidenceRegistry(root) {
  const [sources, projects] = await Promise.all([
    readJsonDirectory(resolve(root, "data/registry/sources")),
    readJsonDirectory(resolve(root, "data/registry/projects")),
  ]);
  return { sources, projects };
}

export async function runCatalogEvidenceCli(arguments_, options = {}) {
  const selection = parseEvidenceArguments(arguments_);
  const activeRepositoryRoot = options.repositoryRoot ?? repositoryRoot;
  const registryContext =
    options.registryContext ??
    (await loadEvidenceRegistry(activeRepositoryRoot));
  const sources = selectEvidenceSources({
    sources: registryContext.sources,
    projects: registryContext.projects,
    selection,
  });
  const report = await refreshCatalogEvidence({
    root:
      options.root ??
      resolve(activeRepositoryRoot, "local-data/catalog-evidence"),
    sources,
    adapter: options.adapter ?? createEvidenceAdapter(),
    clock: options.clock,
  });
  (options.logger ?? console).log(
    JSON.stringify({ selected: sources.length, ...report }),
  );
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const report = await runCatalogEvidenceCli(process.argv.slice(2));
  if (report.failed > 0) {
    process.exitCode = 1;
  }
}
