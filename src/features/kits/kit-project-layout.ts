import type { CatalogProject } from "@/features/catalog/catalog-types";

type ProjectIdentity = Pick<CatalogProject, "id" | "kind">;

export type KitProjectLayout = {
  frontendId: string | null;
  stackProjectIds: string[];
};

export function splitKitProjectIds(
  projectIds: readonly string[],
  projects: readonly ProjectIdentity[],
): KitProjectLayout {
  const kindById = new Map(
    projects.map((project) => [project.id, project.kind]),
  );
  let frontendId: string | null = null;
  const stackProjectIds: string[] = [];

  for (const projectId of projectIds) {
    if (kindById.get(projectId) === "frontend") {
      frontendId ??= projectId;
    } else {
      stackProjectIds.push(projectId);
    }
  }

  return { frontendId, stackProjectIds };
}

export function normalizeKitProjectIds(
  projectIds: readonly string[],
  projects: readonly ProjectIdentity[],
): string[] {
  const { frontendId, stackProjectIds } = splitKitProjectIds(
    projectIds,
    projects,
  );
  return frontendId ? [frontendId, ...stackProjectIds] : stackProjectIds;
}

export function replaceKitFrontend(
  projectIds: readonly string[],
  frontendId: string,
  projects: readonly ProjectIdentity[],
): string[] {
  const replacement = projects.find((project) => project.id === frontendId);
  if (replacement?.kind !== "frontend") {
    throw new TypeError(`${frontendId} is not a Frontend project.`);
  }
  const { stackProjectIds } = splitKitProjectIds(projectIds, projects);
  return [frontendId, ...stackProjectIds];
}
