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
  const issueKeys = [
    "ancestry_repository_ids",
    "dependent_issue_number",
    "repository_id",
    "schema_version",
  ];
  const projectKeys = [
    "ancestry_repository_ids",
    "dependent_project_ids",
    "repository_id",
    "schema_version",
  ];
  const ancestry = marker.ancestry_repository_ids;
  const dependentProjectIds = marker.dependent_project_ids;
  const issueMarker =
    keys.length === issueKeys.length &&
    keys.every((key, index) => key === issueKeys[index]) &&
    Number.isInteger(marker.dependent_issue_number) &&
    marker.dependent_issue_number > 0;
  const projectMarker =
    keys.length === projectKeys.length &&
    keys.every((key, index) => key === projectKeys[index]) &&
    Array.isArray(dependentProjectIds) &&
    dependentProjectIds.length > 0 &&
    dependentProjectIds.every(
      (id) => typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id),
    ) &&
    new Set(dependentProjectIds).size === dependentProjectIds.length;
  if (
    (!issueMarker && !projectMarker) ||
    marker.schema_version !== 1 ||
    !Number.isInteger(marker.repository_id) ||
    marker.repository_id <= 0 ||
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
  dependentProjectIds,
  manifest,
  ancestryRepositoryIds,
}) {
  const ancestry = extendAncestry(
    ancestryRepositoryIds,
    dependency.repositoryId,
  );
  const hasDependentIssue =
    Number.isInteger(dependentIssueNumber) && dependentIssueNumber > 0;
  const hasDependentProjects =
    Array.isArray(dependentProjectIds) && dependentProjectIds.length > 0;
  if (hasDependentIssue === hasDependentProjects) {
    throw new Error(
      "Fork upstream provenance requires one dependent issue or project list.",
    );
  }
  const marker = {
    schema_version: 1,
    repository_id: dependency.repositoryId,
    ...(hasDependentIssue
      ? { dependent_issue_number: dependentIssueNumber }
      : { dependent_project_ids: uniqueProjectIds(dependentProjectIds) }),
    ancestry_repository_ids: ancestry,
  };
  const dependentDescription = hasDependentIssue
    ? `#${dependentIssueNumber}`
    : `catalog project${dependentProjectIds.length === 1 ? "" : "s"} ${dependentProjectIds.join(", ")}`;
  const upstreamManifest = {
    ...manifest,
    source_url: dependency.canonicalUrl,
    additional_context:
      `This project was automatically discovered as the immediate upstream of ${dependentDescription}. ` +
      "Its classification was inherited from the dependent fork for review.",
  };
  return {
    title: `[Project submission] ${dependency.repository}`,
    body: [
      upstreamMarker,
      JSON.stringify(marker),
      "-->",
      `This project was automatically discovered as the immediate upstream of ${dependentDescription}.`,
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

function uniqueProjectIds(projectIds) {
  const unique = [...new Set(projectIds)];
  if (
    unique.length !== projectIds.length ||
    unique.some(
      (id) => typeof id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id),
    )
  ) {
    throw new Error("Fork dependent project IDs are malformed.");
  }
  return unique.sort((left, right) => left.localeCompare(right));
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
  dependentProjectIds,
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
    dependentProjectIds,
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
  sources,
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

  const parentSource = sources.find(
    (source) =>
      source.type === "github" && source.repository_id === parent.repositoryId,
  );
  const parentProjects = parentSource
    ? projects
        .filter((project) => project.source_id === parentSource.id)
        .sort((left, right) => left.id.localeCompare(right.id))
    : [];
  const publishedParent = parentProjects.find(
    (project) => project.listing_status === "active",
  );
  if (publishedParent) {
    return {
      status: "published",
      parentProjectId: publishedParent.id,
    };
  }
  if (parentSource || priorSubmission?.state === "declined") {
    return { status: "not-listed", dependency };
  }

  return { status: "waiting", dependency };
}
