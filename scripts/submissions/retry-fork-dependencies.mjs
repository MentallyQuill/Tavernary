import { pathToFileURL } from "node:url";

import {
  loadProjectSubmissionCatalogData,
  parseProjectSubmissionStateMarker,
} from "./triage-issue.mjs";

export function hasTerminalForkDependency({
  comments,
  sourcesByRepositoryId,
  closedUpstreamIssueNumber,
}) {
  return comments.some((comment) => {
    const marker = parseProjectSubmissionStateMarker(comment.body ?? "");
    const dependency = marker?.fork_dependency;
    return (
      marker?.status === "waiting-on-fork-parent" &&
      dependency &&
      (sourcesByRepositoryId.has(dependency.repository_id) ||
        (Number.isInteger(closedUpstreamIssueNumber) &&
          dependency.issue_number === closedUpstreamIssueNumber))
    );
  });
}

function issueLabels(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

export async function retryForkDependencies({
  repository,
  ref = "main",
  sources,
  closedUpstreamIssueNumber,
  request,
}) {
  const sourcesByRepositoryId = new Map(
    sources.flatMap((source) =>
      source.type === "github" &&
      Number.isInteger(source.repository_id) &&
      source.repository_id > 0
        ? [[source.repository_id, source]]
        : [],
    ),
  );
  const dispatched = [];
  const seenIssues = new Set();
  let page = 1;

  while (true) {
    const issues = await request(
      `/repos/${repository}/issues?state=open&labels=project-submission%2Cwaiting-on-fork-parent&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      const labels = issueLabels(issue);
      if (
        seenIssues.has(issue.number) ||
        issue.pull_request ||
        issue.state !== "open" ||
        !labels.includes("project-submission") ||
        !labels.includes("waiting-on-fork-parent")
      ) {
        continue;
      }
      seenIssues.add(issue.number);
      const comments = await request(
        `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
      );
      if (
        !hasTerminalForkDependency({
          comments,
          sourcesByRepositoryId,
          closedUpstreamIssueNumber,
        })
      ) {
        continue;
      }
      await request(
        `/repos/${repository}/actions/workflows/triage-submission.yml/dispatches`,
        {
          method: "POST",
          body: JSON.stringify({
            ref,
            inputs: { issue_number: String(issue.number) },
          }),
        },
      );
      dispatched.push(issue.number);
    }
    if (issues.length < 100) break;
    page += 1;
  }

  return dispatched;
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-fork-dependency-retry",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY;
  if (!repository || !process.env.GITHUB_TOKEN) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required.");
  }
  const issueNumber = Number(process.env.UPSTREAM_ISSUE_NUMBER || 0);
  const { sources } = await loadProjectSubmissionCatalogData();
  await retryForkDependencies({
    repository,
    ref: process.env.GITHUB_REF_NAME || "main",
    sources,
    closedUpstreamIssueNumber:
      Number.isInteger(issueNumber) && issueNumber > 0
        ? issueNumber
        : undefined,
    request: github,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
