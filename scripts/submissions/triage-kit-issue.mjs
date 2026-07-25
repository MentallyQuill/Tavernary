import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateKitSubmission } from "./validate-kit-submission.mjs";

const validationMarker = "<!-- tavernary-kit-submission-validation -->";
const triageLabels = {
  "needs-maintainer-review": {
    color: "0e8a16",
    description: "Kit passed automation and awaits maintainer review.",
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
  return { manifest: fields.get("Kit manifest") ?? "" };
}

export function buildKitValidationComment(validation) {
  if (validation.errors.length === 0) {
    return [
      validationMarker,
      "Automated validation now passes. This Kit is ready for maintainer review.",
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

async function synchronize(repository, issueNumber, validation) {
  const issue = await github(`/repos/${repository}/issues/${issueNumber}`);
  const current = new Set(
    issue.labels.map((label) =>
      typeof label === "string" ? label : label.name,
    ),
  );
  for (const name of Object.keys(triageLabels)) {
    if (current.has(name) && !validation.labels.includes(name)) {
      await github(
        `/repos/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(name)}`,
        { method: "DELETE" },
      );
    }
  }
  await github(`/repos/${repository}/issues/${issueNumber}/labels`, {
    method: "POST",
    body: JSON.stringify({ labels: validation.labels }),
  });

  const comments = await github(
    `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
  );
  const existing = comments.find((comment) =>
    comment.body?.includes(validationMarker),
  );
  const body = buildKitValidationComment(validation);
  if (existing) {
    if (existing.body !== body) {
      await github(`/repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    }
  } else {
    await github(`/repos/${repository}/issues/${issueNumber}/comments`, {
      method: "POST",
      body: JSON.stringify({ body }),
    });
  }
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (!event.issue?.title?.startsWith("[Kit submission]")) return;
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
  await synchronize(event.repository.full_name, event.issue.number, validation);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
