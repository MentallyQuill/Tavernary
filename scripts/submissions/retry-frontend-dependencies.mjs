import { pathToFileURL } from "node:url";

import {
  loadProjectSubmissionCatalogData,
  parseProjectSubmissionStateMarker,
} from "./triage-issue.mjs";
import { parseSourceIdentity } from "./source-identity.mjs";

export function indexedFrontendUrls(projects) {
  const urls = new Set();
  for (const project of projects) {
    if (
      project.kind !== "frontend" ||
      project.source?.type !== "github" ||
      typeof project.source.repository !== "string"
    ) {
      continue;
    }
    const identity = parseSourceIdentity(
      `https://github.com/${project.source.repository}`,
    );
    urls.add(identity.canonicalUrl.toLowerCase());
  }
  return urls;
}

export function hasResolvableFrontendDependency({ comments, indexedUrls }) {
  return comments.some((comment) => {
    const marker = parseProjectSubmissionStateMarker(comment.body ?? "");
    return (
      marker?.status === "needs-information" &&
      marker.frontend_dependencies?.some((dependency) => {
        try {
          return indexedUrls.has(
            parseSourceIdentity(
              dependency.canonical_url,
            ).canonicalUrl.toLowerCase(),
          );
        } catch {
          return false;
        }
      })
    );
  });
}

function issueLabels(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}

export async function retryFrontendDependencies({
  repository,
  ref = "main",
  projects,
  request,
}) {
  const indexedUrls = indexedFrontendUrls(projects);
  const dispatched = [];
  let page = 1;

  while (true) {
    const issues = await request(
      `/repos/${repository}/issues?state=open&labels=project-submission%2Cneeds-information&per_page=100&page=${page}`,
    );
    for (const issue of issues) {
      const labels = issueLabels(issue);
      if (
        issue.pull_request ||
        issue.state !== "open" ||
        !labels.includes("project-submission") ||
        !labels.includes("needs-information")
      ) {
        continue;
      }
      const comments = await request(
        `/repos/${repository}/issues/${issue.number}/comments?per_page=100`,
      );
      if (!hasResolvableFrontendDependency({ comments, indexedUrls })) {
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
      "User-Agent": "Tavernary-frontend-dependency-retry",
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
  const { projects } = await loadProjectSubmissionCatalogData();
  await retryFrontendDependencies({
    repository,
    ref: process.env.GITHUB_REF_NAME || "main",
    projects,
    request: github,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
