import { safeProbe } from "./safe-source-fetch.mjs";

const projectSubmissionPrefix = "[Project submission]";
const redditHosts = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "new.reddit.com",
  "m.reddit.com",
]);
export const REDDIT_SOURCE_HOSTS = new Set([...redditHosts, "redd.it"]);

const repositoryHosts = new Map([
  ["github.com", "github"],
  ["codeberg.org", "codeberg"],
]);

function repositoryIdentity(url) {
  const provider = repositoryHosts.get(url.hostname.toLowerCase());
  if (!provider) return null;
  const providerLabel = provider === "github" ? "GitHub" : "Codeberg";
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      `${providerLabel} project URLs must identify exactly one owner/repository.`,
    );
  }
  const parts = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(
      `${providerLabel} project URLs must identify exactly one owner/repository.`,
    );
  }
  const [owner, name] = parts;
  return {
    kind: "repository",
    provider,
    canonicalUrl: `https://${url.hostname.toLowerCase()}/${owner}/${name}`,
    repository: `${owner}/${name}`,
    repositoryId: null,
    owner,
    name,
  };
}

export function isRepositoryIdentity(identity) {
  return identity?.kind === "repository";
}

function redditIdentity(url) {
  if (url.hostname.toLowerCase() === "redd.it") {
    const [postId] = url.pathname.split("/").filter(Boolean);
    if (!postId) throw new Error("Reddit short links must include a post ID.");
    return {
      kind: "reddit",
      canonicalUrl: `https://www.reddit.com/comments/${postId.toLowerCase()}/`,
      postId: postId.toLowerCase(),
      subreddit: null,
      slug: null,
    };
  }
  if (!redditHosts.has(url.hostname.toLowerCase())) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    parts.length === 4 &&
    parts[0].toLowerCase() === "r" &&
    parts[2].toLowerCase() === "s"
  ) {
    return {
      kind: "reddit-share",
      shareUrl: url.toString(),
      subreddit: parts[1],
    };
  }
  if (
    parts.length >= 5 &&
    parts[0].toLowerCase() === "r" &&
    parts[2].toLowerCase() === "comments"
  ) {
    const subreddit = parts[1];
    const postId = parts[3].toLowerCase();
    const slug = parts[4] || null;
    return {
      kind: "reddit",
      canonicalUrl: `https://www.reddit.com/r/${subreddit}/comments/${postId}/${slug ? `${slug}/` : ""}`,
      postId,
      subreddit,
      slug,
    };
  }
  throw new Error("Reddit URLs must identify a post permalink.");
}

function externalIdentity(url) {
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  const canonicalUrl = `https://${url.hostname.toLowerCase()}${pathname}${url.search}`;
  const segment = pathname.split("/").filter(Boolean).at(-1);
  let pathSlug = segment ?? url.hostname.toLowerCase();
  try {
    pathSlug = decodeURIComponent(pathSlug);
  } catch {
    // Keep the encoded segment when it is not valid percent-encoding.
  }
  return {
    kind: "external",
    canonicalUrl,
    hostname: url.hostname.toLowerCase(),
    pathSlug,
  };
}

export function parseSourceIdentity(value) {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Project source must be a public HTTPS URL.");
  }
  const repository = repositoryIdentity(url);
  if (repository) return repository;
  if (url.username || url.password) {
    throw new Error("Project source must be a public HTTPS URL.");
  }
  return redditIdentity(url) ?? externalIdentity(url);
}

export async function resolveRedditShareIdentity(identity, options) {
  if (identity.kind !== "reddit-share") return identity;
  try {
    const result = await options.probe(identity.shareUrl, {
      allowedRedirectHosts: REDDIT_SOURCE_HOSTS,
    });
    const resolved = parseSourceIdentity(result.finalUrl);
    if (resolved.kind !== "reddit") {
      throw new Error("Reddit share link did not resolve to a post permalink.");
    }
    return resolved;
  } catch (cause) {
    const error = new Error(
      "Reddit share link could not be resolved to a post permalink.",
      { cause },
    );
    error.code = "reddit-share-unresolved";
    throw error;
  }
}

export async function resolveSourceIdentity(identity, options = {}) {
  if (identity.kind === "reddit-share") {
    return resolveRedditShareIdentity(identity, {
      probe: options.probe ?? safeProbe,
    });
  }
  if (!isRepositoryIdentity(identity) || !options.resolveRepository) {
    return identity;
  }
  const resolved = await options.resolveRepository(identity);
  if (
    !resolved ||
    !Number.isInteger(resolved.id) ||
    resolved.id < 1 ||
    typeof resolved.owner !== "string" ||
    typeof resolved.name !== "string"
  ) {
    throw new Error(
      `${identity.provider === "github" ? "GitHub" : "Codeberg"} repository resolution returned invalid identity.`,
    );
  }
  const hostname =
    identity.provider === "github" ? "github.com" : "codeberg.org";
  return {
    kind: "repository",
    provider: identity.provider,
    canonicalUrl: `https://${hostname}/${resolved.owner}/${resolved.name}`,
    repository: `${resolved.owner}/${resolved.name}`,
    repositoryId: resolved.id,
    owner: resolved.owner,
    name: resolved.name,
  };
}

export function sourceDuplicateKeys(identity) {
  if (identity.kind === "reddit-share") {
    throw new Error(
      "Reddit share identity must be resolved before comparison.",
    );
  }
  if (isRepositoryIdentity(identity)) {
    return [
      `url:${identity.canonicalUrl.toLowerCase()}`,
      `${identity.provider}-repository:${identity.repository.toLowerCase()}`,
      ...(identity.repositoryId
        ? [`${identity.provider}-id:${identity.repositoryId}`]
        : []),
    ];
  }
  if (identity.kind === "reddit") {
    return [`reddit-post:${identity.postId.toLowerCase()}`];
  }
  return [`url:${identity.canonicalUrl}`];
}

function humanizeSlug(slug) {
  return slug
    .replace(/[_-]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

export function projectSubmissionTitle(identity) {
  if (identity.kind === "reddit-share") {
    throw new Error("Reddit share identity must be resolved before titling.");
  }
  if (isRepositoryIdentity(identity)) {
    return `${projectSubmissionPrefix} ${identity.repository}`;
  }
  if (identity.kind === "reddit") {
    const location = identity.subreddit ? `r/${identity.subreddit}` : "Reddit";
    const label = identity.slug ? humanizeSlug(identity.slug) : identity.postId;
    return `${projectSubmissionPrefix} ${location}: ${label}`;
  }
  return `${projectSubmissionPrefix} ${identity.hostname}/${identity.pathSlug}`;
}
