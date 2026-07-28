export type RepositoryProviderName = "github" | "codeberg";

export interface RepositorySourceIdentity {
  kind: "repository";
  provider: RepositoryProviderName;
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

export interface RedditShareSourceIdentity {
  kind: "reddit-share";
  shareUrl: string;
  subreddit: string;
}

export interface ExternalSourceIdentity {
  kind: "external";
  canonicalUrl: string;
  hostname: string;
  pathSlug: string;
}

export type SourceIdentity =
  RepositorySourceIdentity | RedditSourceIdentity | ExternalSourceIdentity;

export type ParsedSourceIdentity = SourceIdentity | RedditShareSourceIdentity;

export interface SourceProbeResult {
  finalUrl: string;
  status: number;
  contentType: string | null;
  contentLength: number | null;
  redirects: string[];
}

export const REDDIT_SOURCE_HOSTS: ReadonlySet<string>;

export type SourceProbe = (
  url: string,
  options: { allowedRedirectHosts: Set<string> },
) => Promise<SourceProbeResult>;

export function parseSourceIdentity(value: string): ParsedSourceIdentity;

export function isRepositoryIdentity(
  identity: ParsedSourceIdentity | null | undefined,
): identity is RepositorySourceIdentity;

export function resolveRedditShareIdentity(
  identity: ParsedSourceIdentity,
  options: { probe: SourceProbe },
): Promise<SourceIdentity>;

export function resolveSourceIdentity(
  identity: ParsedSourceIdentity,
  options?: {
    resolveRepository?: (identity: RepositorySourceIdentity) => Promise<{
      id: number;
      owner: string;
      name: string;
      url?: string;
    }>;
    probe?: SourceProbe;
  },
): Promise<SourceIdentity>;

export function sourceDuplicateKeys(identity: ParsedSourceIdentity): string[];

export function projectSubmissionTitle(identity: ParsedSourceIdentity): string;
