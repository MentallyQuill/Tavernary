const projectSubmissionPrefix = "[Project submission]";
const redditHosts = new Set([
  "reddit.com",
  "www.reddit.com",
  "old.reddit.com",
  "new.reddit.com",
  "m.reddit.com",
]);

function githubIdentity(url) {
  if (url.hostname.toLowerCase() !== "github.com") return null;
  const parts = url.pathname
    .replace(/\/+$/u, "")
    .replace(/\.git$/iu, "")
    .split("/")
    .filter(Boolean);
  if (parts.length !== 2) {
    throw new Error(
      "GitHub project URLs must identify exactly one owner/repository.",
    );
  }
  const [owner, name] = parts;
  return {
    kind: "github",
    canonicalUrl: `https://github.com/${owner}/${name}`,
    repository: `${owner}/${name}`,
    repositoryId: null,
    owner,
    name,
  };
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
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Project source must be a public HTTPS URL.");
  }
  return githubIdentity(url) ?? redditIdentity(url) ?? externalIdentity(url);
}

export async function resolveSourceIdentity(identity, options = {}) {
  if (identity.kind !== "github" || !options.resolveGithub) return identity;
  const resolved = await options.resolveGithub(identity.repository);
  if (
    !resolved ||
    !Number.isInteger(resolved.id) ||
    resolved.id < 1 ||
    typeof resolved.owner !== "string" ||
    typeof resolved.name !== "string"
  ) {
    throw new Error("GitHub repository resolution returned invalid identity.");
  }
  return {
    kind: "github",
    canonicalUrl: `https://github.com/${resolved.owner}/${resolved.name}`,
    repository: `${resolved.owner}/${resolved.name}`,
    repositoryId: resolved.id,
    owner: resolved.owner,
    name: resolved.name,
  };
}

export function sourceDuplicateKeys(identity) {
  if (identity.kind === "github") {
    return [
      `url:${identity.canonicalUrl.toLowerCase()}`,
      `github-repository:${identity.repository.toLowerCase()}`,
      ...(identity.repositoryId ? [`github-id:${identity.repositoryId}`] : []),
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
  if (identity.kind === "github") {
    return `${projectSubmissionPrefix} ${identity.repository}`;
  }
  if (identity.kind === "reddit") {
    const location = identity.subreddit ? `r/${identity.subreddit}` : "Reddit";
    const label = identity.slug ? humanizeSlug(identity.slug) : identity.postId;
    return `${projectSubmissionPrefix} ${location}: ${label}`;
  }
  return `${projectSubmissionPrefix} ${identity.hostname}/${identity.pathSlug}`;
}
