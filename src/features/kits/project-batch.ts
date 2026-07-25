import type { CatalogProject } from "@/features/catalog/catalog-types";

export type KitBatchPlan = {
  projectIds: string[];
  addedProjectIds: string[];
  skippedProjectIds: string[];
  replacedFrontendId: string | null;
  limitReached: boolean;
};

type ProjectIdentity = Pick<CatalogProject, "id" | "kind">;

export function planKitProjectBatch({
  draftProjectIds,
  selectedProjectIds,
  projects,
  limit = 50,
}: {
  draftProjectIds: string[];
  selectedProjectIds: string[];
  projects: ProjectIdentity[];
  limit?: number;
}): KitBatchPlan {
  const kindById = new Map(
    projects.map((project) => [project.id, project.kind]),
  );
  const currentFrontendId =
    draftProjectIds.find((id) => kindById.get(id) === "frontend") ?? null;
  const selectedFrontendId =
    selectedProjectIds.findLast((id) => kindById.get(id) === "frontend") ??
    null;
  const frontendId = selectedFrontendId ?? currentFrontendId;
  const stackProjectIds = draftProjectIds.filter(
    (id) => kindById.get(id) !== "frontend",
  );
  const addedProjectIds: string[] = [];
  const skippedProjectIds: string[] = [];
  let limitReached = false;

  for (const projectId of selectedProjectIds) {
    if (!kindById.has(projectId)) {
      skippedProjectIds.push(projectId);
      continue;
    }
    if (
      kindById.get(projectId) === "frontend" &&
      projectId !== selectedFrontendId
    ) {
      skippedProjectIds.push(projectId);
      continue;
    }
    if (projectId === selectedFrontendId) {
      if (projectId !== currentFrontendId) addedProjectIds.push(projectId);
      continue;
    }
    if (stackProjectIds.includes(projectId)) {
      skippedProjectIds.push(projectId);
    } else if (stackProjectIds.length + (frontendId ? 1 : 0) >= limit) {
      skippedProjectIds.push(projectId);
      limitReached = true;
    } else {
      stackProjectIds.push(projectId);
      addedProjectIds.push(projectId);
    }
  }

  return {
    projectIds: frontendId ? [frontendId, ...stackProjectIds] : stackProjectIds,
    addedProjectIds,
    skippedProjectIds,
    replacedFrontendId:
      selectedFrontendId && selectedFrontendId !== currentFrontendId
        ? currentFrontendId
        : null,
    limitReached,
  };
}
