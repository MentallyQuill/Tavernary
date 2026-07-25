export function addProject(projectIds: string[], projectId: string) {
  return projectIds.includes(projectId)
    ? projectIds
    : [...projectIds, projectId];
}

export function insertProject(
  projectIds: string[],
  projectId: string,
  index: number,
) {
  if (projectIds.includes(projectId)) return projectIds;
  const result = [...projectIds];
  result.splice(Math.max(0, Math.min(projectIds.length, index)), 0, projectId);
  return result;
}

export function removeProject(projectIds: string[], projectId: string) {
  return projectIds.includes(projectId)
    ? projectIds.filter((id) => id !== projectId)
    : projectIds;
}

export function moveProject(
  projectIds: string[],
  index: number,
  delta: number,
) {
  if (index < 0 || index >= projectIds.length) return projectIds;
  const destination = Math.max(
    0,
    Math.min(projectIds.length - 1, index + delta),
  );
  if (destination === index) return projectIds;
  const result = [...projectIds];
  const [projectId] = result.splice(index, 1);
  result.splice(destination, 0, projectId);
  return result;
}

export function reorderProject(
  projectIds: string[],
  projectId: string,
  afterProjectId: string,
) {
  if (projectId === afterProjectId) return projectIds;
  const source = projectIds.indexOf(projectId);
  const target = projectIds.indexOf(afterProjectId);
  if (source < 0 || target < 0) return projectIds;
  const result = projectIds.filter((id) => id !== projectId);
  const adjustedTarget = result.indexOf(afterProjectId);
  result.splice(adjustedTarget + 1, 0, projectId);
  return result.every((id, index) => id === projectIds[index])
    ? projectIds
    : result;
}
