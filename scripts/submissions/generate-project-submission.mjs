import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import trustedEditorRegistry from "../../data/maintenance/trusted-tavernary-editors.json" with { type: "json" };
import { enrichRecord } from "../catalog/enrich-readmes.mjs";
import { createEnrichmentProvider } from "../catalog/enrichment-provider.mjs";
import { formatJson } from "../catalog/json-format.mjs";
import { EXTENSION_PRIMARY_FUNCTION_IDS } from "../../src/features/catalog/primary-function-contract.mjs";
import {
  createInitialRepositorySnapshot,
  provisionalActivity,
} from "../catalog/repository-snapshot.mjs";
import { repositoryProvider } from "../catalog/repository-provider.mjs";
import { evaluateProjectSubmission } from "./admission.mjs";
import { draftProjectRecord } from "./draft-project-record.mjs";
import { reconcileFrontends } from "./frontend-reconciliation.mjs";
import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { safeProbe } from "./safe-source-fetch.mjs";
import { isRepositoryIdentity } from "./source-identity.mjs";
import { classifySubmissionSummaryAuthority } from "./submission-summary-authority.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import {
  inspectProjectSubmissionSource,
  loadProjectSubmissionCatalogData,
  projectSubmissionExistingProject,
} from "./triage-issue.mjs";

export async function generateProjectSubmission({ issueNumber, draft }) {
  const snapshotProvider = draft.snapshot ? draft.record.source.type : null;
  if (
    snapshotProvider !== null &&
    !["github", "codeberg"].includes(snapshotProvider)
  ) {
    throw new Error(
      `Unsupported generated snapshot provider: ${snapshotProvider}`,
    );
  }
  const files = [
    {
      path: `data/registry/projects/${draft.record.id}.json`,
      value: draft.record,
    },
    ...(draft.snapshot
      ? [
          {
            path: `data/snapshots/${snapshotProvider}/${draft.record.id}.json`,
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
      source_provider: snapshotProvider,
      submitted: draft.submitted,
      observed: draft.observed,
      inferred: draft.inferred,
      summary_authority: draft.summaryAuthority ?? null,
      copy_result: draft.copyResult ?? null,
      input_digest: draft.inputDigest ?? null,
      source_identity: draft.sourceIdentity ?? null,
      actor:
        Number.isSafeInteger(draft.summaryAuthority?.actorId) &&
        draft.summaryAuthority.actorId > 0 &&
        typeof draft.summaryAuthority?.actorLogin === "string"
          ? {
              id: draft.summaryAuthority.actorId,
              login: draft.summaryAuthority.actorLogin,
              type: "User",
            }
          : null,
      classificationReview: draft.classificationReview ?? null,
      warnings: draft.warnings,
    },
  };
}

function publicationSourceIdentity(identity) {
  if (isRepositoryIdentity(identity)) {
    return {
      type: identity.provider,
      canonical: identity.repositoryId
        ? `${identity.provider}:${identity.repositoryId}`
        : `${identity.provider}:${identity.repository.toLocaleLowerCase()}`,
      repository_id: identity.repositoryId ?? null,
    };
  }
  if (identity.kind === "reddit") {
    return {
      type: "reddit",
      canonical: `reddit:${identity.postId.toLocaleLowerCase()}`,
      repository_id: null,
    };
  }
  return {
    type: "external",
    canonical: identity.canonicalUrl,
    repository_id: null,
  };
}

function withPublicationMetadata(draft, decision) {
  return {
    ...draft,
    inputDigest: fingerprintProjectPublicationInput(decision.manifest),
    sourceIdentity: publicationSourceIdentity(decision.identity),
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

function assertProjectIdAvailable(record, projects) {
  const collision = projects.find((project) => project.id === record.id);
  if (!collision) return;
  const sameSource =
    collision.source?.type === record.source.type &&
    (record.source.type === "github" || record.source.type === "codeberg"
      ? collision.source.repository?.toLowerCase() ===
        record.source.repository.toLowerCase()
      : collision.source.url === record.source.url);
  if (!sameSource) {
    throw new Error(
      `Project ID ${record.id} is already in use by a different source.`,
    );
  }
}

function protectedTermsForSubmission({
  record,
  decision,
  data,
  submittedDescription,
}) {
  const repositoryParts = decision.identity.repository
    .split("/")
    .filter(Boolean);
  const frontendLabels = data.vocabulary.frontends
    .filter(({ id }) => decision.frontendIds.includes(id))
    .map(({ label }) => label);
  const mentionedProjectNames = data.projects
    .map(({ name }) => name)
    .filter(
      (name) =>
        typeof name === "string" &&
        name.length > 0 &&
        submittedDescription.includes(name),
    );
  const stableIdentifiers =
    submittedDescription.match(
      /\b[\p{Letter}\p{Number}]+(?:[-_.:/][\p{Letter}\p{Number}]+)+\b/gu,
    ) ?? [];
  return [
    ...new Set(
      [
        record.name,
        ...repositoryParts,
        ...frontendLabels,
        ...mentionedProjectNames,
        ...stableIdentifiers,
      ].filter(
        (term) =>
          typeof term === "string" && term.length > 0 && term.length <= 100,
      ),
    ),
  ].slice(0, 64);
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
    providers: sourceClients.providers,
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
  const summaryAuthority = classifySubmissionSummaryAuthority({
    issueActor: issue.user,
    authorAssociation: issue.author_association,
    sourceIdentity: decision.identity,
    repositoryOwner: inspection.repositoryOwner,
    trustedEditorRegistry:
      sourceClients.trustedEditorRegistry ?? trustedEditorRegistry,
  });

  if (!isRepositoryIdentity(decision.identity)) {
    const draft = await draftProjectRecord({
      admitted: decision,
      observation: null,
      snapshot: null,
      enrichment: null,
      frontendVocabulary: data.vocabulary,
      frontendProjects: data.projects,
      summaryAuthority,
      sourceIssueNumber: issue.number,
      now,
    });
    assertProjectIdAvailable(draft.record, data.projects);
    return withPublicationMetadata(draft, decision);
  }

  const provider = repositoryProvider(
    decision.identity.provider,
    sourceClients.providers,
  );
  const observationRecord = {
    id: `submission-${issue.number}`,
    source: {
      type: decision.identity.provider,
      repository: decision.identity.repository,
      repository_id: decision.identity.repositoryId,
    },
  };
  const observe =
    sourceClients.observe ?? ((records) => provider.observe(records));
  const observationRun = await observe([observationRecord]);
  const observation = observationRun.observations?.[0];
  if (!observation || observationRun.failures?.length) {
    throw new Error(
      observationRun.failures?.[0]?.message ??
        "Repository source observation failed.",
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
  assertProjectIdAvailable(preliminary.record, data.projects);
  const inspectActivity =
    sourceClients.inspectActivity ??
    ((input) => provider.inspectActivity(input));
  const activityInspection = await inspectActivity({
    repository: decision.identity.repository,
    expectedHeadSha: observation.repository.headSha,
    now,
    activity: provisionalActivity(),
    scan: null,
  });
  const fetchContributors =
    sourceClients.fetchContributors ??
    ((repository, context) =>
      provider.collectContributors(repository, context));
  const contributorResult = await fetchContributors(observation.repository, {
    now,
    previous: undefined,
  });
  const snapshot = createInitialRepositorySnapshot({
    provider: decision.identity.provider,
    projectId: preliminary.record.id,
    observation,
    activityInspection,
    contributors: contributorResult,
    now,
  });

  const vocabularies = await loadEnrichmentVocabularies();
  const classificationReviewRequest =
    decision.manifest.project_type === "extension"
      ? {
          submittedPrimaryFunction: decision.manifest.primary_function,
          allowedPrimaryFunctions: vocabularies.primaryFunctions.filter(
            ({ id }) => EXTENSION_PRIMARY_FUNCTION_IDS.includes(id),
          ),
        }
      : null;
  const submittedDescription = decision.manifest.description?.trim() ?? "";
  const summaryMode =
    submittedDescription.length > 0 &&
    ["repository-owner", "tavernary-staff"].includes(
      summaryAuthority.authorityType,
    )
      ? "preserve"
      : "synthesize";
  const protectedTerms = protectedTermsForSubmission({
    record: preliminary.record,
    decision,
    data,
    submittedDescription,
  });
  let enrichment;
  try {
    if (sourceClients.enrich) {
      enrichment = await sourceClients.enrich({
        record: preliminary.record,
        snapshot,
        summaryAuthority,
        summaryMode,
        submittedDescription: submittedDescription || null,
        protectedTerms,
        ...(classificationReviewRequest ? { classificationReviewRequest } : {}),
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
          vocabularies,
          summaryMode,
          submittedDescription: submittedDescription || null,
          protectedTerms,
          ...(sourceClients.loadEnrichmentSource
            ? { loadSource: sourceClients.loadEnrichmentSource }
            : {}),
          ...(classificationReviewRequest
            ? { classificationReviewRequest }
            : {}),
        },
      );
      enrichment = output
        ? {
            status: "curated",
            summary: output.summary,
            capabilities: [...output.capabilities],
            classification_review: output.classification_review,
            result: output.result,
            change_reasons: [...output.change_reasons],
            policy_signal: output.policy_signal,
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

  return withPublicationMetadata(
    await draftProjectRecord({
      admitted: decision,
    observation,
    snapshot,
    enrichment,
    frontendVocabulary: data.vocabulary,
    frontendProjects: data.projects,
    summaryAuthority,
    sourceIssueNumber: issue.number,
    copyRequired: true,
      now,
    }),
    decision,
  );
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
