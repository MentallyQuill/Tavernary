import { appendFile, readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateKitSubmission } from "./validate-kit-submission.mjs";

const validationMarker = "<!-- tavernary-kit-submission-validation -->";
const triageLabels = {
  "kit-publication-ready": {
    color: "0e8a16",
    description: "Kit passed automation and is queued for publication.",
  },
  "needs-information": {
    color: "d93f0b",
    description: "Kit submission needs corrected objective information.",
  },
  "duplicate-candidate": {
    color: "fbca04",
    description: "Kit duplicates or closely overlaps an existing Kit.",
  },
};
const ownedTriageLabels = [
  ...Object.keys(triageLabels),
  "needs-maintainer-review",
];

export function parseKitIssueFields(body) {
  const fields = new Map();
  for (const section of body.split(/^### /m).slice(1)) {
    const [heading, ...content] = section.split(/\r?\n/);
    fields.set(
      heading.trim(),
      content
        .join("\n")
        .trim()
        .replace(/^_No response_$/i, ""),
    );
  }
  const manifest = fields.get("Kit manifest") ?? "";
  const renderedJson = manifest.match(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return { manifest: renderedJson?.[1] ?? manifest };
}

export function buildKitValidationComment(validation) {
  if (validation.errors.length === 0) {
    return [
      validationMarker,
      "Automated validation passes. Tavernary is publishing this Kit.",
      ...(validation.warnings.length
        ? ["", ...validation.warnings.map((warning) => `- ${warning}`)]
        : []),
    ].join("\n");
  }
  return [
    validationMarker,
    "Tavernary could not send this Kit to maintainer review:",
    "",
    ...validation.errors.map((error) => `- ${error}`),
    "",
    "Edit the issue fields above and automated validation will run again.",
  ].join("\n");
}

async function readJsonDirectory(path) {
  const directory = resolve(path);
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-kit-triage",
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

async function ensureLabels(repository) {
  for (const [name, definition] of Object.entries(triageLabels)) {
    try {
      await github(`/repos/${repository}/labels`, {
        method: "POST",
        body: JSON.stringify({ name, ...definition }),
      });
    } catch (error) {
      if (error.status !== 422) throw error;
    }
  }
}

export async function synchronizeKitSubmission(
  repository,
  issueNumber,
  validation,
  request = github,
) {
  const issue = await request(`/repos/${repository}/issues/${issueNumber}`);
  assertKitSubmissionEligible(issue);
  const current = new Set(
    issue.labels.map((label) =>
      typeof label === "string" ? label : label.name,
    ),
  );
  for (const name of ownedTriageLabels) {
    if (current.has(name) && !validation.labels.includes(name)) {
      try {
        await request(
          `/repos/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(name)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        if (error.status !== 404) throw error;
      }
    }
  }
  await request(`/repos/${repository}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: validation.labels }),
  });

  const comments = await request(
    `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
  );
  const existing = comments.find((comment) =>
    comment.body?.includes(validationMarker),
  );
  const body = buildKitValidationComment(validation);
  if (existing) {
    if (existing.body !== body) {
      await request(`/repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    }
  } else {
    await request(`/repos/${repository}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

export async function resolveKitSubmissionEvent(event, environment, request) {
  const source = event && typeof event === "object" ? event : {};
  const issueNumber = Number(
    environment.ISSUE_NUMBER ?? source.issue?.number ?? 0,
  );
  const repository =
    environment.GITHUB_REPOSITORY ?? source.repository?.full_name ?? "";
  if (!Number.isInteger(issueNumber) || issueNumber < 1 || !repository) {
    return null;
  }
  const issue = await request(`/repos/${repository}/issues/${issueNumber}`);
  return {
    ...source,
    repository: {
      ...(source.repository ?? {}),
      full_name: repository,
    },
    issue,
  };
}

export function assertKitSubmissionEligible(issue) {
  const labels = (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  if (
    issue.state !== "open" ||
    !issue.title?.startsWith("[Kit submission]") ||
    !labels.includes("issue-admitted")
  ) {
    throw new Error("Kit submission issue is not open and admitted.");
  }
}

export function kitTriageOutputs(validation, issue) {
  return {
    publish: String(validation.valid),
    issue_number: String(issue.number),
  };
}

async function main() {
  const rawEvent = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  const event = await resolveKitSubmissionEvent(rawEvent, process.env, github);
  if (!event?.issue) return;
  assertKitSubmissionEligible(event.issue);
  const [projects, kits, blockedUsers] = await Promise.all([
    readJsonDirectory("data/registry/projects"),
    readJsonDirectory("data/registry/kits"),
    readFile("data/moderation/blocked-github-users.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const validation = validateKitSubmission({
    ...parseKitIssueFields(event.issue.body ?? ""),
    actor: { id: event.issue.user.id, login: event.issue.user.login },
    projects,
    kits,
    blockedUsers,
  });
  await ensureLabels(event.repository.full_name);
  await synchronizeKitSubmission(
    event.repository.full_name,
    event.issue.number,
    validation,
  );
  if (process.env.GITHUB_OUTPUT) {
    const outputs = kitTriageOutputs(validation, event.issue);
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
