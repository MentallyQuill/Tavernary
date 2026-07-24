export type ReadmeSource = {
  repositoryDescription: string | null;
  readmeText: string | null;
  readmePath: string | null;
  readmeRef: string | null;
};

export type GithubClient = (
  path: string,
  options?: { ref?: string },
) => Promise<Record<string, unknown> | null>;

export function loadReadmeSource(
  record: Record<string, unknown>,
  snapshot: Record<string, unknown>,
  options?: { github?: GithubClient },
): Promise<ReadmeSource>;
