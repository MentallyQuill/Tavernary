import { primaryFunctionLabel } from "./classification-review-notice.mjs";
import {
  createProjectPublicationTransaction,
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../publication/project-publication-transaction.mjs";

const markerStart = "<!-- tavernary-project-submission-pr";

function safeText(value, limit = 320) {
  const rendered =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);
  const normalized = String(rendered ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  const bounded =
    normalized.length <= limit
      ? normalized
      : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  return bounded
    .replace(/@/gu, "&#64;")
    .replace(/\\/gu, "\\\\")
    .replace(/([[\]()*_`#<>|])/gu, "\\$1");
}

const urlFieldKeys = new Set(["canonical_url", "source_url"]);

function renderUrlValue(value) {
  if (typeof value !== "string") return safeText(value);
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return safeText(value);
    return `[${safeText(url.href)}](<${url.href}>)`;
  } catch {
    return safeText(value);
  }
}

function renderGroupValue(key, value) {
  return urlFieldKeys.has(key) ? renderUrlValue(value) : safeText(value);
}

function labelFor(key) {
  const words = key.replace(/_/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderGroup(values) {
  const entries = Object.entries(values ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return "- None.";
  return entries
    .map(
      ([key, value]) =>
        `- **${labelFor(key)}:** ${renderGroupValue(key, value)}`,
    )
    .join("\n");
}

function mismatchReview(report) {
  const review = report.classificationReview;
  return review?.status === "possible-mismatch" ? review : null;
}

function renderClassificationReview(report) {
  const review = mismatchReview(report);
  if (!review) return [];
  const submittedId = safeText(review.submitted_primary_function, 80);
  const suggestedId = safeText(review.suggested_primary_function, 80);
  return [
    "## Classification review",
    "",
    "> [!WARNING]",
    `> The submitter selected **${primaryFunctionLabel(review.submitted_primary_function)}** (\`${submittedId}\`), while the optional intake review suggested **${primaryFunctionLabel(review.suggested_primary_function)}** (\`${suggestedId}\`).`,
    `> Review reason: ${safeText(review.explanation, 240)}`,
    "> The submitted value remains in the generated record unless a maintainer deliberately changes it during review.",
    "",
  ];
}

export function submissionBranch(issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Submission issue number must be a positive integer.");
  }
  return `automation/project-submission-${issueNumber}`;
}

export function renderSubmissionPullRequest(input) {
  const transaction = createProjectPublicationTransaction(input.marker);
  if (
    transaction.producer !== "project-submission" ||
    transaction.operation !== "create" ||
    transaction.publication_mode !== "automatic" ||
    transaction.issue_number !== input.issueNumber ||
    transaction.project_ids.length !== 1 ||
    transaction.project_ids[0] !== input.report.project_id ||
    transaction.source_id !== input.report.source_id
  ) {
    throw new Error("Submission pull request transaction is inconsistent.");
  }
  const classificationReview = mismatchReview(input.report);
  const warningLines =
    input.report.warnings.length > 0
      ? input.report.warnings
          .map((warning) => `- ${safeText(warning)}`)
          .join("\n")
      : "- None.";
  return [
    PROJECT_PUBLICATION_TRANSACTION_MARKER,
    JSON.stringify(transaction),
    "-->",
    `# Project submission: ${safeText(input.projectName)}`,
    "",
    `Closes #${input.issueNumber}`,
    "",
    "This pull request is the validation and audit transaction for the generated catalog proposal. Eligible transactions publish automatically after required checks pass.",
    "",
    "## Submitted",
    "",
    renderGroup(input.report.submitted),
    "",
    "## Observed",
    "",
    renderGroup(input.report.observed),
    "",
    "## Inferred",
    "",
    renderGroup(input.report.inferred),
    "",
    ...renderClassificationReview(input.report),
    "## Warnings",
    "",
    warningLines,
    "",
    "## Maintainer checklist",
    "",
    "- [ ] Canonical source and permanent identity are correct",
    "- [ ] Project kind and supported frontends are correct",
    "- [ ] Name and summary are factual",
    "- [ ] Primary function and Goals and traits tags are appropriate",
    ...(classificationReview
      ? ["- [ ] Possible primary-function mismatch was reviewed"]
      : []),
    "- [ ] License, archival, and source warnings were reviewed",
    "- [ ] The generated card passes CI",
    "",
  ].join("\n");
}

export function parseSubmissionPullRequestMarker(body) {
  const transaction = parseProjectPublicationTransaction(body);
  if (transaction) {
    return transaction.producer === "project-submission" &&
      transaction.operation === "create"
      ? transaction
      : null;
  }
  const start = body.indexOf(markerStart);
  if (start < 0) return null;
  const jsonStart = body.indexOf("\n", start);
  const end = body.indexOf("-->", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    const marker = JSON.parse(body.slice(jsonStart, end).trim());
    if (
      marker?.schema_version !== 1 ||
      !Number.isInteger(marker.issue_number) ||
      marker.issue_number < 1 ||
      typeof marker.generated_head_sha !== "string" ||
      !Array.isArray(marker.generated_paths) ||
      marker.generated_paths.some((path) => typeof path !== "string")
    ) {
      return null;
    }
    return marker;
  } catch {
    return null;
  }
}

export function findSubmissionPathCollision({
  repository,
  issueNumber,
  generatedPaths,
  pulls,
}) {
  const sourceOwnedPath = (path) =>
    /^data\/registry\/projects\/[^/]+\.json$/u.test(path) ||
    /^data\/registry\/sources\/[^/]+\.json$/u.test(path) ||
    /^data\/snapshots\/(?:github|codeberg)\/[^/]+\.json$/u.test(path);
  const intended = new Set(generatedPaths.filter(sourceOwnedPath));
  for (const pull of pulls) {
    const marker = parseSubmissionPullRequestMarker(pull.body ?? "");
    if (
      !marker ||
      marker.issue_number === issueNumber ||
      pull.head?.repo?.full_name?.toLowerCase() !== repository.toLowerCase() ||
      pull.head?.ref !== submissionBranch(marker.issue_number)
    ) {
      continue;
    }
    const paths = marker.generated_paths.filter(
      (path) => sourceOwnedPath(path) && intended.has(path),
    );
    if (paths.length === 0) continue;
    return {
      issueNumber: marker.issue_number,
      prNumber: pull.number,
      prUrl: pull.html_url,
      paths,
    };
  }
  return null;
}

export function planSubmissionPrUpdate(input) {
  if (input.remoteHeadSha === null) {
    return {
      action: "create",
      replacePaths: [...input.generatedPaths],
    };
  }
  if (input.remoteHeadSha !== input.markerHeadSha && !input.forceRegeneration) {
    return {
      action: "conflict",
      message:
        "The generated pull request contains maintainer changes. Use explicit force regeneration only when those generated paths may be replaced.",
    };
  }
  if (!input.generatedContentChanged) {
    return { action: "noop" };
  }
  return {
    action: "update",
    replacePaths: [...input.generatedPaths],
    forced: input.remoteHeadSha !== input.markerHeadSha,
  };
}
