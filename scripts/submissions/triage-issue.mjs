import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { validateSubmission } from "./validate-submission.mjs";

const validationMarker = "<!-- tavernary-submission-validation -->";
const triageLabels = {
  "needs-curator-review": {
    color: "0e8a16",
    description: "Submission passed automation and awaits curator review.",
  },
  "needs-information": {
    color: "d93f0b",
    description:
      "Submission is missing or violates required source information.",
  },
  "duplicate-candidate": {
    color: "fbca04",
    description: "The submitted source may already exist in Tavernary.",
  },
};

export function parseIssueFields(body) {
  const fields = new Map();
  const sections = body.split(/^### /m).slice(1);
  for (const section of sections) {
    const [heading, ...content] = section.split(/\r?\n/);
    fields.set(
      heading.trim(),
      content
        .join("\n")
        .trim()
        .replace(/^_No response_$/i, ""),
    );
  }
  return {
    kind: fields.get("Project kind") ?? "",
    sourceUrl: fields.get("Canonical source URL") ?? "",
  };
}

export function buildValidationComment(validation) {
  if (validation.errors.length === 0) {
    return [
      validationMarker,
      "Automated validation now passes. This submission is ready for curator review.",
    ].join("\n");
  }
  return [
    validationMarker,
    "Tavernary could not send this submission to curator review:",
    "",
    ...validation.errors.map((error) => `- ${error}`),
    "",
    "Edit the issue fields above and automated validation will run again.",
  ].join("\n");
}

async function existingSources() {
  const directory = resolve("data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const records = await Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
  return records.map((record) =>
    record.source.type === "github"
      ? `https://github.com/${record.source.repository}`
      : record.source.url,
  );
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-submission-triage",
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

async function synchronizeLabels(repository, issueNumber, validation) {
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
}

async function synchronizeComment(repository, issueNumber, validation) {
  const comments = await github(
    `/repos/${repository}/issues/${issueNumber}/comments?per_page=100`,
  );
  const existing = comments.find((comment) =>
    comment.body?.includes(validationMarker),
  );
  if (validation.errors.length === 0 && !existing) return;

  const body = buildValidationComment(validation);
  if (existing) {
    if (existing.body !== body) {
      await github(`/repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    }
    return;
  }
  await github(`/repos/${repository}/issues/${issueNumber}/comments`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

async function main() {
  const event = JSON.parse(
    await readFile(process.env.GITHUB_EVENT_PATH, "utf8"),
  );
  if (!event.issue?.title?.startsWith("[Project submission]")) return;

  const validation = validateSubmission({
    ...parseIssueFields(event.issue.body ?? ""),
    existingSources: await existingSources(),
  });
  await ensureLabels(event.repository.full_name);
  await synchronizeLabels(
    event.repository.full_name,
    event.issue.number,
    validation,
  );
  await synchronizeComment(
    event.repository.full_name,
    event.issue.number,
    validation,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
