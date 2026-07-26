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
  return bounded.replace(/\\/gu, "\\\\").replace(/([[\]()*_`#<>|])/gu, "\\$1");
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
    .map(([key, value]) => `- **${labelFor(key)}:** ${safeText(value)}`)
    .join("\n");
}

export function submissionBranch(issueNumber) {
  if (!Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Submission issue number must be a positive integer.");
  }
  return `automation/project-submission-${issueNumber}`;
}

export function renderSubmissionPullRequest(input) {
  const warningLines =
    input.report.warnings.length > 0
      ? input.report.warnings
          .map((warning) => `- ${safeText(warning)}`)
          .join("\n")
      : "- None.";
  return [
    `${markerStart}`,
    JSON.stringify(input.marker),
    "-->",
    `# Project submission: ${safeText(input.projectName)}`,
    "",
    `Closes #${input.issueNumber}`,
    "",
    "This pull request is the maintainer review surface for the generated catalog proposal. Edit the proposed files directly when corrections are needed.",
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
    "## Warnings",
    "",
    warningLines,
    "",
    "## Maintainer checklist",
    "",
    "- [ ] Canonical source and permanent identity are correct",
    "- [ ] Project kind and supported frontends are correct",
    "- [ ] Name and summary are factual",
    "- [ ] Primary function and capabilities are appropriate",
    "- [ ] License, archival, and source warnings were reviewed",
    "- [ ] The generated card passes CI",
    "",
  ].join("\n");
}

export function parseSubmissionPullRequestMarker(body) {
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
