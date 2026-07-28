import { appendFile, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import {
  HELP_LABEL_DEFINITIONS,
  HELP_ROUTE_BY_LABEL,
} from "../help/help-labels.mjs";
import { HELP_FALLBACK_HEADINGS } from "../help/parse-help-issue.mjs";
import {
  buildIssueLimitComment,
  decideIssueAdmission,
  ISSUE_ADMISSION_LABEL,
  ISSUE_LIMIT_LABEL,
  ISSUE_LIMIT_MARKER,
} from "./issue-admission.mjs";

const admissionLabels = {
  [ISSUE_ADMISSION_LABEL]: {
    color: "0e8a16",
    description: "Issue is within the public open-issue limit.",
  },
  [ISSUE_LIMIT_LABEL]: {
    color: "d93f0b",
    description: "Issue exceeds the author's public open-issue limit.",
  },
};

const routingLabels = {
  "project-submission": {
    color: "1d76db",
    description: "Structured project submission awaiting Tavernary processing.",
  },
  "kit-submission": {
    color: "1d76db",
    description: "Structured Kit submission awaiting Tavernary processing.",
  },
  "kit-withdrawal": {
    color: "6e7781",
    description: "Structured Kit withdrawal awaiting Tavernary processing.",
  },
};

const routeByLabel = {
  "project-submission": "project",
  "kit-submission": "kit",
  "kit-withdrawal": "kit-withdrawal",
  "project-owner-request": "project-owner",
  ...HELP_ROUTE_BY_LABEL,
};
const publicHelpRoutes = new Set(Object.values(HELP_ROUTE_BY_LABEL));

const trustedAssociations = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

function labelNames(labels = []) {
  return new Set(
    labels
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

export function issueRouteFromLabels(labels = []) {
  const names = labelNames(labels);
  const routes = Object.entries(routeByLabel).filter(([label]) =>
    names.has(label),
  );

  if (routes.length > 1) return "conflict";
  return routes[0]?.[1] ?? "none";
}

function issueHeadings(body = "") {
  return new Set(
    String(body)
      .split(/^### /m)
      .slice(1)
      .map((section) => section.split(/\r?\n/, 1)[0]?.trim())
      .filter(Boolean),
  );
}

export function issueRouteFromBody(body = "") {
  const headings = issueHeadings(body);
  const routes = [
    {
      route: "project",
      headings: ["Project Type", "Project URL", "Frontend-independent"],
    },
    {
      route: "kit",
      headings: ["Kit title", "Kit description", "Kit manifest"],
    },
    {
      route: "kit-withdrawal",
      headings: ["Kit ID", "Kit share URL", "Confirmation"],
    },
    {
      route: "project-owner",
      headings: [
        "Request type",
        "Project ID",
        "Current repository",
        "Proposed display name",
        "Proposed summary",
        "Supported frontends",
        "Primary function",
        "Capabilities",
        "Model families",
        "Completion formats",
        "Proposed repository",
        "Explanation or public note",
        "Delist confirmation",
        "Owner request manifest",
      ],
    },
    ...Object.entries(HELP_FALLBACK_HEADINGS).map(([route, headings]) => ({
      route,
      headings,
    })),
  ];
  const matches = routes.filter(({ headings: required }) =>
    required.every((heading) => headings.has(heading)),
  );
  if (matches.length > 1) return "conflict";
  return matches[0]?.route ?? "none";
}

export function effectiveIssueRoute(issue = {}) {
  const explicit = issueRouteFromLabels(issue.labels);
  return explicit === "none" ? issueRouteFromBody(issue.body) : explicit;
}

export async function listOpenIssues({ repository, creator, request }) {
  const issues = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/issues?state=open&creator=${encodeURIComponent(creator)}&per_page=100&page=${page}`,
    );
    issues.push(...batch);
    if (batch.length < 100) return issues;
  }
}

async function ensureOwnedLabels(repository, request) {
  for (const [name, definition] of Object.entries({
    ...admissionLabels,
    ...routingLabels,
    ...HELP_LABEL_DEFINITIONS,
  })) {
    try {
      await request(`/repos/${repository}/labels`, {
        method: "POST",
        body: JSON.stringify({ name, ...definition }),
      });
    } catch (error) {
      if (error.status !== 422) throw error;
    }
  }
}

async function removeOwnedLabel(repository, issueNumber, label, request) {
  try {
    await request(
      `/repos/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
      { method: "DELETE" },
    );
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

async function addOwnedLabel(repository, issueNumber, label, request) {
  await request(`/repos/${repository}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: [label] }),
  });
}

async function restoreRecoveredRouteLabel({
  repository,
  issue,
  route,
  request,
  ensureLabels,
}) {
  const routeLabel = Object.entries(routeByLabel).find(
    ([, candidate]) => candidate === route,
  )?.[0];
  if (
    !routeLabel ||
    labelNames(issue.labels).has(routeLabel) ||
    issueRouteFromLabels(issue.labels) !== "none"
  ) {
    return;
  }
  if (ensureLabels) await ensureOwnedLabels(repository, request);
  await addOwnedLabel(repository, issue.number, routeLabel, request);
}

async function synchronizeLimitComment(repository, issueNumber, request) {
  const comments = await request(
    `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
  );
  const existing = comments.find((comment) =>
    comment.body?.includes(ISSUE_LIMIT_MARKER),
  );
  const body = buildIssueLimitComment();

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

export async function processIssueAdmission({ event, request }) {
  const repository = event.repository.full_name;
  const currentIssue = event.issue;
  let decision;

  if (event.action === "edited") {
    decision = {
      admitted:
        currentIssue.state === "open" &&
        labelNames(currentIssue.labels).has(ISSUE_ADMISSION_LABEL),
      reason: "existing-admission",
      openIssueCount: 0,
      admittedIssueNumbers: [],
    };
    if (!decision.admitted) return { ...decision, route: "none" };
    const route = effectiveIssueRoute(currentIssue);
    const helpRoute = publicHelpRoutes.has(route);
    if (helpRoute) await ensureOwnedLabels(repository, request);
    await restoreRecoveredRouteLabel({
      repository,
      issue: currentIssue,
      route,
      request,
      ensureLabels: !helpRoute,
    });
    return { ...decision, route };
  }

  if (trustedAssociations.has(currentIssue.author_association)) {
    decision = {
      admitted: true,
      reason: "trusted",
      openIssueCount: 0,
      admittedIssueNumbers: [],
    };
  } else {
    try {
      const openItems = await listOpenIssues({
        repository,
        creator: currentIssue.user.login,
        request,
      });
      decision = decideIssueAdmission({
        currentIssue,
        openItems,
        authorAssociation: currentIssue.author_association,
      });
    } catch (error) {
      console.warn(`Admission lookup failed open: ${error.message}`);
      decision = {
        admitted: true,
        reason: "lookup-failed",
        openIssueCount: 0,
        admittedIssueNumbers: [],
      };
    }
  }

  await ensureOwnedLabels(repository, request);
  if (decision.admitted) {
    await removeOwnedLabel(
      repository,
      currentIssue.number,
      ISSUE_LIMIT_LABEL,
      request,
    );
    await addOwnedLabel(
      repository,
      currentIssue.number,
      ISSUE_ADMISSION_LABEL,
      request,
    );
    const route = effectiveIssueRoute(currentIssue);
    await restoreRecoveredRouteLabel({
      repository,
      issue: currentIssue,
      route,
      request,
      ensureLabels: false,
    });
    return { ...decision, route };
  }

  await removeOwnedLabel(
    repository,
    currentIssue.number,
    ISSUE_ADMISSION_LABEL,
    request,
  );
  await addOwnedLabel(
    repository,
    currentIssue.number,
    ISSUE_LIMIT_LABEL,
    request,
  );
  await synchronizeLimitComment(repository, currentIssue.number, request);
  await request(`/repos/${repository}/issues/${currentIssue.number}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  });
  return { ...decision, route: "none" };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-issue-admission",
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

export function issueAdmissionOutputs(decision, event) {
  return {
    admitted: String(decision.admitted),
    issue_number: String(event.issue.number),
    route: decision.route ?? effectiveIssueRoute(event.issue),
  };
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (!event.issue) return;
  const decision = await processIssueAdmission({ event, request: github });
  if (process.env.GITHUB_OUTPUT) {
    const outputs = issueAdmissionOutputs(decision, event);
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `${Object.entries(outputs)
        .map(([name, value]) => `${name}=${value}`)
        .join("\n")}\n`,
      "utf8",
    );
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
