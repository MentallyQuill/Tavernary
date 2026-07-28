import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import { enrichRecord } from "../catalog/enrich-readmes.mjs";
import { createEnrichmentProvider } from "../catalog/enrichment-provider.mjs";
import {
  fetchForkContributors,
  fetchRepositoryContributors,
} from "../catalog/github-contributors.mjs";
import { inspectApiActivity } from "../catalog/github-inspector.mjs";
import { observeRepositories } from "../catalog/github-observer.mjs";
import { formatJson } from "../catalog/json-format.mjs";
import {
  createInitialRepositorySnapshot,
  provisionalActivity,
} from "../catalog/repository-snapshot.mjs";
import { evaluateProjectSubmission } from "./admission.mjs";
import { draftProjectRecord } from "./draft-project-record.mjs";
import { reconcileFrontends } from "./frontend-reconciliation.mjs";
import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { safeProbe } from "./safe-source-fetch.mjs";
import { isRepositoryIdentity } from "./source-identity.mjs";
import {
  inspectProjectSubmissionSource,
  loadProjectSubmissionCatalogData,
  projectSubmissionExistingProject,
} from "./triage-issue.mjs";

export async function generateProjectSubmission({ issueNumber, draft }) {
  const files = [
    {
      path: `data/registry/projects/${draft.record.id}.json`,
      value: draft.record,
    },
    ...(draft.snapshot
      ? [
          {
            path: `data/snapshots/github/${draft.record.id}.json`,
            value: draft.snapshot,
          },
        ]
      : []),
    ...(draft.frontendVocabulary
      ? [
          {
            path: "data/vocabularies/frontends.json",
            value: {
              frontends: [...draft.frontendVocabulary.frontends].sort(
                (left, right) => left.id.localeCompare(right.id),
              ),
            },
          },
        ]
      : []),
  ].sort((left, right) => left.path.localeCompare(right.path));

  return {
    files,
    report: {
      schema_version: 1,
      issue_number: issueNumber,
      project_id: draft.record.id,
      submitted: draft.submitted,
      observed: draft.observed,
      inferred: draft.inferred,
      warnings: draft.warnings,
    },
  };
}

function requiredOption(options, name) {
  const value = options.get(name);
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

export function parseGenerateProjectSubmissionCli(argv) {
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
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("--issue-number must be a positive integer.");
  }
  return {
    issueNumber,
    outputDirectory: requiredOption(options, "--output-directory"),
    reportPath: requiredOption(options, "--report-path"),
  };
}

function issueLabels(issue) {
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

function assertGenerationIssue(issue, issueNumber) {
  if (issue.number !== issueNumber || issue.state !== "open") {
    throw new Error(
      "Submission issue is not open and eligible for generation.",
    );
  }
  const labels = issueLabels(issue);
  if (
    !labels.includes("needs-maintainer-review") &&
    !labels.includes("submission-pr-open")
  ) {
    throw new Error("Submission issue is no longer admitted for generation.");
  }
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    "User-Agent": "Tavernary-project-submission-generation",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function defaultGithubRequest(path, options = {}) {
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

async function loadEnrichmentVocabularies() {
  const [primaryFunctions, capabilities] = await Promise.all([
    readFile(resolve("data/vocabularies/primary-functions.json"), "utf8"),
    readFile(resolve("data/vocabularies/capabilities.json"), "utf8"),
  ]);
  return {
    primaryFunctions: JSON.parse(primaryFunctions).primary_functions,
    capabilities: JSON.parse(capabilities).capabilities,
  };
}

function decisionFailure(decision) {
  if (decision.status === "needs-information") {
    return decision.errors.join(" ");
  }
  if (decision.status === "retryable") return decision.message;
  if (decision.status === "duplicate") {
    return `Source is already cataloged as ${decision.existingProject.name}.`;
  }
  return null;
}

export async function prepareProjectSubmissionDraft({
  issue,
  now,
  sourceClients = {},
}) {
  const parsed = parseProjectSubmissionIssue(issue.body ?? "");
  if (!parsed.valid) throw new Error(parsed.errors.join(" "));
  const request = sourceClients.request ?? defaultGithubRequest;
  const inspection = await inspectProjectSubmissionSource(parsed.manifest, {
    request,
    probe: sourceClients.probe ?? safeProbe,
  });
  const data =
    sourceClients.catalogData ?? (await loadProjectSubmissionCatalogData());
  const frontendResolution =
    parsed.manifest.project_type === "frontend"
      ? { status: "resolved", ids: [], warnings: [] }
      : reconcileFrontends({
          projectType: parsed.manifest.project_type,
          knownIds: parsed.manifest.frontends.known_ids,
          other: parsed.manifest.frontends.other,
          frontendIndependent: parsed.manifest.frontend_independent,
          vocabulary: data.vocabulary,
          frontendProjects: data.projects,
        });
  const decision = evaluateProjectSubmission({
    manifest: parsed.manifest,
    identity: inspection.identity,
    sourceProbe: inspection.sourceProbe,
    repository: inspection.repository,
    existingProjects: data.projects
      .map(projectSubmissionExistingProject)
      .filter((project) => project !== null),
    frontendResolution,
    errors: inspection.errors,
    warnings: [],
  });
  if (decision.status !== "admitted") {
    throw new Error(decisionFailure(decision));
  }

  if (
    !isRepositoryIdentity(decision.identity) ||
    decision.identity.provider !== "github"
  ) {
    return draftProjectRecord({
      admitted: decision,
      observation: null,
      snapshot: null,
      enrichment: null,
      frontendVocabulary: data.vocabulary,
      frontendProjects: data.projects,
      now,
    });
  }

  const observationRecord = {
    id: `submission-${issue.number}`,
    source: {
      type: "github",
      repository: decision.identity.repository,
      repository_id: decision.identity.repositoryId,
    },
  };
  const observe =
    sourceClients.observe ??
    ((records) =>
      observeRepositories(records, {
        token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      }));
  const observationRun = await observe([observationRecord]);
  const observation = observationRun.observations?.[0];
  if (!observation || observationRun.failures?.length) {
    throw new Error(
      observationRun.failures?.[0]?.message ??
        "GitHub source observation failed.",
    );
  }

  const preliminary = await draftProjectRecord({
    admitted: decision,
    observation,
    snapshot: null,
    enrichment: null,
    frontendVocabulary: data.vocabulary,
    frontendProjects: data.projects,
    now,
  });
  const inspectActivity =
    sourceClients.inspectActivity ??
    ((input) =>
      inspectApiActivity(input, {
        token: process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN,
      }));
  const activityInspection = await inspectActivity({
    repository: decision.identity.repository,
    expectedHeadSha: observation.repository.headSha,
    now,
    activity: provisionalActivity(),
    scan: null,
  });
  const fetchContributors =
    sourceClients.fetchContributors ??
    (async (repository, context) => {
      const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
      if (repository.fork) {
        return {
          ...(await fetchForkContributors(repository, {
            token,
            now: context.now,
          })),
          method: "merged-pull-requests",
        };
      }
      return {
        ...(await fetchRepositoryContributors(repository, { token })),
        method: "repository-contributors",
      };
    });
  const contributorResult = await fetchContributors(observation.repository, {
    now,
    previous: undefined,
  });
  const snapshot = createInitialRepositorySnapshot({
    provider: "github",
    projectId: preliminary.record.id,
    observation,
    activityInspection,
    contributors: contributorResult,
    now,
  });

  let enrichment;
  try {
    if (sourceClients.enrich) {
      enrichment = await sourceClients.enrich({
        record: preliminary.record,
        snapshot,
      });
    } else {
      const provider = createEnrichmentProvider({
        apiUrl: process.env.TAVERNARY_ENRICHMENT_API_URL,
        apiKey: process.env.TAVERNARY_ENRICHMENT_API_KEY,
        model: process.env.TAVERNARY_ENRICHMENT_MODEL,
      });
      const output = await enrichRecord(
        preliminary.record,
        snapshot,
        provider,
        {
          vocabularies: await loadEnrichmentVocabularies(),
        },
      );
      enrichment = output
        ? {
            status: "curated",
            summary: output.summary,
            primary_function: output.primary_function,
            capabilities: [...output.capabilities],
          }
        : null;
    }
  } catch (error) {
    enrichment = {
      status: "failed",
      code: error.code ?? "enrichment-failed",
      message: error.message,
    };
  }

  return draftProjectRecord({
    admitted: decision,
    observation,
    snapshot,
    enrichment,
    frontendVocabulary: data.vocabulary,
    frontendProjects: data.projects,
    now,
  });
}

function inside(root, destination) {
  const path = relative(root, destination);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== "..");
}

export async function writeGeneratedSubmission(
  generated,
  { outputDirectory, reportPath },
) {
  const root = resolve(outputDirectory);
  const resolvedReport = resolve(reportPath);
  if (inside(root, resolvedReport)) {
    throw new Error("Admission report must be outside the repository output.");
  }
  for (const file of generated.files) {
    const destination = resolve(root, file.path);
    if (!inside(root, destination)) {
      throw new Error(`Generated file escapes output directory: ${file.path}`);
    }
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, await formatJson(file.value), "utf8");
  }
  await mkdir(dirname(resolvedReport), { recursive: true });
  await writeFile(resolvedReport, await formatJson(generated.report), "utf8");
}

export async function runGenerateProjectSubmissionCli(options) {
  const fetchIssue =
    options.fetchIssue ??
    ((issueNumber) => {
      const repository = process.env.GITHUB_REPOSITORY;
      if (!repository) throw new Error("GITHUB_REPOSITORY is required.");
      return defaultGithubRequest(`/repos/${repository}/issues/${issueNumber}`);
    });
  const issue = await fetchIssue(options.issueNumber);
  assertGenerationIssue(issue, options.issueNumber);
  const now = (options.clock ?? (() => new Date().toISOString()))();
  const prepareDraft =
    options.sourceClients?.prepareDraft ??
    ((input) =>
      prepareProjectSubmissionDraft({
        ...input,
        sourceClients: options.sourceClients,
      }));
  const draft = await prepareDraft({ issue, now });
  const generated = await generateProjectSubmission({
    issueNumber: options.issueNumber,
    draft,
  });
  await writeGeneratedSubmission(generated, options);
  return generated;
}

async function main() {
  const cli = parseGenerateProjectSubmissionCli(process.argv.slice(2));
  await runGenerateProjectSubmissionCli(cli);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
