import { canonicalSourceUrl } from "../../src/features/catalog/source-record.mjs";

export function resolveForkRelationship({
  snapshot,
  recordsByRepositoryId,
  publicProjectIds,
  sourcesByRepositoryKey,
  publicProjectsBySourceId,
}) {
  const repository = snapshot?.repository;
  const parent = repository?.parent;
  if (repository?.fork !== true || !parent || parent.id === repository.id) {
    return null;
  }

  if (sourcesByRepositoryKey && publicProjectsBySourceId) {
    const parentSource =
      sourcesByRepositoryKey.get(`${snapshot.provider}:${parent.id}`) ?? null;
    const publicParents = parentSource
      ? (publicProjectsBySourceId.get(parentSource.id) ?? [])
      : [];
    if (snapshot.source_health === "unavailable") {
      return {
        parentName:
          publicParents.length === 1 ? publicParents[0].name : parent.name,
        parentProjectId: null,
        parentUrl: null,
        status: "unavailable",
      };
    }
    if (!parentSource) {
      return {
        parentName: parent.name,
        parentProjectId: null,
        parentUrl: null,
        status: "not-listed",
      };
    }
    if (publicParents.length === 1) {
      return {
        parentName: publicParents[0].name,
        parentProjectId: publicParents[0].id,
        parentUrl: null,
        status: "published",
      };
    }
    if (publicParents.length > 1) {
      return {
        parentName: parent.name,
        parentProjectId: null,
        parentUrl: canonicalSourceUrl(parentSource),
        status: "repository",
      };
    }
    return {
      parentName: parent.name,
      parentProjectId: null,
      parentUrl: null,
      status: "unavailable",
    };
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
      parentUrl: null,
      status: "unavailable",
    };
  }

  if (parentRecord && publicProjectIds.has(parentRecord.id)) {
    return {
      parentName,
      parentProjectId: parentRecord.id,
      parentUrl: null,
      status: "published",
    };
  }

  return {
    parentName,
    parentProjectId: null,
    parentUrl: null,
    status: "not-listed",
  };
}
