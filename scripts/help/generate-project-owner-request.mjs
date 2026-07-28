import {
  mkdir as defaultMkdir,
  readFile as defaultReadFile,
  writeFile as defaultWriteFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { formatJson } from "../catalog/json-format.mjs";
import { applyProjectOwnerRequest } from "./apply-project-owner-request.mjs";
import { processProjectOwnerTriage } from "./triage-project-owner-request.mjs";

const VOCABULARY_FILES = [
  ["frontends", "frontends.json", "frontends"],
  ["primaryFunctions", "primary-functions.json", "primary_functions"],
  ["capabilities", "capabilities.json", "capabilities"],
  ["modelFamilies", "model-families.json", "model_families"],
  ["completionFormats", "completion-formats.json", "completion_formats"],
];

function parseJson(text) {
  return JSON.parse(String(text).replace(/^\uFEFF/u, ""));
}

export function fingerprintProjectOwnerManifest(manifest) {
  return createHash("sha256")
    .update(JSON.stringify(manifest), "utf8")
    .digest("hex");
}

export function sameProjectOwnerGenerationReport(left, right) {
  if (!left || !right) return false;
  const { generated_at: _leftGeneratedAt, ...leftStable } = left;
  const { generated_at: _rightGeneratedAt, ...rightStable } = right;
  return JSON.stringify(leftStable) === JSON.stringify(rightStable);
}

function inside(root, path) {
  const local = relative(root, path);
  return local === "" || (!local.startsWith("..") && !isAbsolute(local));
}

function issuePath(hostRepository, issueNumber) {
  const repository =
    typeof hostRepository === "string"
      ? hostRepository
      : typeof hostRepository?.owner === "string" &&
          typeof hostRepository?.name === "string"
        ? `${hostRepository.owner}/${hostRepository.name}`
        : "";
  if (
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) &&
    Number.isSafeInteger(issueNumber) &&
    issueNumber > 0
  ) {
    return `/repos/${repository}/issues/${issueNumber}`;
  }
  throw new Error(
    "Owner generation requires trusted host repository context and an issue number.",
  );
}

async function loadVocabularies(root, readFile) {
  const entries = await Promise.all(
    VOCABULARY_FILES.map(async ([name, file, key]) => {
      const contents = await readFile(
        resolve(root, "data", "vocabularies", file),
        "utf8",
      );
      return [name, parseJson(contents)?.[key] ?? []];
    }),
  );
  return Object.fromEntries(entries);
}

async function loadRecord(root, projectId, readFile) {
  const contents = await readFile(
    resolve(root, "data", "registry", "projects", `${projectId}.json`),
    "utf8",
  );
  return { value: parseJson(contents), contents };
}

async function loadSnapshot(root, projectId, readFile) {
  const contents = await readFile(
    resolve(root, "data", "snapshots", "github", `${projectId}.json`),
    "utf8",
  );
  return { value: parseJson(contents), contents };
}

function admitted(decision) {
  if (decision.status === "admitted") return decision;
  const error = new Error(
    `${decision.reasonCode}: ${decision.message ?? "owner request rejected"}`,
  );
  error.code = decision.reasonCode;
  throw error;
}

function expectedPaths(projectId, operation) {
  const registry = `data/registry/projects/${projectId}.json`;
  return operation === "move-source"
    ? [registry, `data/snapshots/github/${projectId}.json`]
    : [registry];
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
        contents: priorContents.get(file.path),
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
        await writeFile(file.destination, file.contents, "utf8");
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
  const writeFile = input.writeFile ?? defaultWriteFile;
  const makeDirectory =
    input.mkdir ?? (input.writeFile ? async () => {} : defaultMkdir);

  const latestIssue = await input.request(issueApiPath);
  const vocabularies = await loadVocabularies(root, readFile);
  const initial = admitted(
    await processProjectOwnerTriage({
      issue: latestIssue,
      root,
      hostRepository: input.hostRepository,
      request: input.request,
      readFile,
      vocabularies,
    }),
  );

  // A triage result is not an authorization token. Re-read every mutable
  // authority input immediately before the pure mutation is applied.
  const [finalIssue, finalRecordSource, finalVocabularies] = await Promise.all([
    input.request(issueApiPath),
    loadRecord(root, initial.projectId, readFile),
    loadVocabularies(root, readFile),
  ]);
  const finalRecord = finalRecordSource.value;
  const finalRepository = await input.request(
    `/repositories/${finalRecord?.source?.repository_id}`,
  );
  const final = admitted(
    await processProjectOwnerTriage({
      issue: finalIssue,
      record: finalRecord,
      repository: finalRepository,
      hostRepository: input.hostRepository,
      request: input.request,
      vocabularies: finalVocabularies,
    }),
  );

  const snapshotSource =
    final.operation === "move-source"
      ? await loadSnapshot(root, final.projectId, readFile)
      : null;
  const snapshot = snapshotSource?.value ?? null;
  const mutation = applyProjectOwnerRequest({
    issueNumber: final.issueNumber,
    manifest: final.manifest,
    record: final.record,
    snapshot,
    repository: final.repository,
    vocabularies: finalVocabularies,
  });
  const allowedPaths = expectedPaths(final.projectId, final.operation);
  if (!exactPaths(mutation.changedPaths, allowedPaths)) {
    throw new Error(
      "Owner mutation returned paths outside its approved operation.",
    );
  }

  const report = {
    schema_version: 1,
    issue_number: final.issueNumber,
    project_id: final.projectId,
    operation: final.operation,
    repository_id: final.record.source.repository_id,
    verified_owner_login: final.verifiedOwnerLogin,
    request_fingerprint: fingerprintProjectOwnerManifest(final.manifest),
    generated_at: generatedAt(input.now),
    before: mutation.before,
    after: mutation.after,
    warnings: [...new Set([...initial.warnings, ...final.warnings])],
    generated_paths: [...mutation.changedPaths],
  };
  const values = new Map([
    [allowedPaths[0], mutation.record],
    ...(final.operation === "move-source"
      ? [[allowedPaths[1], mutation.snapshot]]
      : []),
  ]);
  const serialized = await Promise.all(
    mutation.changedPaths.map(async (path) => ({
      path,
      contents: await formatJson(values.get(path)),
    })),
  );
  const serializedReport = await formatJson(report);
  const priorContents = new Map([
    [allowedPaths[0], finalRecordSource.contents],
    ...(snapshotSource ? [[allowedPaths[1], snapshotSource.contents]] : []),
  ]);
  await writeOwnerGenerationTransaction({
    root,
    reportPath,
    files: serialized,
    reportContents: serializedReport,
    priorContents,
    makeDirectory,
    writeFile,
  });

  return {
    issueNumber: final.issueNumber,
    projectId: final.projectId,
    operation: final.operation,
    verifiedOwnerLogin: final.verifiedOwnerLogin,
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
