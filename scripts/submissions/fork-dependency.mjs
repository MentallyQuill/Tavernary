function dependencyFrom(parent, issueNumber) {
  return {
    repositoryId: parent.repositoryId,
    name: parent.name,
    repository: parent.repository,
    canonicalUrl: parent.canonicalUrl,
    issueNumber,
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
