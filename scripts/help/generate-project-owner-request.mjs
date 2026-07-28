import {
  mkdir as defaultMkdir,
  readFile as defaultReadFile,
  writeFile as defaultWriteFile,
} from "node:fs/promises";
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

function inside(root, path) {
  const local = relative(root, path);
  return local === "" || (!local.startsWith("..") && !isAbsolute(local));
}

function issuePath(issue) {
  if (typeof issue?.url === "string") {
    try {
      const url = new URL(issue.url);
      if (
        url.protocol === "https:" &&
        url.hostname.toLocaleLowerCase() === "api.github.com" &&
        /^\/repos\/[^/]+\/[^/]+\/issues\/[1-9]\d*$/u.test(url.pathname)
      ) {
        return url.pathname;
      }
    } catch {
      // Fall through to the explicit repository form.
    }
  }
  const repository = issue?.repository ?? process.env.GITHUB_REPOSITORY;
  if (
    typeof repository === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository) &&
    Number.isSafeInteger(issue?.number) &&
    issue.number > 0
  ) {
    return `/repos/${repository}/issues/${issue.number}`;
  }
  throw new Error("Owner generation requires an issue API location.");
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
  return parseJson(
    await readFile(
      resolve(root, "data", "registry", "projects", `${projectId}.json`),
      "utf8",
    ),
  );
}

async function loadSnapshot(root, projectId, readFile) {
  return parseJson(
    await readFile(
      resolve(root, "data", "snapshots", "github", `${projectId}.json`),
      "utf8",
    ),
  );
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

export async function generateProjectOwnerRequest(input) {
  const root = resolve(input?.root ?? ".");
  const issueApiPath = issuePath(input?.issue);
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
      request: input.request,
      readFile,
      vocabularies,
    }),
  );

  // A triage result is not an authorization token. Re-read every mutable
  // authority input immediately before the pure mutation is applied.
  const [finalIssue, finalRecord, finalVocabularies] = await Promise.all([
    input.request(issueApiPath),
    loadRecord(root, initial.projectId, readFile),
    loadVocabularies(root, readFile),
  ]);
  const finalRepository = await input.request(
    `/repositories/${finalRecord?.source?.repository_id}`,
  );
  const final = admitted(
    await processProjectOwnerTriage({
      issue: finalIssue,
      record: finalRecord,
      repository: finalRepository,
      request: input.request,
      vocabularies: finalVocabularies,
    }),
  );

  const snapshot =
    final.operation === "move-source"
      ? await loadSnapshot(root, final.projectId, readFile)
      : null;
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

  for (const file of serialized) {
    const destination = resolve(root, file.path);
    if (!inside(root, destination)) {
      throw new Error(`Owner generated path escapes repository: ${file.path}`);
    }
    await makeDirectory(dirname(destination), { recursive: true });
    await writeFile(destination, file.contents, "utf8");
  }
  await makeDirectory(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, serializedReport, "utf8");

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
    issue: { number: cli.issueNumber, repository },
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
