import { pathToFileURL } from "node:url";

import { parseProjectSubmissionIssue } from "./parse-project-submission.mjs";
import { loadRedditRetryState } from "./project-submission-retry-state.mjs";
import { parseSourceIdentity } from "./source-identity.mjs";

const REQUIRED_LABELS = [
  "issue-admitted",
  "project-submission",
  "submission-retryable",
];
const BLOCKING_LABELS = new Set([
  "needs-information",
  "submission-declined",
  "submission-pr-open",
]);

function labelNames(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => (typeof label === "string" ? label : label?.name))
        .filter((label) => typeof label === "string")
    : [];
}

async function loadComments(request, repository, issueNumber) {
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

export async function retryDueProjectSubmissionEnrichment({
  repository,
  ref = "main",
  now,
  request,
}) {
  const nowTime = new Date(now).getTime();
  if (
    !repository ||
    typeof request !== "function" ||
    !Number.isFinite(nowTime)
  ) {
    throw new Error("Reddit submission retry dispatcher input is invalid.");
  }

  const dispatched = [];
  for (let page = 1; ; page += 1) {
    const issues = await request(
      `/repos/${repository}/issues?state=open&labels=issue-admitted%2Cproject-submission%2Csubmission-retryable&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      const labels = labelNames(issue);
      if (
        issue?.pull_request ||
        issue?.state !== "open" ||
        !Number.isSafeInteger(issue?.number) ||
        !REQUIRED_LABELS.every((label) => labels.includes(label)) ||
        labels.some((label) => BLOCKING_LABELS.has(label))
      ) {
        continue;
      }

      const parsed = parseProjectSubmissionIssue(issue.body ?? "", {
        allowLegacyV3: true,
      });
      if (!parsed.valid) continue;
      let identity;
      try {
        identity = parseSourceIdentity(parsed.manifest.source_url);
      } catch {
        continue;
      }
      if (identity.kind !== "reddit") continue;

      const sourceIdentity = `reddit:${identity.postId.toLowerCase()}`;
      const comments = await loadComments(request, repository, issue.number);
      const state = loadRedditRetryState(comments, {
        issueNumber: issue.number,
        sourceIdentity,
      });
      if (
        state?.outcome !== "pending" ||
        new Date(state.next_eligible_retry_at).getTime() > nowTime
      ) {
        continue;
      }

      await request(
        `/repos/${repository}/actions/workflows/generate-project-submission.yml/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({
            ref,
            inputs: {
              issue_number: String(issue.number),
              force_regeneration: "false",
            },
          }),
        },
      );
      dispatched.push(issue.number);
    }
    if (issues.length < 100) break;
  }
  return dispatched;
}

function githubHeaders() {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    "Content-Type": "application/json",
    "User-Agent": "Tavernary-retry-project-submission-enrichment",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...options.headers },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub ${response.status} while dispatching Reddit retries.`,
    );
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repository || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  }
  await retryDueProjectSubmissionEnrichment({
    repository,
    ref: process.env.GITHUB_REF_NAME || "main",
    now: new Date().toISOString(),
    request: github,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
