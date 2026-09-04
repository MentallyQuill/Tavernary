import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  categoryLabels,
  HELP_LABEL_BY_ROUTE,
  HELP_ROUTE_BY_LABEL,
  NEEDS_INFORMATION_LABEL,
  PUBLIC_HELP_TRIAGE_LABELS,
} from "./help-labels.mjs";
import { parseHelpIssue } from "./parse-help-issue.mjs";

export const HELP_TRIAGE_MARKER = "<!-- tavernary-help-triage -->";

const returnUrlByRoute = Object.freeze({
  "project-report": "https://tavernary.org/menu/report-project/",
  "website-bug": "https://tavernary.org/menu/report-website/",
  "kit-report": "https://tavernary.org/menu/report-kit/",
  "other-help": "https://tavernary.org/menu/other/",
});

function labelNames(labels = []) {
  return new Set(
    labels
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

function issueNumberFromEvent(event = {}) {
  return Number(event.inputs?.issue_number ?? event.issue?.number ?? 0);
}

function admittedHelpRoute(issue) {
  const names = labelNames(issue.labels);
  const routes = Object.entries(HELP_ROUTE_BY_LABEL)
    .filter(([label]) => names.has(label))
    .map(([, route]) => route);
  if (routes.length === 1) return routes[0];
  return routes.length > 1 ? "conflict" : "none";
}

function buildCorrectionComment(errors, route) {
  const returnUrl = returnUrlByRoute[route] ?? "https://tavernary.org/menu/";
  return [
    HELP_TRIAGE_MARKER,
    "Tavernary could not validate this Help request:",
    "",
    ...errors.map((error) => `- ${error}`),
    "",
    "This issue remains open. The readable GitHub fields are review-only and are not the automation payload.",
    `Return to Tavernary at ${returnUrl}, correct the request, and create a new GitHub review with a complete manifest.`,
  ].join("\n");
}

async function findCorrectionComment(repository, issueNumber, request) {
  for (let page = 1; ; page += 1) {
    const path =
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100` +
      (page === 1 ? "" : `&page=${page}`);
    const comments = await request(path);
    const marker = comments.find(
      (comment) =>
        comment.user?.login === "github-actions[bot]" &&
        comment.body?.includes(HELP_TRIAGE_MARKER),
    );
    if (marker || comments.length < 100) return marker;
  }
}

async function synchronizeCorrectionComment({
  repository,
  issueNumber,
  errors,
  route,
  request,
}) {
  const existing = await findCorrectionComment(
    repository,
    issueNumber,
    request,
  );
  const body = buildCorrectionComment(errors, route);
  if (existing) {
    if (existing.body !== body) {
      await request(`/repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    }
    return;
  }
  await request(`/repos/${repository}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function removeCorrectionComment(repository, issueNumber, request) {
  const existing = await findCorrectionComment(
    repository,
    issueNumber,
    request,
  );
  if (!existing) return;
  try {
    await request(`/repos/${repository}/issues/comments/${existing.id}`, {
      method: "DELETE",
    });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function removeLabel(repository, issueNumber, label, request) {
  try {
    await request(
      `/repos/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function synchronizeHelpLabels({ repository, issue, labels, request }) {
  const current = labelNames(issue.labels);
  const desired = new Set(labels);
  for (const label of PUBLIC_HELP_TRIAGE_LABELS) {
    if (current.has(label) && !desired.has(label)) {
      await removeLabel(repository, issue.number, label, request);
    }
  }
  await request(`/repos/${repository}/issues/${issue.number}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels }),
  });
}

async function invalidDecision({ repository, issue, route, errors, request }) {
  const currentLabels = labelNames(issue.labels);
  const routeLabels = Object.keys(HELP_ROUTE_BY_LABEL).filter((label) =>
    currentLabels.has(label),
  );
  await synchronizeHelpLabels({
    repository,
    issue,
    labels: [...routeLabels, NEEDS_INFORMATION_LABEL],
    request,
  });
  await synchronizeCorrectionComment({
    repository,
    issueNumber: issue.number,
    errors,
    route,
    request,
  });
  return { valid: false, issueNumber: issue.number, errors };
}

export async function processHelpIssueTriage({ event, request }) {
  const repository = event.repository?.full_name ?? "";
  const issueNumber = issueNumberFromEvent(event);
  if (!repository || !Number.isInteger(issueNumber) || issueNumber < 1) {
    throw new Error("Help triage requires a repository and issue number.");
  }

  const issue = await request(`/repos/${repository}/issues/${issueNumber}`);
  const names = labelNames(issue.labels);
  if (issue.state !== "open" || !names.has("issue-admitted")) {
    throw new Error("Help issue is not open and admitted.");
  }

  const route = admittedHelpRoute(issue);
  const parsed = parseHelpIssue(issue.body ?? "");
  if (!parsed.valid) {
    return invalidDecision({
      repository,
      issue,
      route,
      errors: parsed.errors,
      request,
    });
  }

  if (route !== parsed.manifest.request_kind) {
    return invalidDecision({
      repository,
      issue,
      route,
      errors: [
        `Help request kind ${parsed.manifest.request_kind} does not match the admitted ${route} route.`,
      ],
      request,
    });
  }

  const labels = categoryLabels(parsed.manifest);
  if (HELP_LABEL_BY_ROUTE[parsed.manifest.request_kind] !== labels[0]) {
    throw new Error("Help triage label mapping is inconsistent.");
  }
  await synchronizeHelpLabels({ repository, issue, labels, request });
  await removeCorrectionComment(repository, issueNumber, request);
  return {
    valid: true,
    issueNumber,
    requestKind: parsed.manifest.request_kind,
    labels,
  };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-help-triage",
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
  const rawEvent = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  await processHelpIssueTriage({
    event: {
      ...rawEvent,
      inputs: {
        ...(rawEvent.inputs ?? {}),
        issue_number: process.env.ISSUE_NUMBER ?? rawEvent.inputs?.issue_number,
      },
    },
    request: github,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
