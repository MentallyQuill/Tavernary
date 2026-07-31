import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { parseSourceIdentity } from "./source-identity.mjs";

export const REDDIT_RETRY_MARKER = "<!-- tavernary-reddit-submission-retry";

const FAILURE_MARKER =
  "<!-- tavernary-project-generation-failure:project-submission -->";
const STATE_KEYS = new Set([
  "schema_version",
  "issue_number",
  "source_identity",
  "completed_waves",
  "next_eligible_retry_at",
  "last_reason_code",
  "updated_at",
  "outcome",
]);
const OUTCOMES = new Set(["pending", "placeholder", "source-ready"]);
const BLOCKING_LABELS = new Set(["needs-information", "submission-declined"]);

function isIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function hasExactStateKeys(value) {
  const keys = Object.keys(value);
  return (
    keys.length === STATE_KEYS.size && keys.every((key) => STATE_KEYS.has(key))
  );
}

export function normalizeRedditRetryState(value, expected) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !hasExactStateKeys(value) ||
    value.schema_version !== 1 ||
    !Number.isSafeInteger(value.issue_number) ||
    value.issue_number < 1 ||
    typeof value.source_identity !== "string" ||
    !/^reddit:[a-z0-9]+$/u.test(value.source_identity) ||
    !Number.isSafeInteger(value.completed_waves) ||
    typeof value.last_reason_code !== "string" ||
    !/^[a-z][a-z0-9-]*$/u.test(value.last_reason_code) ||
    !isIsoTimestamp(value.updated_at) ||
    !OUTCOMES.has(value.outcome) ||
    value.issue_number !== expected.issueNumber ||
    value.source_identity !== expected.sourceIdentity
  ) {
    return null;
  }

  if (
    value.outcome === "pending" &&
    (![1, 2].includes(value.completed_waves) ||
      !isIsoTimestamp(value.next_eligible_retry_at))
  ) {
    return null;
  }
  if (
    value.outcome === "placeholder" &&
    (value.completed_waves !== 3 || value.next_eligible_retry_at !== null)
  ) {
    return null;
  }
  if (
    value.outcome === "source-ready" &&
    (![1, 2].includes(value.completed_waves) ||
      value.next_eligible_retry_at !== null)
  ) {
    return null;
  }

  return { ...value };
}

export function renderRedditRetryState(state) {
  return `${REDDIT_RETRY_MARKER}\n${JSON.stringify(state)}\n-->`;
}

export function parseRedditRetryState(body, expected) {
  const pattern =
    /<!-- tavernary-reddit-submission-retry\r?\n([\s\S]*?)\r?\n-->/gu;
  const matches = [...String(body ?? "").matchAll(pattern)];
  if (matches.length !== 1) return null;
  try {
    return normalizeRedditRetryState(JSON.parse(matches[0][1]), expected);
  } catch {
    return null;
  }
}

export function loadRedditRetryState(comments, expected) {
  const states = (comments ?? [])
    .filter((comment) => String(comment?.body ?? "").includes(FAILURE_MARKER))
    .map((comment) => parseRedditRetryState(comment?.body, expected))
    .filter(Boolean);
  return states.length === 1 ? states[0] : null;
}

function labelNames(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => (typeof label === "string" ? label : label?.name))
        .filter((label) => typeof label === "string")
    : [];
}

async function loadIssueComments(request, repository, issueNumber) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const suffix = page === 1 ? "" : `&page=${page}`;
    const current = await request(
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100${suffix}`,
    );
    comments.push(...current);
    if (current.length < 100) return comments;
  }
}

function issueRedditIdentity(issue) {
  const parsed = parseProjectSubmissionIssue(issue?.body ?? "", {
    allowLegacyV3: true,
  });
  if (!parsed.valid) return null;
  try {
    const source = parseSourceIdentity(parsed.manifest.source_url);
    return source.kind === "reddit" ? `reddit:${source.postId}` : null;
  } catch {
    return null;
  }
}

export async function upsertRedditRetryComment(input) {
  if (typeof input?.request !== "function") {
    throw new Error("Reddit retry comment update needs request.");
  }
  const expected = {
    issueNumber: input.issueNumber,
    sourceIdentity: input.sourceIdentity,
  };
  const state = normalizeRedditRetryState(input.state, expected);
  if (!state) return { action: "noop" };

  const issue = await input.request(
    `/repos/${input.repository}/issues/${input.issueNumber}`,
  );
  const labels = labelNames(issue);
  if (
    issue?.state !== "open" ||
    issue?.number !== input.issueNumber ||
    !labels.includes("issue-admitted") ||
    !labels.includes("project-submission") ||
    labels.some((label) => BLOCKING_LABELS.has(label)) ||
    (state.outcome === "pending" && labels.includes("submission-pr-open")) ||
    issueRedditIdentity(issue) !== input.sourceIdentity
  ) {
    return { action: "noop" };
  }

  const comments = await loadIssueComments(
    input.request,
    input.repository,
    input.issueNumber,
  );
  if (!loadRedditRetryState(comments, expected)) {
    return { action: "noop" };
  }
  const existing = comments.find(
    (comment) =>
      String(comment?.body ?? "").includes(FAILURE_MARKER) &&
      parseRedditRetryState(comment?.body, expected),
  );
  if (!existing) return { action: "noop" };

  const body = String(existing.body).replace(
    /<!-- tavernary-reddit-submission-retry\r?\n[\s\S]*?\r?\n-->/u,
    renderRedditRetryState(state),
  );
  await input.request(
    `/repos/${input.repository}/issues/comments/${existing.id}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    },
  );
  return { action: "update", commentId: existing.id };
}

export function planRedditRetryTransition({
  current,
  issueNumber,
  sourceIdentity,
  reasonCode,
  now,
}) {
  if (
    current &&
    (current.issue_number !== issueNumber ||
      current.source_identity !== sourceIdentity ||
      current.outcome !== "pending" ||
      ![1, 2].includes(current.completed_waves))
  ) {
    throw new Error(
      "Reddit retry state does not match the current submission.",
    );
  }

  const completedWaves = (current?.completed_waves ?? 0) + 1;
  const terminal = completedWaves >= 3;
  const state = {
    schema_version: 1,
    issue_number: issueNumber,
    source_identity: sourceIdentity,
    completed_waves: completedWaves,
    next_eligible_retry_at: terminal
      ? null
      : new Date(new Date(now).getTime() + 3_600_000).toISOString(),
    last_reason_code: reasonCode,
    updated_at: new Date(now).toISOString(),
    outcome: terminal ? "placeholder" : "pending",
  };
  return { action: terminal ? "placeholder" : "schedule", state };
}
