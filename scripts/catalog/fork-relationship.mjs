export function resolveForkRelationship({
  snapshot,
  recordsByRepositoryId,
  publicProjectIds,
}) {
  const repository = snapshot?.repository;
  const parent = repository?.parent;
  if (repository?.fork !== true || !parent || parent.id === repository.id) {
    return null;
  }

  const parentRecord =
    recordsByRepositoryId.get(`${snapshot.provider}:${parent.id}`) ??
    recordsByRepositoryId.get(parent.id) ??
    null;
  const parentName = parentRecord?.name ?? parent.name;

  if (snapshot.source_health === "unavailable") {
    return {
      parentName,
      parentProjectId: null,
      status: "unavailable",
    };
  }

  if (parentRecord && publicProjectIds.has(parentRecord.id)) {
    return {
      parentName,
      parentProjectId: parentRecord.id,
      status: "published",
    };
  }

  return {
    parentName,
    parentProjectId: null,
    status: "not-listed",
  };
}
