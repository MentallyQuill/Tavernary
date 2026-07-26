export interface GithubSourceIdentity {
  kind: "github";
  canonicalUrl: string;
  repository: string;
  repositoryId: number | null;
  owner: string;
  name: string;
}

export interface RedditSourceIdentity {
  kind: "reddit";
  canonicalUrl: string;
  postId: string;
  subreddit: string | null;
  slug: string | null;
}

export interface ExternalSourceIdentity {
  kind: "external";
  canonicalUrl: string;
  hostname: string;
  pathSlug: string;
}

export type SourceIdentity =
  GithubSourceIdentity | RedditSourceIdentity | ExternalSourceIdentity;

export function parseSourceIdentity(value: string): SourceIdentity;

export function resolveSourceIdentity(
  identity: SourceIdentity,
  options?: {
    resolveGithub?: (repository: string) => Promise<{
      id: number;
      owner: string;
      name: string;
      url?: string;
    }>;
  },
): Promise<SourceIdentity>;

export function sourceDuplicateKeys(identity: SourceIdentity): string[];

export function projectSubmissionTitle(identity: SourceIdentity): string;
