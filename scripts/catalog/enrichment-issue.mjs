import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { validateEnrichmentReport } from "./enrichment-report.mjs";

export const ENRICHMENT_ISSUE_TITLE = "Catalog enrichment errors";
export const ENRICHMENT_ISSUE_LABEL = "catalog-enrichment-errors";
export const ENRICHMENT_ISSUE_MARKER =
  "<!-- tavernary:catalog-enrichment-errors -->";

const unresolvedOutcomes = new Set([
  "source-not-ready",
  "final-failure",
  "skipped",
]);

function sanitizeDetail(value) {
  return String(value ?? "")
    .replace(/<[^>]*>/gu, "")
    .replace(/@/gu, "@\u200b")
    .replace(/\|/gu, "\\|")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 300);
}

function issueRows(report) {
  return Object.values(report?.entries ?? {})
    .filter((entry) => unresolvedOutcomes.has(entry?.outcome))
    .map((entry) => ({
      id: sanitizeDetail(entry.id),
      outcome: sanitizeDetail(entry.outcome),
      reasonCode: sanitizeDetail(entry.reason_code ?? "unknown"),
      detail: sanitizeDetail(entry.message ?? ""),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function buildEnrichmentIssueNotice({
  rolloutResult,
  report,
  runUrl,
  runAt,
}) {
  if (
    rolloutResult?.status === "complete-with-errors" &&
    report?.status !== "complete-with-errors"
  ) {
    throw new Error(
      "complete-with-errors rollout requires a matching terminal report",
    );
  }
  const unresolved =
    rolloutResult?.status === "complete-with-errors" ? issueRows(report) : [];
  const table = unresolved
    .map(
      ({ id, outcome, reasonCode, detail }) =>
        `| ${id} | ${outcome} | ${reasonCode} | ${detail} |`,
    )
    .join("\n");
  const body = `${ENRICHMENT_ISSUE_MARKER}
# ${ENRICHMENT_ISSUE_TITLE}

Latest completed run: [GitHub Actions run](${runUrl})
Completed at: ${runAt}

| Project | Outcome | Reason | Detail |
| --- | --- | --- | --- |
${table}
`;

  return {
    title: ENRICHMENT_ISSUE_TITLE,
    label: ENRICHMENT_ISSUE_LABEL,
    marker: ENRICHMENT_ISSUE_MARKER,
    unresolved,
    annotations: unresolved.map(
      ({ id, reasonCode }) =>
        `::warning title=Catalog enrichment unresolved::${id} remained provisional (${reasonCode}).`,
    ),
    body,
  };
}

async function checked(runCommand, command, args) {
  const result = await runCommand(command, args);
  if (result.exitCode !== 0) {
    throw new Error(
      `${command} ${args.slice(0, 2).join(" ")} failed with exit code ${result.exitCode}`,
    );
  }
  return result;
}

export async function syncEnrichmentIssue({
  notice,
  repository,
  bodyPath,
  runCommand,
  writeFile,
  runUrl,
}) {
  await checked(runCommand, "gh", [
    "label",
    "create",
    ENRICHMENT_ISSUE_LABEL,
    "--repo",
    repository,
    "--color",
    "b60205",
    "--description",
    "Automatic catalog enrichment has unresolved projects.",
    "--force",
  ]);
  const listed = await checked(runCommand, "gh", [
    "issue",
    "list",
    "--repo",
    repository,
    "--state",
    "all",
    "--label",
    ENRICHMENT_ISSUE_LABEL,
    "--limit",
    "100",
    "--json",
    "number,title,state,body",
  ]);
  const issues = JSON.parse(listed.stdout);
  const matching = issues.filter(
    (issue) =>
      issue.title === ENRICHMENT_ISSUE_TITLE &&
      issue.body?.includes(ENRICHMENT_ISSUE_MARKER),
  );
  if (matching.length > 1) {
    throw new Error("multiple rolling catalog enrichment issues exist");
  }
  const issue = matching[0];
  if (notice.unresolved.length === 0) {
    if (issue?.state === "OPEN") {
      await checked(runCommand, "gh", [
        "issue",
        "close",
        String(issue.number),
        "--repo",
        repository,
        "--reason",
        "completed",
        "--comment",
        `Resolved by ${runUrl}.`,
      ]);
    }
    return;
  }

  await writeFile(bodyPath, notice.body);
  if (!issue) {
    await checked(runCommand, "gh", [
      "issue",
      "create",
      "--repo",
      repository,
      "--title",
      ENRICHMENT_ISSUE_TITLE,
      "--label",
      ENRICHMENT_ISSUE_LABEL,
      "--body-file",
      bodyPath,
    ]);
    return;
  }
  if (issue.state === "CLOSED") {
    await checked(runCommand, "gh", [
      "issue",
      "reopen",
      String(issue.number),
      "--repo",
      repository,
    ]);
  }
  await checked(runCommand, "gh", [
    "issue",
    "edit",
    String(issue.number),
    "--repo",
    repository,
    "--title",
    ENRICHMENT_ISSUE_TITLE,
    "--add-label",
    ENRICHMENT_ISSUE_LABEL,
    "--body-file",
    bodyPath,
  ]);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function executeCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

export async function runEnrichmentIssueCli(options) {
  const environment = options.environment ?? process.env;
  const repository = environment.GITHUB_REPOSITORY;
  const serverUrl = environment.GITHUB_SERVER_URL;
  const runId = environment.GITHUB_RUN_ID;
  const runnerTemp = environment.RUNNER_TEMP;
  if (!repository || !serverUrl || !runId || !runnerTemp) {
    throw new Error("GitHub Actions issue-reporting environment is incomplete");
  }
  const read = options.readJson ?? readJson;
  const rolloutResult = await read(options.resultPath);
  const validateReport = options.validateReport ?? validateEnrichmentReport;
  const report =
    rolloutResult.status === "complete-with-errors"
      ? validateReport(await read(options.reportPath))
      : null;
  const runUrl = `${serverUrl}/${repository}/actions/runs/${runId}`;
  const notice = buildEnrichmentIssueNotice({
    rolloutResult,
    report,
    runUrl,
    runAt: options.now ?? new Date().toISOString(),
  });
  const writeOutput = options.writeOutput ?? console.log;
  for (const annotation of notice.annotations) writeOutput(annotation);
  await syncEnrichmentIssue({
    notice,
    repository,
    bodyPath: join(runnerTemp, "catalog-enrichment-errors.md"),
    runCommand: options.runCommand ?? executeCommand,
    writeFile: options.writeFile ?? writeFile,
    runUrl,
  });
  return {
    status: rolloutResult.status,
    unresolved: notice.unresolved.length,
  };
}

export function enrichmentIssueCliOptions(argv) {
  const value = (name) => {
    const index = argv.lastIndexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const resultPath = value("--result-path");
  const reportPath = value("--report-path");
  if (!resultPath || !reportPath) {
    throw new Error("--result-path and --report-path are required");
  }
  return { resultPath, reportPath };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runEnrichmentIssueCli(enrichmentIssueCliOptions(process.argv.slice(2)))
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
