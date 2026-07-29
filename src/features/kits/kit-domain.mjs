import { containsDisallowedKitLanguage } from "./severe-language-policy.mjs";

export function kitSetKey(projectIds) {
  return [...new Set(projectIds)].sort().join("\n");
}

const markupOrLink = /(?:https?:\/\/|www\.|<[^>]+>|\[[^\]]+\]\([^)]+\))/iu;

export function validateKitDraft(draft, projects) {
  const errors = [];
  const title = draft.title.trim();
  const byId = new Map(projects.map((project) => [project.id, project]));
  const resolved = draft.projectIds.map((id) => byId.get(id));
  const frontendCount = resolved.filter(
    (project) => project?.kind === "frontend",
  ).length;
  const nonFrontendCount = resolved.filter(
    (project) => project && project.kind !== "frontend",
  ).length;

  if (title.length < 3 || title.length > 60) {
    errors.push("Title must contain 3–60 characters.");
  }
  if (draft.description.trim().length < 1 || draft.description.length > 600) {
    errors.push("Description must contain 1–600 characters.");
  }
  if (containsDisallowedKitLanguage(title)) {
    errors.push("Title contains language Tavernary doesn't allow.");
  }
  if (containsDisallowedKitLanguage(draft.description)) {
    errors.push("Description contains language Tavernary doesn't allow.");
  }
  if (markupOrLink.test(title) || markupOrLink.test(draft.description)) {
    errors.push("Kit text cannot contain links or markup.");
  }
  if (draft.projectIds.length < 3 || draft.projectIds.length > 50) {
    errors.push("A Kit must contain 3–50 projects.");
  }
  if (new Set(draft.projectIds).size !== draft.projectIds.length) {
    errors.push("A Kit cannot contain duplicate projects.");
  }
  if (resolved.some((project) => !project)) {
    errors.push("Every Kit project must exist in the catalog.");
  }
  if (
    resolved.some(
      (project) =>
        project &&
        ((project.visibility !== undefined &&
          project.visibility !== "published") ||
          (project.listing_status !== undefined &&
            project.listing_status !== "active")),
    )
  ) {
    errors.push("A Kit cannot contain flagged projects.");
  }
  if (frontendCount !== 1) {
    errors.push("A Kit requires exactly one Frontend.");
  }
  if (frontendCount === 1 && resolved[0]?.kind !== "frontend") {
    errors.push("The Kit Frontend must be the first project.");
  }
  if (nonFrontendCount < 2) {
    errors.push("A Kit requires at least two non-Frontend projects.");
  }

  return { valid: errors.length === 0, errors };
}
