import { readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function applyKitWithdrawal({ kit, actorId, now }) {
  if (kit.author.github_user_id !== actorId) {
    throw new Error("Only the Kit author may withdraw this Kit.");
  }
  if (kit.status === "withdrawn") {
    return kit;
  }
  return { ...kit, status: "withdrawn", withdrawn_at: now };
}

export async function fetchWithdrawalIssue({
  repository,
  issueNumber,
  request,
}) {
  if (!repository || !Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error("A valid Kit withdrawal issue number is required.");
  }
  const issue = await request(`/repos/${repository}/issues/${issueNumber}`);
  const labels = new Set(
    (issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
  if (
    issue.pull_request ||
    issue.state !== "open" ||
    !labels.has("kit-withdrawal")
  ) {
    throw new Error("Issue is not an open Kit withdrawal request.");
  }
  if (!Number.isInteger(issue.user?.id) || issue.user.id <= 0) {
    throw new Error("Kit withdrawal issue has no valid numeric author.");
  }
  return issue;
}

function parseKitId(body) {
  const section = body
    .split(/^### /m)
    .slice(1)
    .find((value) => value.startsWith("Kit ID"));
  return section?.split(/\r?\n/).slice(1).join("\n").trim() ?? "";
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-kit-withdrawal",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) {
    throw new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
  }
  return response.json();
}

async function main() {
  const issue = await fetchWithdrawalIssue({
    repository: process.env.GITHUB_REPOSITORY,
    issueNumber: Number(process.env.ISSUE_NUMBER),
    request: github,
  });
  const kitId = parseKitId(issue.body ?? "");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(kitId)) {
    throw new Error("Withdrawal issue does not contain a valid Kit ID.");
  }
  const path = resolve("data/registry/kits", `${kitId}.json`);
  const kit = JSON.parse(await readFile(path, "utf8"));
  const tombstone = applyKitWithdrawal({
    kit,
    actorId: issue.user.id,
    now: new Date().toISOString(),
  });
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(tombstone, null, 2)}\n`);
  await rename(temporary, path);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
