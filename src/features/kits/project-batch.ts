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
  projectsById,
  limit = 50,
}: {
  draftProjectIds: string[];
  selectedProjectIds: string[];
  projects: ProjectIdentity[];
  projectsById?: ReadonlyMap<string, ProjectIdentity>;
  limit?: number;
}): KitBatchPlan {
  const lookup =
    projectsById ?? new Map(projects.map((project) => [project.id, project]));
  const currentFrontendId =
    draftProjectIds.find((id) => lookup.get(id)?.kind === "frontend") ?? null;
  let selectedFrontendId: string | null = null;
  for (let index = selectedProjectIds.length - 1; index >= 0; index -= 1) {
    const projectId = selectedProjectIds[index];
    if (lookup.get(projectId)?.kind === "frontend") {
      selectedFrontendId = projectId;
      break;
    }
  }
  const frontendId = selectedFrontendId ?? currentFrontendId;
  const stackProjectIds = draftProjectIds.filter(
    (id) => lookup.get(id)?.kind !== "frontend",
  );
  const addedProjectIds: string[] = [];
  const skippedProjectIds: string[] = [];
  let limitReached = false;

  for (const projectId of selectedProjectIds) {
    if (!lookup.has(projectId)) {
      skippedProjectIds.push(projectId);
      continue;
    }
    if (
      lookup.get(projectId)?.kind === "frontend" &&
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
