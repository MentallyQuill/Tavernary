const REPOSITORY_PROVIDERS = new Set(["github", "codeberg"]);

export function repositorySourceId(provider, repositoryId) {
  if (!REPOSITORY_PROVIDERS.has(provider)) {
    throw new Error(`Unsupported repository provider: ${provider}`);
  }
  if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
    throw new Error("Repository source ID requires a positive repository ID.");
  }
  return `${provider}-${repositoryId}`;
}

export function legacySourceId(project) {
  const source = project?.source;
  if (!source || typeof source.type !== "string") {
    throw new Error("Legacy project requires an inline source.");
  }
  if (REPOSITORY_PROVIDERS.has(source.type)) {
    return repositorySourceId(source.type, source.repository_id);
  }
  if (source.type === "github-organization") {
    return `github-organization-${project.id}`;
  }
  if (source.type === "url") {
    return `url-${project.id}`;
  }
  throw new Error(`Unsupported legacy source type: ${source.type}`);
}

export function canonicalSourceUrl(source) {
  if (source?.type === "github") {
    return `https://github.com/${source.repository}`;
  }
  if (source?.type === "codeberg") {
    return `https://codeberg.org/${source.repository}`;
  }
  if (
    (source?.type === "github-organization" || source?.type === "url") &&
    typeof source.url === "string"
  ) {
    return source.url;
  }
  throw new Error(`Unsupported source type: ${source?.type ?? "missing"}`);
}

export function siblingProjectId(source, title) {
  const namespace = REPOSITORY_PROVIDERS.has(source?.type)
    ? source.repository
    : source?.id;
  const value = `${namespace ?? ""}-${title ?? ""}`
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
  if (!value) {
    throw new Error("Sibling card title cannot produce a project ID.");
  }
  return value;
}
