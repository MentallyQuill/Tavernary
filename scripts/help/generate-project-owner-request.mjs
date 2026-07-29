import {
  mkdir as defaultMkdir,
  readFile as defaultReadFile,
  readdir as defaultReaddir,
  rm as defaultRm,
  writeFile as defaultWriteFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { formatJson } from "../catalog/json-format.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { applyProjectOwnerRequest } from "./apply-project-owner-request.mjs";
import { processProjectOwnerTriage } from "./triage-project-owner-request.mjs";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const CARD_OPERATIONS = new Set(["edit-card", "retire-card", "restore-card"]);
const VOCABULARY_FILES = [
  ["frontends", "frontends.json", "frontends"],
  ["primaryFunctions", "primary-functions.json", "primary_functions"],
  ["tags", "tags.json", "tags"],
  ["modelFamilies", "model-families.json", "model_families"],
  ["completionFormats", "completion-formats.json", "completion_formats"],
];

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

export function fingerprintProjectOwnerManifest(manifest) {
  return fingerprintProjectPublicationInput(manifest);
}

function sortedRecordArray(value) {
  if (!Array.isArray(value)) return value;
  if (
    value.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        typeof entry.id === "string",
    )
  ) {
    return [...value].sort((left, right) => left.id.localeCompare(right.id));
  }
  return value;
}

function comparableReport(report) {
  const clone = structuredClone(report);
  delete clone.generated_at;
  if (Array.isArray(clone.project_ids)) {
    clone.project_ids.sort((left, right) => left.localeCompare(right));
  }
  clone.before = sortedRecordArray(clone.before);
  clone.after = sortedRecordArray(clone.after);
  return clone;
}

export function sameProjectOwnerGenerationReport(left, right) {
  return (
    Boolean(left) &&
    Boolean(right) &&
    JSON.stringify(comparableReport(left)) ===
      JSON.stringify(comparableReport(right))
  );
}

function inside(root, path) {
  const local = relative(root, path);
  return local === "" || (!local.startsWith("..") && !isAbsolute(local));
}

function repositoryName(hostRepository) {
  const value =
    typeof hostRepository === "string"
      ? hostRepository
      : typeof hostRepository?.owner === "string" &&
          typeof hostRepository?.name === "string"
        ? `${hostRepository.owner}/${hostRepository.name}`
        : "";
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value)) {
    throw new Error(
      "Owner generation requires trusted host repository context and an issue number.",
    );
  }
  return value;
}

function issuePath(hostRepository, issueNumber) {
  const repository = repositoryName(hostRepository);
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error(
      "Owner generation requires trusted host repository context and an issue number.",
    );
  }
  return `/repos/${repository}/issues/${issueNumber}`;
}

async function loadVocabularies(root, readFile) {
  return Object.fromEntries(
    await Promise.all(
      VOCABULARY_FILES.map(async ([name, file, key]) => [
        name,
        parseJson(
          await readFile(resolve(root, "data", "vocabularies", file), "utf8"),
        )?.[key] ?? [],
      ]),
    ),
  );
}

function sectionValue(body, heading) {
  const matches = String(body ?? "")
    .split(/^### /mu)
    .slice(1)
    .filter((section) => section.split(/\r?\n/u)[0]?.trim() === heading);
  if (matches.length !== 1) return null;
  const value = matches[0].split(/\r?\n/u).slice(1).join("\n").trim();
  return /^_No response_$/iu.test(value) ? "" : value;
}

function generatedManifest(body) {
  const rendered = sectionValue(body, "Owner request manifest");
  if (!rendered) return null;
  const json =
    rendered.match(/^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/iu)?.[1] ??
    rendered;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function contextIdentifiers(issue) {
  const manifest = generatedManifest(issue?.body);
  const projectId =
    manifest?.project_id ?? sectionValue(issue?.body, "Project ID");
  const sourceId =
    manifest?.source_id ?? sectionValue(issue?.body, "Source ID");
  return {
    projectId:
      typeof projectId === "string" && ID_PATTERN.test(projectId)
        ? projectId
        : null,
    sourceId:
      typeof sourceId === "string" && ID_PATTERN.test(sourceId)
        ? sourceId
        : null,
  };
}

async function loadAllProjects(root, readFile, readdir) {
  const directory = resolve(root, "data", "registry", "projects");
  const names = (await readdir(directory))
    .filter(
      (name) =>
        typeof name === "string" &&
        /^[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(name),
    )
    .sort((left, right) => left.localeCompare(right));
  const entries = await Promise.all(
    names.map(async (name) => {
      const path = resolve(directory, name);
      const contents = await readFile(path, "utf8");
      return {
        value: parseJson(contents),
        contents,
        path: `data/registry/projects/${name}`,
      };
    }),
  );
  return {
    projects: entries.map((entry) => entry.value),
    priorContents: new Map(
      entries.map((entry) => [entry.path, entry.contents]),
    ),
  };
}

async function loadSource(root, sourceId, readFile) {
  const localPath = `data/registry/sources/${sourceId}.json`;
  const contents = await readFile(resolve(root, localPath), "utf8");
  return { value: parseJson(contents), contents, path: localPath };
}

async function loadSnapshot(root, sourceId, readFile) {
  const localPath = `data/snapshots/github/${sourceId}.json`;
  const contents = await readFile(resolve(root, localPath), "utf8");
  return { value: parseJson(contents), contents, path: localPath };
}

async function loadOpenRequests(hostRepository, request) {
  const repository = repositoryName(hostRepository);
  const [issues, pulls] = await Promise.all([
    request(
      `/repos/${repository}/issues?state=open&labels=project-owner-request&per_page=100`,
    ),
    request(`/repos/${repository}/pulls?state=open&per_page=100`),
  ]);
  return {
    issues: Array.isArray(issues) ? issues : [],
    pulls: Array.isArray(pulls) ? pulls : [],
  };
}

function admitted(decision) {
  if (decision.status === "admitted") return decision;
  const error = new Error(
    `${decision.reasonCode}: ${decision.message ?? "owner request rejected"}`,
  );
  error.code = decision.reasonCode;
  throw error;
}

async function triagePhase(input, issueApiPath, root, readFile, readdir) {
  const issue = await input.request(issueApiPath);
  const identifiers = contextIdentifiers(issue);
  if (!identifiers.sourceId) {
    throw Object.assign(
      new Error("owner-request-invalid: Source ID is missing."),
      { code: "owner-request-invalid" },
    );
  }
  const [vocabularies, projectRegistry, sourceRecord, open] = await Promise.all(
    [
      loadVocabularies(root, readFile),
      loadAllProjects(root, readFile, readdir),
      loadSource(root, identifiers.sourceId, readFile),
      loadOpenRequests(input.hostRepository, input.request),
    ],
  );
  const project = identifiers.projectId
    ? projectRegistry.projects.find(
        (candidate) => candidate.id === identifiers.projectId,
      )
    : null;
  const decision = admitted(
    await processProjectOwnerTriage({
      issue,
      project: project ?? undefined,
      projects: projectRegistry.projects,
      source: sourceRecord.value,
      hostRepository: input.hostRepository,
      request: input.request,
      vocabularies,
      issues: open.issues,
      pulls: open.pulls,
    }),
  );
  return {
    decision,
    issue,
    vocabularies,
    projects: projectRegistry.projects,
    source: sourceRecord.value,
    priorContents: new Map([
      ...projectRegistry.priorContents,
      [sourceRecord.path, sourceRecord.contents],
    ]),
  };
}

function expectedPaths(operation, projectIds, sourceId) {
  if (CARD_OPERATIONS.has(operation) || operation === "add-cards") {
    return projectIds.map((id) => `data/registry/projects/${id}.json`);
  }
  if (operation === "move-source") {
    return [
      `data/registry/sources/${sourceId}.json`,
      `data/snapshots/github/${sourceId}.json`,
    ];
  }
  return [`data/registry/sources/${sourceId}.json`];
}

function exactPaths(actual, expected) {
  return (
    actual.length === expected.length &&
    actual.every((path, index) => path === expected[index])
  );
}

function generatedAt(now) {
  const value = typeof now === "function" ? now() : now;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Owner generation time must be a valid timestamp.");
  }
  return date.toISOString();
}

async function writeOwnerGenerationTransaction({
  root,
  reportPath,
  files,
  reportContents,
  priorContents,
  makeDirectory,
  writeFile,
  remove,
}) {
  const attempted = [];
  try {
    for (const file of files) {
      const destination = resolve(root, file.path);
      if (!inside(root, destination)) {
        throw new Error(
          `Owner generated path escapes repository: ${file.path}`,
        );
      }
      attempted.push({
        destination,
        contents: priorContents.get(file.path) ?? null,
      });
      await makeDirectory(dirname(destination), { recursive: true });
      await writeFile(destination, file.contents, "utf8");
    }
    await makeDirectory(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, reportContents, "utf8");
  } catch (writeError) {
    const rollbackErrors = [];
    for (const file of [...attempted].reverse()) {
      try {
        if (file.contents === null) {
          await remove(file.destination, { force: true });
        } else {
          await writeFile(file.destination, file.contents, "utf8");
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      const error = new AggregateError(
        [writeError, ...rollbackErrors],
        `Owner generation rollback failed: ${rollbackErrors
          .map((failure) => failure.message)
          .join("; ")}`,
      );
      error.code = "owner-generation-rollback-failed";
      throw error;
    }
    throw writeError;
  }
}

function reportProjectIds(final, mutation) {
  if (CARD_OPERATIONS.has(final.decision.operation)) {
    return [final.decision.projectId];
  }
  if (final.decision.operation === "add-cards") {
    return mutation.projects.map((project) => project.id);
  }
  return final.projects
    .filter((project) => project.source_id === final.source.id)
    .map((project) => project.id)
    .sort((left, right) => left.localeCompare(right));
}

function sourceIdentity(source) {
  return source?.type === "github" &&
    Number.isSafeInteger(source.repository_id) &&
    source.repository_id > 0
    ? {
        type: "github",
        canonical: `github:${source.repository_id}`,
        repository_id: source.repository_id,
      }
    : null;
}

function inputFingerprints(decision) {
  if (CARD_OPERATIONS.has(decision.operation)) {
    return {
      projects: {
        [decision.projectId]: decision.manifest.project_fingerprint,
      },
      source: null,
    };
  }
  return {
    projects: {},
    source: decision.manifest.source_fingerprint,
  };
}

function changedValues(mutation) {
  return new Map([
    ...mutation.projects.map((project) => [
      `data/registry/projects/${project.id}.json`,
      project,
    ]),
    [`data/registry/sources/${mutation.source.id}.json`, mutation.source],
    ...(mutation.snapshot
      ? [
          [
            `data/snapshots/github/${mutation.source.id}.json`,
            mutation.snapshot,
          ],
        ]
      : []),
  ]);
}

export async function generateProjectOwnerRequest(input) {
  const root = resolve(input?.root ?? ".");
  const issueApiPath = issuePath(input?.hostRepository, input?.issue?.number);
  const reportPath = resolve(
    input?.reportPath ??
      resolve(root, "..", `owner-request-${input?.issue?.number}-report.json`),
  );
  if (inside(root, reportPath)) {
    throw new Error(
      "Owner generation report must be outside the repository output.",
    );
  }
  if (typeof input?.request !== "function") {
    throw new Error("Owner generation requires an injected GitHub request.");
  }
  const readFile = input.readFile ?? defaultReadFile;
  const readdir = input.readdir ?? defaultReaddir;
  const writeFile = input.writeFile ?? defaultWriteFile;
  const remove = input.rm ?? defaultRm;
  const makeDirectory =
    input.mkdir ?? (input.writeFile ? async () => {} : defaultMkdir);

  const initial = await triagePhase(
    input,
    issueApiPath,
    root,
    readFile,
    readdir,
  );
  const final = await triagePhase(input, issueApiPath, root, readFile, readdir);

  let snapshotRecord = null;
  if (final.decision.operation === "move-source") {
    snapshotRecord = await loadSnapshot(root, final.source.id, readFile);
    final.priorContents.set(snapshotRecord.path, snapshotRecord.contents);
  }
  const mutation = applyProjectOwnerRequest({
    issueNumber: final.decision.issueNumber,
    manifest: final.decision.manifest,
    projects: final.projects,
    source: final.source,
    snapshot: snapshotRecord?.value ?? null,
    repository: final.decision.repository ?? undefined,
    vocabularies: final.vocabularies,
    catalogedAt: generatedAt(input.now),
  });
  const projectIds = reportProjectIds(final, mutation);
  const allowedPaths = expectedPaths(
    final.decision.operation,
    projectIds,
    final.source.id,
  );
  if (!exactPaths(mutation.changedPaths, allowedPaths)) {
    throw new Error(
      "Owner mutation returned paths outside its approved operation.",
    );
  }

  const report = {
    schema_version: 2,
    issue_number: final.decision.issueNumber,
    project_id:
      projectIds.length === 1 && CARD_OPERATIONS.has(final.decision.operation)
        ? projectIds[0]
        : null,
    project_ids: projectIds,
    source_id: final.source.id,
    operation: final.decision.operation,
    publication_mode:
      final.decision.operation === "add-cards" ? "manual" : "automatic",
    repository_id: final.decision.manifest.repository_id,
    authority_type: final.decision.authorityType,
    actor_id: final.issue.user?.id,
    actor_login: final.decision.actorLogin,
    actor_type: "User",
    request_fingerprint: fingerprintProjectOwnerManifest(
      final.decision.manifest,
    ),
    input_fingerprints: inputFingerprints(final.decision),
    source_identity: sourceIdentity(final.source),
    policy_version: CATALOG_POLICY_VERSION,
    generated_at: generatedAt(input.now),
    before: mutation.before,
    after: mutation.after,
    warnings: [
      ...new Set([...initial.decision.warnings, ...final.decision.warnings]),
    ],
    generated_paths: [...mutation.changedPaths],
  };
  const values = changedValues(mutation);
  const files = await Promise.all(
    mutation.changedPaths.map(async (path) => {
      if (!values.has(path)) {
        throw new Error(`Owner mutation omitted generated value for ${path}.`);
      }
      return { path, contents: await formatJson(values.get(path)) };
    }),
  );
  await writeOwnerGenerationTransaction({
    root,
    reportPath,
    files,
    reportContents: await formatJson(report),
    priorContents: final.priorContents,
    makeDirectory,
    writeFile,
    remove,
  });

  return {
    issueNumber: final.decision.issueNumber,
    projectId: final.decision.projectId,
    projectIds,
    sourceId: final.source.id,
    operation: final.decision.operation,
    publicationMode: report.publication_mode,
    authorityType: final.decision.authorityType,
    actorLogin: final.decision.actorLogin,
    generatedPaths: [...mutation.changedPaths],
    reportPath,
    report,
  };
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseGenerateProjectOwnerCli(argv) {
  const options = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    const value = argv[index + 1];
    if (
      !["--issue-number", "--output-directory", "--report-path"].includes(
        name,
      ) ||
      value === undefined
    ) {
      throw new Error(`Unknown or incomplete option: ${name ?? "missing"}.`);
    }
    options.set(name, value);
  }
  const issueNumber = Number(requiredOption(options, "--issue-number"));
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error("--issue-number must be a positive integer.");
  }
  return {
    issueNumber,
    root: requiredOption(options, "--output-directory"),
    reportPath: requiredOption(options, "--report-path"),
  };
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    "User-Agent": "Tavernary-project-owner-generation",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...options.headers },
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const cli = parseGenerateProjectOwnerCli(process.argv.slice(2));
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository) throw new Error("GITHUB_REPOSITORY is required.");
  await generateProjectOwnerRequest({
    issue: { number: cli.issueNumber },
    hostRepository: repository,
    root: cli.root,
    reportPath: cli.reportPath,
    request: github,
    now: new Date(),
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
