import { parseSubmissionPullRequestMarker } from "../submissions/project-submission-pr.mjs";

const markerStart = "<!-- tavernary-project-owner-pr";
const PROJECT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const LOGIN_PATTERN = /^(?!-)[A-Za-z0-9-]{1,39}(?<!-)$/u;
const OPERATIONS = new Set(["edit-card", "move-source", "delist"]);

function safeText(value, limit = 400) {
  const rendered =
    typeof value === "string" ? value : JSON.stringify(value, null, 0);
  const normalized = String(rendered ?? "")
    .replace(/<!--/gu, "&lt;!--")
    .replace(/-->/gu, "--&gt;")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const bounded =
    normalized.length <= limit
      ? normalized
      : `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  return bounded.replace(/\\/gu, "\\\\").replace(/([[\]()*_`#<>|])/gu, "\\$1");
}

function fieldLabel(key) {
  const words = key.replace(/_/gu, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function renderValues(values) {
  const entries = Object.entries(values ?? {}).sort(([left], [right]) =>
    left.localeCompare(right),
  );
  if (entries.length === 0) return "- None.";
  return entries
    .map(([key, value]) => `- **${fieldLabel(key)}:** ${safeText(value)}`)
    .join("\n");
}

function expectedPaths(projectId, operation) {
  if (!PROJECT_ID_PATTERN.test(projectId) || !OPERATIONS.has(operation)) {
    return null;
  }
  const registry = `data/registry/projects/${projectId}.json`;
  return operation === "move-source"
    ? [registry, `data/snapshots/github/${projectId}.json`]
    : [registry];
}

function exactPaths(paths, expected) {
  return (
    Array.isArray(paths) &&
    paths.length === expected?.length &&
    paths.every((path, index) => path === expected[index])
  );
}

function validMarker(marker) {
  const allowed = new Set([
    "schema_version",
    "issue_number",
    "project_id",
    "operation",
    "repository_id",
    "verified_owner_login",
    "generated_head_sha",
    "generated_paths",
  ]);
  if (
    !marker ||
    typeof marker !== "object" ||
    Array.isArray(marker) ||
    Object.keys(marker).some((key) => !allowed.has(key)) ||
    marker.schema_version !== 1 ||
    !Number.isSafeInteger(marker.issue_number) ||
    marker.issue_number < 1 ||
    !PROJECT_ID_PATTERN.test(marker.project_id) ||
    !OPERATIONS.has(marker.operation) ||
    !Number.isSafeInteger(marker.repository_id) ||
    marker.repository_id < 1 ||
    !LOGIN_PATTERN.test(marker.verified_owner_login) ||
    !/^[a-f0-9]{40}$/u.test(marker.generated_head_sha)
  ) {
    return false;
  }
  return exactPaths(
    marker.generated_paths,
    expectedPaths(marker.project_id, marker.operation),
  );
}

export function ownerRequestBranch(issueNumber) {
  if (!Number.isSafeInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Owner request issue number must be a positive integer.");
  }
  return `automation/project-owner-request-${issueNumber}`;
}

export function renderOwnerRequestPullRequest(input) {
  if (
    input?.issueNumber !== input?.marker?.issue_number ||
    input?.report?.issue_number !== input?.issueNumber ||
    !validMarker(input?.marker) ||
    input.report.project_id !== input.marker.project_id ||
    input.report.operation !== input.marker.operation ||
    input.report.repository_id !== input.marker.repository_id ||
    input.report.verified_owner_login !== input.marker.verified_owner_login ||
    !exactPaths(input.report.generated_paths, input.marker.generated_paths)
  ) {
    throw new Error("Owner pull request review input is inconsistent.");
  }
  const warnings =
    input.report.warnings?.length > 0
      ? input.report.warnings
          .slice(0, 20)
          .map((warning) => `- ${safeText(warning, 240)}`)
          .join("\n")
      : "- None.";
  return [
    markerStart,
    JSON.stringify(input.marker),
    "-->",
    `# Project owner request: ${safeText(input.projectName, 160)}`,
    "",
    `Closes #${input.issueNumber}`,
    "",
    `Verified repository owner: \`${input.marker.verified_owner_login}\``,
    "",
    `Operation: \`${input.marker.operation}\``,
    "",
    "This pull request is a maintainer review surface. It is never automatically merged.",
    "",
    "## Before",
    "",
    renderValues(input.report.before),
    "",
    "## After",
    "",
    renderValues(input.report.after),
    "",
    "## Warnings",
    "",
    warnings,
    "",
    "## Maintainer checklist",
    "",
    "- [ ] Repository identity and personal-owner authority were verified",
    "- [ ] Requested before and after values are accurate",
    "- [ ] Enrichment policy and refresh policy effects are appropriate",
    "- [ ] Only the marker-owned registry and optional source-move snapshot paths changed",
    "",
  ].join("\n");
}

export function parseOwnerRequestPullRequestMarker(body) {
  if (typeof body !== "string") return null;
  const start = body.indexOf(markerStart);
  if (start < 0 || body.indexOf(markerStart, start + markerStart.length) >= 0) {
    return null;
  }
  const jsonStart = body.indexOf("\n", start);
  const end = body.indexOf("-->", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    const marker = JSON.parse(body.slice(jsonStart, end).trim());
    return validMarker(marker) ? marker : null;
  } catch {
    return null;
  }
}

function sourceOwnedPath(path) {
  return (
    /^data\/registry\/projects\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(path) ||
    /^data\/snapshots\/github\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/u.test(path)
  );
}

function collisionMarker(pull) {
  const owner = parseOwnerRequestPullRequestMarker(pull.body ?? "");
  if (owner) {
    return {
      kind: "project-owner",
      issueNumber: owner.issue_number,
      branch: ownerRequestBranch(owner.issue_number),
      paths: owner.generated_paths,
    };
  }
  const submission = parseSubmissionPullRequestMarker(pull.body ?? "");
  if (submission) {
    return {
      kind: "project-submission",
      issueNumber: submission.issue_number,
      branch: `automation/project-submission-${submission.issue_number}`,
      paths: submission.generated_paths.filter(sourceOwnedPath),
    };
  }
  return null;
}

export function findOwnerRequestPathCollision({
  repository,
  issueNumber,
  generatedPaths,
  pulls = [],
}) {
  const intended = new Set(generatedPaths);
  for (const pull of pulls) {
    const marker = collisionMarker(pull);
    if (
      (typeof pull.state === "string" && pull.state !== "open") ||
      !marker ||
      (marker.kind === "project-owner" && marker.issueNumber === issueNumber) ||
      pull.head?.repo?.full_name?.toLocaleLowerCase() !==
        repository.toLocaleLowerCase() ||
      pull.head?.ref !== marker.branch
    ) {
      continue;
    }
    const paths = marker.paths.filter((path) => intended.has(path));
    if (paths.length === 0) continue;
    return {
      issueNumber: marker.issueNumber,
      prNumber: pull.number,
      prUrl: pull.html_url,
      paths,
    };
  }
  return null;
}

export function planOwnerPrUpdate(input) {
  const expected = expectedPaths(input?.projectId, input?.operation);
  if (!expected || !exactPaths(input.generatedPaths, expected)) {
    throw new Error(
      "Owner request generated paths do not match the approved operation.",
    );
  }
  const existing = input.existingMarker;
  const existingOwnerMarker = existing?.marker;
  if (
    input.remoteHeadSha !== null &&
    (existing?.kind !== "project-owner" ||
      !validMarker(existingOwnerMarker) ||
      existingOwnerMarker.issue_number !== input.issueNumber ||
      existingOwnerMarker.project_id !== input.projectId ||
      existingOwnerMarker.operation !== input.operation ||
      existingOwnerMarker.repository_id !== input.repositoryId ||
      existingOwnerMarker.verified_owner_login !== input.verifiedOwnerLogin ||
      !exactPaths(existingOwnerMarker.generated_paths, input.generatedPaths))
  ) {
    return {
      action: "conflict",
      reasonCode: "existing-marker-mismatch",
      message:
        "The existing branch is not owned by this exact project owner request.",
    };
  }
  const collision = findOwnerRequestPathCollision({
    repository: input.repository,
    issueNumber: input.issueNumber,
    generatedPaths: input.generatedPaths,
    pulls: input.pulls,
  });
  if (collision) {
    return {
      action: "conflict",
      reasonCode: "generated-path-collision",
      message: "An open generated pull request already owns this project path.",
      collision,
    };
  }
  if (input.remoteHeadSha === null) {
    return { action: "create", replacePaths: [...input.generatedPaths] };
  }
  if (input.remoteHeadSha !== existingOwnerMarker.generated_head_sha) {
    return {
      action: "conflict",
      reasonCode: "maintainer-divergence",
      message:
        "The owner request pull request contains maintainer changes. Regeneration is refused; continue review on the existing branch.",
    };
  }
  if (!input.generatedContentChanged) return { action: "noop" };
  return { action: "update", replacePaths: [...input.generatedPaths] };
}
