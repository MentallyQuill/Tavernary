import {
  appendFile,
  mkdir,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import trustedEditorRegistry from "../../data/maintenance/trusted-tavernary-editors.json" with { type: "json" };
import {
  assertKitSubmissionEligible,
  parseKitIssueFields,
} from "../submissions/triage-kit-issue.mjs";
import { validateKitSubmission } from "../submissions/validate-kit-submission.mjs";

function slug(value) {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-|-$/gu, "") || "kit"
  );
}

export function findExistingKitForSubmission({ manifest, issueNumber, kits }) {
  return manifest.operation === "edit"
    ? kits.find((kit) => kit.id === manifest.kit_id)
    : kits.find((kit) => kit.source_issue_number === issueNumber);
}

export function applyKitSubmission({
  manifest,
  issue,
  existingKit,
  editAuthority = "author",
  now,
}) {
  if (manifest.operation === "create") {
    if (existingKit) {
      if (existingKit.status === "withdrawn") {
        throw new Error(
          "A withdrawn Kit cannot be republished as a create retry.",
        );
      }
      const isIdenticalRetry =
        existingKit.source_issue_number === issue.number &&
        existingKit.author.github_user_id === issue.user.id &&
        existingKit.title === manifest.title.trim() &&
        existingKit.description === manifest.description.trim() &&
        JSON.stringify(existingKit.project_ids) ===
          JSON.stringify(manifest.project_ids);
      if (isIdenticalRetry) {
        return existingKit;
      }
      throw new Error("An exact duplicate Kit already exists.");
    }
    return {
      schema_version: 1,
      id: `${slug(manifest.title)}-${issue.number}`,
      status: "published",
      title: manifest.title.trim(),
      description: manifest.description.trim(),
      author: {
        github_user_id: issue.user.id,
        login: issue.user.login,
      },
      source_issue_number: issue.number,
      project_ids: [...manifest.project_ids],
      published_at: now,
      updated_at: now,
    };
  }

  if (!existingKit || existingKit.id !== manifest.kit_id) {
    throw new Error("The Kit selected for editing does not exist.");
  }
  if (existingKit.status === "withdrawn") {
    throw new Error("A withdrawn Kit cannot be edited.");
  }
  if (
    editAuthority !== "tavernary-staff" &&
    existingKit.author.github_user_id !== issue.user.id
  ) {
    throw new Error("Only the Kit author may publish an edit.");
  }
  const title = manifest.title.trim();
  const description = manifest.description.trim();
  const author =
    editAuthority === "tavernary-staff"
      ? structuredClone(existingKit.author)
      : { ...existingKit.author, login: issue.user.login };
  const unchanged =
    existingKit.title === title &&
    existingKit.description === description &&
    JSON.stringify(existingKit.author) === JSON.stringify(author) &&
    JSON.stringify(existingKit.project_ids) ===
      JSON.stringify(manifest.project_ids);
  if (unchanged) {
    return existingKit;
  }
  return {
    ...existingKit,
    title,
    description,
    author,
    project_ids: [...manifest.project_ids],
    updated_at: now,
  };
}

export async function writeAppliedKitOutput(path, kit) {
  if (!path) throw new Error("GITHUB_OUTPUT is required");
  await appendFile(path, `kit_id=${kit.id}\n`, "utf8");
}

async function readJsonDirectory(path) {
  const files = (await readdir(path))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(path, file), "utf8")),
    ),
  );
}

async function atomicWrite(path, value) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function fetchIssue(repository, issueNumber, token) {
  const response = await fetch(
    `https://api.github.com/repos/${repository}/issues/${issueNumber}`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "Tavernary-kit-publication",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to fetch issue ${issueNumber}: ${response.status}`);
  }
  return response.json();
}

async function main() {
  const issue = await fetchIssue(
    process.env.GITHUB_REPOSITORY,
    process.env.ISSUE_NUMBER,
    process.env.GITHUB_TOKEN,
  );
  assertKitSubmissionEligible(issue);
  const [projects, kits, blockedUsers] = await Promise.all([
    readJsonDirectory(resolve("data/registry/projects")),
    readJsonDirectory(resolve("data/registry/kits")),
    readFile("data/moderation/blocked-github-users.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const validation = validateKitSubmission({
    ...parseKitIssueFields(issue.body ?? ""),
    actor: {
      id: issue.user.id,
      login: issue.user.login,
      association: issue.author_association,
    },
    projects,
    kits,
    blockedUsers,
    trustedEditors: trustedEditorRegistry,
    sourceIssueNumber: issue.number,
  });
  if (!validation.valid) {
    throw new Error(
      `Kit submission is invalid: ${validation.errors.join(" ")}`,
    );
  }
  const existingKit = findExistingKitForSubmission({
    manifest: validation.manifest,
    issueNumber: issue.number,
    kits,
  });
  const record = applyKitSubmission({
    manifest: validation.manifest,
    issue,
    existingKit,
    editAuthority: validation.editAuthority,
    now: new Date().toISOString(),
  });
  await atomicWrite(resolve("data/registry/kits", `${record.id}.json`), record);
  await writeAppliedKitOutput(process.env.GITHUB_OUTPUT, record);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
