import {
  REDDIT_SOURCE_HOSTS,
  parseSourceIdentity,
} from "../submissions/source-identity.mjs";
import { safeReadSource } from "../submissions/safe-source-fetch.mjs";

const maximumResponseBytes = 524_288;
const maximumOEmbedBytes = 65_536;
const maximumSelectedCharacters = 8_000;
const unavailableMarkers = new Set(["[deleted]", "[removed]"]);

const messages = {
  "unsupported-enrichment-source":
    "No automatic enrichment adapter supports this source.",
  "reddit-post-unavailable": "The Reddit post is unavailable.",
  "reddit-identity-mismatch":
    "The Reddit response does not match the catalog source.",
  "reddit-rate-limited": "The Reddit source request was rate limited.",
  "reddit-server-error": "The Reddit source service is unavailable.",
  "reddit-response-invalid": "The Reddit source response is invalid.",
  "reddit-fetch-failed": "The Reddit source request failed.",
};

function failed(reasonCode, provenance = {}) {
  return {
    status: "failed",
    reasonCode,
    message: messages[reasonCode],
    ...provenance,
  };
}

function redditJsonUrl(identity) {
  const canonical = identity.canonicalUrl.replace(/\/+$/u, "");
  const url = new URL(`${canonical}.json`);
  url.hostname = "www.reddit.com";
  url.searchParams.set("raw_json", "1");
  url.searchParams.set("limit", "1");
  return url.href;
}

function redditOEmbedUrl(identity) {
  const url = new URL("https://www.reddit.com/oembed");
  url.searchParams.set("url", identity.canonicalUrl);
  return url.href;
}

function normalizePostText(value) {
  if (typeof value !== "string") return null;
  const text = value
    .replace(/^\uFEFF/u, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u0000/gu, "")
    .trim();
  if (!text || unavailableMarkers.has(text.toLowerCase())) return null;
  return text.slice(0, maximumSelectedCharacters);
}

function parseJsonBody(result) {
  if (
    typeof result.contentType !== "string" ||
    !/^application\/(?:json|[^;]+\+json)(?:;|$)/iu.test(result.contentType)
  ) {
    return null;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(result.body);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function classifiedHttpFailure(result, provenance) {
  if (result.status === 404 || result.status === 410) {
    return failed("reddit-post-unavailable", provenance);
  }
  if (result.status === 429) {
    return failed("reddit-rate-limited", provenance);
  }
  if (result.status >= 500 && result.status <= 599) {
    return failed("reddit-server-error", provenance);
  }
  return failed("reddit-fetch-failed", provenance);
}

async function loadOEmbedTitle(identity, provenance, readSource) {
  let result;
  try {
    result = await readSource(redditOEmbedUrl(identity), {
      allowedRedirectHosts: REDDIT_SOURCE_HOSTS,
      maxBytes: maximumOEmbedBytes,
      maxRedirects: 1,
      timeoutMs: 10_000,
      headers: {
        accept: "application/json",
        "user-agent": "Tavernary-catalog-enrichment",
      },
    });
  } catch {
    return failed("reddit-fetch-failed", provenance);
  }
  if (result.status < 200 || result.status >= 300) {
    return classifiedHttpFailure(result, provenance);
  }

  const payload = parseJsonBody(result);
  if (
    payload?.provider_name?.toLowerCase() !== "reddit" ||
    payload?.type !== "rich" ||
    typeof payload.html !== "string"
  ) {
    return failed("reddit-response-invalid", provenance);
  }
  const postIdentityPattern = new RegExp(
    `/comments/${identity.postId}(?:/|[?"#])`,
    "iu",
  );
  if (!postIdentityPattern.test(payload.html)) {
    return failed("reddit-identity-mismatch", provenance);
  }
  const title = normalizePostText(payload.title);
  if (!title) return failed("reddit-post-unavailable", provenance);
  return {
    status: "ready",
    sourceKind: "reddit-title",
    text: title,
    ...provenance,
  };
}

export async function loadRedditEnrichmentSource(source, options = {}) {
  let identity;
  try {
    identity = parseSourceIdentity(source?.url);
  } catch {
    identity = null;
  }
  if (source?.type !== "url" || identity?.kind !== "reddit") {
    return failed("unsupported-enrichment-source");
  }

  const provenance = {
    sourceIdentity: `reddit:${identity.postId}`,
    redditPostId: identity.postId,
  };
  const readSource = options.readSource ?? safeReadSource;
  let result;
  try {
    result = await readSource(redditJsonUrl(identity), {
      allowedRedirectHosts: REDDIT_SOURCE_HOSTS,
      maxBytes: maximumResponseBytes,
      maxRedirects: 2,
      timeoutMs: 10_000,
      headers: {
        accept: "application/json",
        "user-agent": "Tavernary-catalog-enrichment",
      },
    });
  } catch {
    return failed("reddit-fetch-failed", provenance);
  }

  if (result.status === 403) {
    return loadOEmbedTitle(identity, provenance, readSource);
  }
  if (result.status < 200 || result.status >= 300) {
    return classifiedHttpFailure(result, provenance);
  }

  const payload = parseJsonBody(result);
  const post = payload?.[0]?.data?.children?.[0];
  if (
    !post ||
    post.kind !== "t3" ||
    !post.data ||
    typeof post.data !== "object"
  ) {
    return failed("reddit-response-invalid", provenance);
  }
  if (
    typeof post.data.id !== "string" ||
    post.data.id.toLowerCase() !== identity.postId.toLowerCase()
  ) {
    return failed("reddit-identity-mismatch", provenance);
  }
  if (
    (post.data.removed_by_category !== null &&
      post.data.removed_by_category !== undefined) ||
    (post.data.banned_by !== null && post.data.banned_by !== undefined)
  ) {
    return failed("reddit-post-unavailable", provenance);
  }

  const body = normalizePostText(post.data.selftext);
  const title = normalizePostText(post.data.title);
  if (!body && !title) {
    return failed("reddit-post-unavailable", provenance);
  }
  return {
    status: "ready",
    sourceKind: body ? "reddit-body" : "reddit-title",
    text: body ?? title,
    ...provenance,
  };
}
