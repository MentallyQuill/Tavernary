function dependencyFrom(parent, issueNumber) {
  return {
    repositoryId: parent.repositoryId,
    name: parent.name,
    repository: parent.repository,
    canonicalUrl: parent.canonicalUrl,
    issueNumber,
  };
}

const upstreamMarker = "<!-- tavernary-fork-upstream";
const submissionStateMarker = "<!-- tavernary-project-submission-state";

function markerJson(body, markerPrefix) {
  const start = body.indexOf(markerPrefix);
  if (start < 0) return null;
  const jsonStart = body.indexOf("\n", start);
  const end = body.indexOf("-->", jsonStart);
  if (jsonStart < 0 || end < 0) return null;
  try {
    return JSON.parse(body.slice(jsonStart, end).trim());
  } catch {
    return null;
  }
}

export function parseForkUpstreamMarker(body) {
  const marker = markerJson(body, upstreamMarker);
  if (!marker || typeof marker !== "object") return null;
  const keys = Object.keys(marker).sort();
  const expectedKeys = [
    "ancestry_repository_ids",
    "dependent_issue_number",
    "repository_id",
    "schema_version",
  ];
  const ancestry = marker.ancestry_repository_ids;
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    marker.schema_version !== 1 ||
    !Number.isInteger(marker.repository_id) ||
    marker.repository_id <= 0 ||
    !Number.isInteger(marker.dependent_issue_number) ||
    marker.dependent_issue_number <= 0 ||
    !Array.isArray(ancestry) ||
    ancestry.length < 2 ||
    ancestry.length > 16 ||
    ancestry.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ancestry).size !== ancestry.length ||
    ancestry.at(-1) !== marker.repository_id
  ) {
    return null;
  }
  return marker;
}

function extendAncestry(ancestryRepositoryIds, repositoryId) {
  if (
    !Array.isArray(ancestryRepositoryIds) ||
    ancestryRepositoryIds.length < 1 ||
    ancestryRepositoryIds.some((id) => !Number.isInteger(id) || id <= 0) ||
    new Set(ancestryRepositoryIds).size !== ancestryRepositoryIds.length
  ) {
    throw new Error("Fork ancestry repository IDs are malformed.");
  }
  if (ancestryRepositoryIds.includes(repositoryId)) {
    throw new Error("Fork ancestry contains a repeated repository ID.");
  }
  if (ancestryRepositoryIds.length >= 16) {
    throw new Error(
      "Fork ancestry reached the 16-repository automation limit.",
    );
  }
  return [...ancestryRepositoryIds, repositoryId];
}

export function renderForkParentIssue({
  dependency,
  dependentIssueNumber,
  manifest,
  ancestryRepositoryIds,
}) {
  const ancestry = extendAncestry(
    ancestryRepositoryIds,
    dependency.repositoryId,
  );
  const marker = {
    schema_version: 1,
    repository_id: dependency.repositoryId,
    dependent_issue_number: dependentIssueNumber,
    ancestry_repository_ids: ancestry,
  };
  const upstreamManifest = {
    ...manifest,
    source_url: dependency.canonicalUrl,
    name: dependency.name,
    description: null,
    additional_context:
      `This project was automatically discovered as the immediate upstream of #${dependentIssueNumber}. ` +
      "Its classification was inherited from the dependent fork for review.",
  };
  return {
    title: `[Project submission] ${dependency.repository}`,
    body: [
      upstreamMarker,
      JSON.stringify(marker),
      "-->",
      `This project was automatically discovered as the immediate upstream of #${dependentIssueNumber}.`,
      "Maintainers must correct any inherited classification before merge.",
      "",
      "### Project manifest",
      "",
      "```json",
      JSON.stringify(upstreamManifest, null, 2),
      "```",
    ].join("\n"),
    labels: ["issue-admitted", "project-submission"],
  };
}

function labelsFromIssue(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

function sourceRepositoryIdFromStateMarker(body) {
  const marker = markerJson(body, submissionStateMarker);
  return marker?.schema_version === 1 &&
    (marker.generated_title === null ||
      typeof marker.generated_title === "string") &&
    typeof marker.status === "string" &&
    Number.isInteger(marker.source_repository_id) &&
    marker.source_repository_id > 0
    ? marker.source_repository_id
    : null;
}

async function issueMatchesRepositoryId({
  repository,
  issue,
  repositoryId,
  request,
}) {
  if (issue.pull_request) return false;
  const upstream = parseForkUpstreamMarker(issue.body ?? "");
  if (upstream?.repository_id === repositoryId) return true;
  const comments = await request(
    `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
  );
  return comments.some(
    (comment) =>
      sourceRepositoryIdFromStateMarker(comment.body ?? "") === repositoryId,
  );
}

function existingSubmissionResult(issue) {
  const labels = labelsFromIssue(issue);
  if (issue.state !== "closed") {
    return {
      issueNumber: issue.number,
      state: "open",
      dispatchTriage: labels.includes("submission-retryable"),
    };
  }
  return {
    issueNumber: issue.number,
    state: labels.includes("submission-declined") ? "declined" : "merged",
    dispatchTriage: false,
  };
}

export async function ensureForkParentSubmission({
  repository,
  dependency,
  dependentIssueNumber,
  manifest,
  ancestryRepositoryIds,
  request,
}) {
  if (dependency.issueNumber !== null) {
    try {
      const prior = await request(
        `/repos/${repository}/issues/${dependency.issueNumber}`,
      );
      if (
        await issueMatchesRepositoryId({
          repository,
          issue: prior,
          repositoryId: dependency.repositoryId,
          request,
        })
      ) {
        return existingSubmissionResult(prior);
      }
    } catch (error) {
      if (error.status !== 404) throw error;
    }
  }

  let page = 1;
  while (true) {
    const issues = await request(
      `/repos/${repository}/issues?state=all&labels=project-submission&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      if (
        await issueMatchesRepositoryId({
          repository,
          issue,
          repositoryId: dependency.repositoryId,
          request,
        })
      ) {
        return existingSubmissionResult(issue);
      }
    }
    if (issues.length < 100) break;
    page += 1;
  }

  const rendered = renderForkParentIssue({
    dependency,
    dependentIssueNumber,
    manifest,
    ancestryRepositoryIds,
  });
  const created = await request(`/repos/${repository}/issues`, {
    method: "POST",
    body: JSON.stringify(rendered),
  });
  return {
    issueNumber: created.number,
    state: "created",
    dispatchTriage: true,
  };
}

export function classifyForkDependency({
  repository,
  projects,
  priorSubmission,
  ancestryRepositoryIds,
}) {
  const parent = repository?.parent;
  if (repository?.fork !== true || !parent) {
    return { status: "none" };
  }

  const dependency = dependencyFrom(
    parent,
    priorSubmission?.issueNumber ?? null,
  );
  if (ancestryRepositoryIds.includes(parent.repositoryId)) {
    return { status: "not-listed", dependency, attention: "cycle" };
  }
  if (ancestryRepositoryIds.length >= 16) {
    return { status: "not-listed", dependency, attention: "depth-limit" };
  }

  const parentProject = projects.find(
    (project) =>
      project.repositoryId === parent.repositoryId ||
      (project.source?.type === "github" &&
        project.source.repository_id === parent.repositoryId),
  );
  if (parentProject?.visibility === "published") {
    return {
      status: "published",
      parentProjectId: parentProject.id,
    };
  }
  if (parentProject || priorSubmission?.state === "declined") {
    return { status: "not-listed", dependency };
  }

  return { status: "waiting", dependency };
}
