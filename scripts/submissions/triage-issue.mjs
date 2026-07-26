import { appendFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  evaluateProjectSubmission,
  submissionQueueLabels,
} from "./admission.mjs";
import { reconcileFrontends } from "./frontend-reconciliation.mjs";
import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { safeProbe } from "./safe-source-fetch.mjs";
import {
  parseSourceIdentity,
  projectSubmissionTitle,
  resolveSourceIdentity,
} from "./source-identity.mjs";

const validationMarker = "<!-- tavernary-submission-validation -->";
const projectSubmissionStateMarker = "<!-- tavernary-project-submission-state";
const triageLabels = {
  "needs-maintainer-review": {
    color: "0e8a16",
    description: "Submission passed automation and awaits maintainer review.",
  },
  "needs-information": {
    color: "d93f0b",
    description:
      "Submission is missing or violates required source information.",
  },
  "duplicate-candidate": {
    color: "fbca04",
    description: "The submitted source may already exist in Tavernary.",
  },
  "submission-retryable": {
    color: "1d76db",
    description:
      "Submission triage hit a temporary failure and can be retried.",
  },
  "submission-pr-open": {
    color: "5319e7",
    description: "Submission has an open generated maintainer-review PR.",
  },
  "submission-declined": {
    color: "6e7781",
    description: "Submission was declined during maintainer review.",
  },
};

export function parseIssueFields(body) {
  const fields = new Map();
  const sections = body.split(/^### /m).slice(1);
  for (const section of sections) {
    const [heading, ...content] = section.split(/\r?\n/);
    fields.set(
      heading.trim(),
      content
        .join("\n")
        .trim()
        .replace(/^_No response_$/i, ""),
    );
  }
  return {
    kind: fields.get("Project Type") ?? "",
    sourceUrl: fields.get("Project URL") ?? "",
  };
}

export function buildValidationComment(validation) {
  if (validation.errors.length === 0) {
    return [
      validationMarker,
      "Automated validation now passes. This submission is ready for maintainer review.",
    ].join("\n");
  }
  return [
    validationMarker,
    "Tavernary could not send this submission to maintainer review:",
    "",
    ...validation.errors.map((error) => `- ${error}`),
    "",
    "Edit the issue fields above and automated validation will run again.",
  ].join("\n");
}

export function parseProjectSubmissionStateMarker(body) {
  const start = body.indexOf(projectSubmissionStateMarker);
  if (start < 0) return null;
  const jsonStart = body.indexOf("\n", start);
  const end = body.indexOf("-->", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    const marker = JSON.parse(body.slice(jsonStart, end).trim());
    if (
      marker?.schema_version !== 1 ||
      (marker.generated_title !== null &&
        typeof marker.generated_title !== "string") ||
      typeof marker.status !== "string"
    ) {
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

function decisionLabel(decision, currentLabels) {
  if (
    decision.status === "admitted" &&
    currentLabels.includes("submission-pr-open")
  ) {
    return "submission-pr-open";
  }
  return {
    admitted: "needs-maintainer-review",
    duplicate: "duplicate-candidate",
    "needs-information": "needs-information",
    retryable: "submission-retryable",
  }[decision.status];
}

function decisionComment(decision) {
  if (decision.status === "duplicate") {
    return `This source is already cataloged as [${decision.existingProject.name}](${decision.existingProject.canonicalUrl}). The duplicate submission has been closed.`;
  }
  if (decision.status === "needs-information") {
    return [
      "Tavernary needs corrected information before it can create a review pull request:",
      "",
      ...decision.errors.map((error) => `- ${error}`),
      "",
      "Edit the issue fields above and automated triage will run again.",
    ].join("\n");
  }
  if (decision.status === "retryable") {
    return `Tavernary could not finish source inspection because of a temporary failure (${decision.code}): ${decision.message}`;
  }
  return "Automated admission passes. Tavernary will create or update the maintainer review pull request.";
}

export function buildProjectSubmissionTriage(decision, context) {
  const generatedTitle =
    context.generatedTitle ?? context.previousMarker?.generated_title ?? null;
  const automationOwnsTitle =
    context.currentTitle === "[Project submission]" ||
    context.currentTitle === context.previousMarker?.generated_title;
  const desiredTitle =
    automationOwnsTitle && generatedTitle
      ? generatedTitle
      : context.currentTitle;
  const label = decisionLabel(decision, context.currentLabels);
  const labels = [
    ...context.currentLabels.filter(
      (current) => !submissionQueueLabels.includes(current),
    ),
    label,
  ];
  const marker = {
    schema_version: 1,
    generated_title: generatedTitle,
    status: decision.status,
  };
  const commentBody = [
    projectSubmissionStateMarker,
    JSON.stringify(marker),
    "-->",
    decisionComment(decision),
  ].join("\n");
  const prAlreadyOpen = context.currentLabels.includes("submission-pr-open");

  return {
    desiredTitle,
    labels,
    commentBody,
    close: decision.status === "duplicate",
    closeReason: decision.status === "duplicate" ? "not_planned" : null,
    dispatchGeneration: decision.status === "admitted" && !prAlreadyOpen,
    marker,
    issueNumber: context.issueNumber,
  };
}

function sameLabels(left, right) {
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((label, index) => label === sortedRight[index])
  );
}

export async function synchronizeProjectSubmissionTriage(
  mutation,
  { issue, api, writeOutput },
) {
  const issuePatch = {};
  if (issue.title !== mutation.desiredTitle) {
    issuePatch.title = mutation.desiredTitle;
  }
  if (mutation.close && issue.state !== "closed") {
    issuePatch.state = "closed";
    issuePatch.state_reason = mutation.closeReason;
  }
  if (Object.keys(issuePatch).length > 0) {
    await api.updateIssue(issue.number, issuePatch);
  }
  if (!sameLabels(issue.labels, mutation.labels)) {
    await api.replaceLabels(issue.number, mutation.labels);
  }

  const comments = await api.listComments(issue.number);
  const existing = comments.find((comment) =>
    comment.body?.includes(projectSubmissionStateMarker),
  );
  if (existing) {
    if (existing.body !== mutation.commentBody) {
      await api.updateComment(existing.id, mutation.commentBody);
    }
  } else {
    await api.createComment(issue.number, mutation.commentBody);
  }

  if (writeOutput) {
    await writeOutput("admitted", String(mutation.dispatchGeneration));
    await writeOutput("issue_number", String(issue.number));
  }
}

async function loadCatalogData() {
  const directory = resolve("data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const projects = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
  const vocabulary = JSON.parse(
    await readFile(resolve("data/vocabularies/frontends.json"), "utf8"),
  );
  return { projects, vocabulary };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-submission-triage",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
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

async function ensureLabels(repository, request = github) {
  for (const [name, definition] of Object.entries(triageLabels)) {
    try {
      await request(`/repos/${repository}/labels`, {
        method: "POST",
        body: JSON.stringify({ name, ...definition }),
      });
    } catch (error) {
      if (error.status !== 422) throw error;
    }
  }
}

function labelsFromIssue(issue) {
  return issue.labels.map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

function existingProject(record) {
  try {
    const parsed =
      record.source.type === "github"
        ? parseSourceIdentity(`https://github.com/${record.source.repository}`)
        : parseSourceIdentity(record.source.url);
    const identity =
      parsed.kind === "github"
        ? { ...parsed, repositoryId: record.source.repository_id ?? null }
        : parsed;
    if (identity.kind === "reddit-share") return null;
    return {
      id: record.id,
      name: record.name,
      canonicalUrl: identity.canonicalUrl,
      identity,
    };
  } catch {
    return null;
  }
}

function retryableError(error) {
  return (
    error?.name === "TimeoutError" ||
    error?.name === "AbortError" ||
    error instanceof TypeError ||
    error?.status === 403 ||
    error?.status === 429 ||
    error?.status >= 500
  );
}

async function inspectSource(manifest, { request, probe }) {
  let parsed;
  try {
    parsed = parseSourceIdentity(manifest.source_url);
  } catch (error) {
    return {
      identity: null,
      errors: [error.message],
      sourceProbe: {
        status: "definitive",
        code: "source-invalid",
        message: error.message,
      },
    };
  }

  if (parsed.kind === "github") {
    try {
      let observation;
      const identity = await resolveSourceIdentity(parsed, {
        resolveGithub: async (repository) => {
          observation = await request(`/repos/${repository}`);
          return {
            id: observation.id,
            owner: observation.owner.login,
            name: observation.name,
            url: observation.html_url,
          };
        },
      });
      return {
        identity,
        sourceProbe: { status: "ok", httpStatus: 200 },
        repository: {
          visibility: observation.private
            ? "private"
            : (observation.visibility ?? "public"),
          archived: observation.archived === true,
        },
      };
    } catch (error) {
      if (error.status === 404) {
        return {
          identity: parsed,
          sourceProbe: {
            status: "definitive",
            code: "github-repository-unavailable",
            message:
              "The GitHub repository is private, deleted, or does not exist.",
          },
        };
      }
      return {
        identity: parsed,
        sourceProbe: {
          status: "retryable",
          code: "github-api-failure",
          message: error.message,
        },
      };
    }
  }

  try {
    const identity = await resolveSourceIdentity(parsed, { probe });
    if (parsed.kind !== "reddit-share") {
      const result = await probe(identity.canonicalUrl);
      if ([404, 410].includes(result.status)) {
        return {
          identity,
          sourceProbe: {
            status: "definitive",
            code: "source-not-found",
            message: `The submitted source returned HTTP ${result.status}.`,
          },
        };
      }
      if (result.status === 429 || result.status >= 500) {
        return {
          identity,
          sourceProbe: {
            status: "retryable",
            code: "source-temporary-failure",
            message: `The submitted source returned HTTP ${result.status}.`,
          },
        };
      }
      if (result.status >= 400) {
        return {
          identity,
          sourceProbe: {
            status: "definitive",
            code: "source-unavailable",
            message: `The submitted source returned HTTP ${result.status}.`,
          },
        };
      }
    }
    return {
      identity,
      sourceProbe: { status: "ok", httpStatus: 200 },
    };
  } catch (error) {
    if (error.code === "reddit-share-unresolved") {
      return {
        identity: parsed.kind === "reddit-share" ? null : parsed,
        errors: [error.message],
        sourceProbe: {
          status: "definitive",
          code: error.code,
          message: error.message,
        },
      };
    }
    if (retryableError(error)) {
      return {
        identity: parsed.kind === "reddit-share" ? null : parsed,
        sourceProbe: {
          status: "retryable",
          code: "source-request-failure",
          message: error.message,
        },
      };
    }
    return {
      identity: parsed.kind === "reddit-share" ? null : parsed,
      errors: [error.message],
      sourceProbe: {
        status: "definitive",
        code: "source-invalid",
        message: error.message,
      },
    };
  }
}

function triageApi(repository, request) {
  return {
    updateIssue: (issueNumber, patch) =>
      request(`/repos/${repository}/issues/${issueNumber}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    replaceLabels: (issueNumber, labels) =>
      request(`/repos/${repository}/issues/${issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels }),
      }),
    listComments: (issueNumber) =>
      request(
        `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
      ),
    updateComment: (commentId, body) =>
      request(`/repos/${repository}/issues/comments/${commentId}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      }),
    createComment: (issueNumber, body) =>
      request(`/repos/${repository}/issues/${issueNumber}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
  };
}

export async function processProjectSubmissionTriage({
  event,
  request,
  probe = safeProbe,
  catalogData,
  writeOutput,
}) {
  const repository = event.repository.full_name;
  const issue = {
    ...event.issue,
    labels: labelsFromIssue(event.issue),
  };
  const data = catalogData ?? (await loadCatalogData());
  const parsed = parseProjectSubmissionIssue(issue.body ?? "");
  let decision;
  let identity = null;

  if (!parsed.valid) {
    decision = evaluateProjectSubmission({
      manifest: null,
      identity: null,
      sourceProbe: {
        status: "definitive",
        code: "manifest-invalid",
        message: parsed.errors.join(" "),
      },
      existingProjects: [],
      frontendResolution: {
        status: "needs-information",
        errors: parsed.errors,
        suggestions: [],
      },
      errors: parsed.errors,
    });
  } else {
    const inspection = await inspectSource(parsed.manifest, {
      request,
      probe,
    });
    identity = inspection.identity;
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
    decision = evaluateProjectSubmission({
      manifest: parsed.manifest,
      identity,
      sourceProbe: inspection.sourceProbe,
      repository: inspection.repository,
      existingProjects: data.projects
        .map(existingProject)
        .filter((project) => project !== null),
      frontendResolution,
      errors: inspection.errors,
      warnings: [],
    });
  }

  await ensureLabels(repository, request);
  const comments = await request(
    `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
  );
  const previousMarker =
    comments
      .map((comment) => parseProjectSubmissionStateMarker(comment.body ?? ""))
      .find(Boolean) ?? null;
  const generatedTitle =
    identity && identity.kind !== "reddit-share"
      ? projectSubmissionTitle(identity)
      : null;
  const mutation = buildProjectSubmissionTriage(decision, {
    issueNumber: issue.number,
    currentTitle: issue.title,
    currentLabels: issue.labels,
    generatedTitle,
    previousMarker,
  });
  const api = triageApi(repository, request);
  const cachedApi = {
    ...api,
    listComments: async () => comments,
  };
  await synchronizeProjectSubmissionTriage(mutation, {
    issue,
    api: cachedApi,
    writeOutput,
  });
  return decision;
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (!event.issue) return;
  await processProjectSubmissionTriage({
    event,
    request: github,
    writeOutput: process.env.GITHUB_OUTPUT
      ? (name, value) =>
          appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`, "utf8")
      : undefined,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
