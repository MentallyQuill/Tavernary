import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { parseKitIssueFields } from "./triage-kit-issue.mjs";
import { validateKitSubmission } from "./validate-kit-submission.mjs";

const publishedOwnedLabels = [
  "issue-admitted",
  "kit-submission",
  "kit-published",
];

const ownedKitLabels = new Set([
  "issue-admitted",
  "kit-submission",
  "kit-published",
  "kit-publication-ready",
  "needs-maintainer-review",
  "needs-information",
  "duplicate-candidate",
]);

function parseManifest(body) {
  try {
    return JSON.parse(parseKitIssueFields(body ?? "").manifest);
  } catch {
    return null;
  }
}

function projectSetKey(projectIds) {
  return Array.isArray(projectIds)
    ? [...new Set(projectIds)].sort().join("\n")
    : "";
}

export function reconcileOwnedKitLabels({ currentLabels, desiredOwnedLabels }) {
  return [
    ...currentLabels.filter((label) => !ownedKitLabels.has(label)),
    ...new Set(desiredOwnedLabels),
  ];
}

export function classifyKitSubmissionHistory({
  issue,
  projects,
  kits,
  blockedUsers,
}) {
  const manifest = parseManifest(issue.body);
  const publishedCreate =
    manifest?.operation === "create" &&
    kits.find(
      (kit) =>
        kit.status === "published" &&
        kit.source_issue_number === issue.number &&
        kit.author.github_user_id === issue.user.id,
    );

  if (publishedCreate) {
    return {
      disposition: "published-create",
      desiredOwnedLabels: publishedOwnedLabels,
      desiredState: "closed",
      desiredStateReason: "completed",
      dispatch: false,
    };
  }

  const appliedEdit =
    manifest?.operation === "edit" &&
    kits.find(
      (kit) =>
        kit.id === manifest.kit_id &&
        kit.status === "published" &&
        kit.author.github_user_id === issue.user.id &&
        typeof manifest.title === "string" &&
        typeof manifest.description === "string" &&
        Array.isArray(manifest.project_ids) &&
        kit.title === manifest.title.trim() &&
        kit.description === manifest.description.trim() &&
        JSON.stringify(kit.project_ids) ===
          JSON.stringify(manifest.project_ids),
    );
  if (appliedEdit) {
    return {
      disposition: "applied-edit",
      desiredOwnedLabels: publishedOwnedLabels,
      desiredState: "closed",
      desiredStateReason: "completed",
      dispatch: false,
    };
  }

  const superseded =
    manifest?.operation === "create" &&
    kits.some(
      (kit) =>
        kit.status === "published" &&
        kit.author.github_user_id === issue.user.id &&
        projectSetKey(kit.project_ids) === projectSetKey(manifest.project_ids),
    );
  if (superseded) {
    return {
      disposition: "superseded",
      desiredOwnedLabels: [
        "issue-admitted",
        "kit-submission",
        "duplicate-candidate",
      ],
      desiredState: "closed",
      desiredStateReason: null,
      dispatch: false,
    };
  }

  const validation = validateKitSubmission({
    manifest: parseKitIssueFields(issue.body ?? "").manifest,
    actor: issue.user,
    projects,
    kits,
    blockedUsers,
    sourceIssueNumber: issue.number,
  });
  if (validation.valid) {
    return {
      disposition: "unpublished-valid",
      desiredOwnedLabels: ["issue-admitted", "kit-submission"],
      desiredState: "open",
      desiredStateReason: null,
      dispatch: true,
    };
  }
  return {
    disposition: "invalid",
    desiredOwnedLabels: [
      "issue-admitted",
      "kit-submission",
      ...validation.labels,
    ],
    desiredState: issue.state,
    desiredStateReason: null,
    dispatch: false,
  };
}

export function buildKitReconciliationLedger({
  issues,
  projects,
  kits,
  blockedUsers,
}) {
  return [...issues]
    .sort((left, right) => left.number - right.number)
    .map((issue) => {
      const classification = classifyKitSubmissionHistory({
        issue,
        projects,
        kits,
        blockedUsers,
      });
      const currentLabels = (issue.labels ?? [])
        .map((label) => (typeof label === "string" ? label : label?.name))
        .filter(Boolean);
      return {
        issueNumber: issue.number,
        ...classification,
        labels: reconcileOwnedKitLabels({
          currentLabels,
          desiredOwnedLabels: classification.desiredOwnedLabels,
        }),
      };
    });
}

function isKitSubmissionIssue(issue) {
  return (
    !issue.pull_request &&
    /^### Kit manifest\s*$/mu.test(String(issue.body ?? ""))
  );
}

const reconciliationRouteLabels = {
  "kit-submission": {
    color: "1d76db",
    description: "Structured Kit submission awaiting Tavernary processing.",
  },
  "kit-withdrawal": {
    color: "6e7781",
    description: "Structured Kit withdrawal awaiting Tavernary processing.",
  },
};

function sameLabelSet(left, right) {
  return (
    left.length === right.length && left.every((value) => right.includes(value))
  );
}

export async function runKitReconciliation({
  repository,
  apply,
  gh,
  projects,
  kits,
  blockedUsers,
}) {
  const raw = await gh([
    "api",
    "--paginate",
    "--slurp",
    "--method",
    "GET",
    `repos/${repository}/issues`,
    "-f",
    "state=all",
    "-f",
    "per_page=100",
  ]);
  const pages = JSON.parse(raw);
  const issues = pages.flat().filter(isKitSubmissionIssue);
  const ledger = buildKitReconciliationLedger({
    issues,
    projects,
    kits,
    blockedUsers,
  });
  if (!apply) return ledger;

  const existingLabels = JSON.parse(
    await gh([
      "label",
      "list",
      "--repo",
      repository,
      "--limit",
      "100",
      "--json",
      "name",
    ]),
  );
  const existingLabelNames = new Set(existingLabels.map(({ name }) => name));
  for (const [name, definition] of Object.entries(reconciliationRouteLabels)) {
    if (existingLabelNames.has(name)) continue;
    await gh([
      "label",
      "create",
      name,
      "--repo",
      repository,
      "--color",
      definition.color,
      "--description",
      definition.description,
    ]);
  }

  const issueByNumber = new Map(issues.map((issue) => [issue.number, issue]));
  for (const entry of ledger) {
    const issue = issueByNumber.get(entry.issueNumber);
    const currentLabels = (issue.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean);
    if (!sameLabelSet(currentLabels, entry.labels)) {
      await gh(
        [
          "api",
          "--method",
          "PUT",
          `repos/${repository}/issues/${entry.issueNumber}/labels`,
          "--input",
          "-",
        ],
        JSON.stringify({ labels: entry.labels }),
      );
    }

    const stateDiffers = issue.state !== entry.desiredState;
    const reasonDiffers =
      entry.desiredStateReason &&
      issue.state_reason !== entry.desiredStateReason;
    if (stateDiffers || reasonDiffers) {
      const update = { state: entry.desiredState };
      if (entry.desiredStateReason) {
        update.state_reason = entry.desiredStateReason;
      }
      await gh(
        [
          "api",
          "--method",
          "PATCH",
          `repos/${repository}/issues/${entry.issueNumber}`,
          "--input",
          "-",
        ],
        JSON.stringify(update),
      );
    }

    if (entry.dispatch) {
      await gh([
        "workflow",
        "run",
        "triage-kit-submission.yml",
        "--repo",
        repository,
        "--ref",
        "main",
        "-f",
        `issue_number=${entry.issueNumber}`,
      ]);
    }
  }
  return ledger;
}

export function parseReconciliationArgs(args) {
  const repoIndex = args.indexOf("--repo");
  const repository = repoIndex >= 0 ? args[repoIndex + 1] : "";
  if (!repository || !/^[^/\s]+\/[^/\s]+$/u.test(repository)) {
    throw new Error("A GitHub repository is required.");
  }
  return {
    repository,
    apply: args.includes("--apply"),
  };
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

export function executeGh(args, stdin) {
  return new Promise((resolveCommand, rejectCommand) => {
    const command = process.platform === "win32" ? "gh.exe" : "gh";
    const child = spawn(command, args, {
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) {
        resolveCommand(stdout);
        return;
      }
      rejectCommand(
        new Error(
          `gh ${args.join(" ")} failed with exit ${code}: ${stderr.trim()}`,
        ),
      );
    });
    child.stdin.end(stdin);
  });
}

async function main() {
  const options = parseReconciliationArgs(process.argv.slice(2));
  const [projects, kits, blockedUsers] = await Promise.all([
    readJsonDirectory("data/registry/projects"),
    readJsonDirectory("data/registry/kits"),
    readFile("data/moderation/blocked-github-users.json", "utf8").then(
      JSON.parse,
    ),
  ]);
  const ledger = await runKitReconciliation({
    ...options,
    gh: executeGh,
    projects,
    kits,
    blockedUsers,
  });
  console.log(JSON.stringify(ledger, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
