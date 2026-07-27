import type { CatalogProject } from "./catalog-types";

type FrontendOption = {
  id: string;
  label: string;
};

export function orderFrontendOptionsByPopularity<T extends FrontendOption>(
  options: readonly T[],
  projects: readonly CatalogProject[],
): T[] {
  const scores = new Map<string, number>();

  for (const project of projects) {
    if (project.kind !== "frontend" || project.community === null) continue;
    for (const frontend of project.frontends) {
      const current = scores.get(frontend.id);
      if (current === undefined || project.community.aggregate > current) {
        scores.set(frontend.id, project.community.aggregate);
      }
    }
  }

  return [...options].sort((left, right) => {
    const leftScore = scores.get(left.id);
    const rightScore = scores.get(right.id);
    if (leftScore !== undefined && rightScore !== undefined) {
      const scoreOrder = rightScore - leftScore;
      if (scoreOrder !== 0) return scoreOrder;
    } else if (leftScore !== undefined) {
      return -1;
    } else if (rightScore !== undefined) {
      return 1;
    }

    return (
      left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
    );
  });
}
