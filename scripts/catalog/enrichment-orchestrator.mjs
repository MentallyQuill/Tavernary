import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const FULL_REPORT = "data/reports/enrichment-report.json";
const CANARY_REPORT = "data/reports/enrichment-canary.json";

async function finishCanary(operations) {
  let previousProgress = null;
  let checkpointCommit = null;
  while (true) {
    const result = await operations.publishCanaryBatch();
    if (result.checkpointCommit) {
      checkpointCommit = result.checkpointCommit;
    }
    if (result.status === "running" && result.progress === previousProgress) {
      throw new Error("Canary remained running without advancing.");
    }
    previousProgress = result.progress;
    if (result.status === "running") continue;
    if (result.status === "failed") {
      throw new Error("Canary ended with a systemic failure.");
    }
    if (result.status !== "awaiting-deployment") {
      throw new Error(`Canary ended with unexpected status ${result.status}.`);
    }
    return checkpointCommit;
  }
}

async function deployAndApproveCanary(operations, checkpointCommit) {
  const commit =
    checkpointCommit ?? (await operations.canaryCheckpointCommit());
  if (!/^[0-9a-f]{40}$/u.test(commit ?? "")) {
    throw new Error("Canary has no valid registry commit to deploy.");
  }
  const deploymentRunId = await operations.waitForDeployment(commit);
  await operations.approveCanary(commit, deploymentRunId);
}

async function deployAndRecordFull(operations, checkpointCommit) {
  const commit = checkpointCommit ?? (await operations.fullCheckpointCommit());
  if (!/^[0-9a-f]{40}$/u.test(commit ?? "")) {
    throw new Error("Full rollout has no valid checkpoint commit to deploy.");
  }
  const deploymentRunId = await operations.waitForDeployment(commit);
  await operations.recordFullDeployment(commit, deploymentRunId);
}

async function finishFull(operations, firstOperation) {
  let previousProgress = null;
  let checkpointCommit = null;
  let nextOperation = firstOperation;
  while (true) {
    const result = await nextOperation();
    nextOperation = () => operations.resumeFull();
    if (result.checkpointCommit) {
      checkpointCommit = result.checkpointCommit;
    }
    if (result.status === "running" && result.progress === previousProgress) {
      throw new Error("Full rollout remained running without advancing.");
    }
    previousProgress = result.progress;
    if (result.status === "running") continue;
    if (result.status === "failed") {
      throw new Error("Full rollout ended with a systemic failure.");
    }
    if (!["complete", "complete-with-errors"].includes(result.status)) {
      throw new Error(
        `Full rollout ended with unexpected status ${result.status}.`,
      );
    }
    await deployAndRecordFull(operations, checkpointCommit);
    return { status: result.status };
  }
}

export async function runEnrichmentRollout(operations) {
  await operations.syncMain();
  await operations.preflight();
  let { action } = await operations.plan();

  if (action === "complete") return { status: "complete" };
  if (action === "resume-full") {
    return finishFull(operations, () => operations.resumeFull());
  }
  if (action === "deploy-full") {
    await deployAndRecordFull(operations, null);
    ({ action } = await operations.plan());
    if (action === "complete") return { status: "complete" };
    if (action !== "start-full") {
      throw new Error(
        `Expected start-full after full deployment; received ${action}.`,
      );
    }
  }
  if (action === "restart-full") action = "start-full";

  if (action === "start-canary") {
    await operations.startCanary();
    const checkpointCommit = await finishCanary(operations);
    await deployAndApproveCanary(operations, checkpointCommit);
  } else if (action === "continue-canary") {
    const checkpointCommit = await finishCanary(operations);
    await deployAndApproveCanary(operations, checkpointCommit);
  } else if (action === "deploy-canary") {
    await deployAndApproveCanary(operations, null);
  } else if (action !== "start-full") {
    throw new Error(`Unsupported enrichment rollout action: ${action}`);
  }

  if (action !== "start-full" && action !== "deploy-full") {
    ({ action } = await operations.plan());
    if (action === "complete") return { status: "complete" };
    if (action !== "start-full") {
      throw new Error(`Expected start-full after canary; received ${action}.`);
    }
  }

  await operations.authorizeFull();
  await operations.prepareFull();
  return finishFull(operations, () => operations.startFull());
}

function sanitizeCommandDiagnostic(stderr) {
  let diagnostic = String(stderr ?? "").trim();
  if (diagnostic.length === 0) return "";
  diagnostic = diagnostic
    .replace(/(authorization\s*:\s*bearer\s+)\S+/giu, "$1[REDACTED]")
    .replace(
      /\b(?:github_pat|gh[pousr]|sk-or-v1)_[a-z0-9_-]+\b/giu,
      "[REDACTED]",
    )
    .replace(
      /((?:api[_-]?key|token|secret|password)\s*[=:]\s*)\S+/giu,
      "$1[REDACTED]",
    );
  const limit = 4_000;
  if (diagnostic.length <= limit) return diagnostic;
  return `${diagnostic.slice(0, 1_950)}\n...[stderr truncated]...\n${diagnostic.slice(-1_950)}`;
}

function commandError(command, args, exitCode, stderr) {
  const diagnostic = sanitizeCommandDiagnostic(stderr);
  return new Error(
    `${command} ${args.join(" ")} failed with exit code ${exitCode}.${diagnostic ? `\n${diagnostic}` : ""}`,
  );
}

export async function executeCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!options.silent) process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (!options.silent) process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? 1 });
    });
  });
}

function reportProgress(report) {
  return JSON.stringify([
    report.phase,
    report.primary_cursor,
    report.retry_cursor,
    report.retry_queue?.length ?? 0,
  ]);
}

export function requiresFullCheck(stagedFiles) {
  return stagedFiles.some(
    (path) => !path.replaceAll("\\", "/").startsWith("data/reports/"),
  );
}

async function defaultReadJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export function createGitPublisher({ runCommand, npmCommand }) {
  const raw = (command, args, options = {}) =>
    runCommand(command, args, options);
  const checked = async (command, args, options = {}) => {
    const result = await raw(command, args, options);
    if (result.exitCode !== 0) {
      throw commandError(command, args, result.exitCode, result.stderr);
    }
    return result;
  };

  return async function publishChanges({ paths, message }) {
    const registryStatus = await checked(
      "git",
      ["status", "--porcelain", "--", "data/registry/projects"],
      { silent: true },
    );
    const registryChanged = registryStatus.stdout.trim().length > 0;
    await checked("git", ["add", "-A", "--", ...paths]);
    const staged = await checked("git", ["diff", "--cached", "--name-only"], {
      silent: true,
    });
    if (staged.stdout.trim().length === 0) {
      return {
        changed: false,
        publishedCommit: null,
        registryCommit: null,
      };
    }
    const fullCheck = requiresFullCheck(
      staged.stdout.split(/\r?\n/u).filter(Boolean),
    );
    await checked("git", ["commit", "-m", message]);

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const fetched = await raw("git", ["fetch", "origin", "main"]);
      if (fetched.exitCode !== 0) {
        if (attempt === 3) {
          throw commandError(
            "git",
            ["fetch", "origin", "main"],
            fetched.exitCode,
            fetched.stderr,
          );
        }
        continue;
      }
      const rebased = await raw("git", ["rebase", "origin/main"]);
      if (rebased.exitCode !== 0) {
        const conflicts = await raw(
          "git",
          ["diff", "--name-only", "--diff-filter=U"],
          { silent: true },
        );
        await raw("git", ["rebase", "--abort"], { silent: true });
        if (conflicts.stdout.trim().length > 0) {
          throw new Error(
            `Enrichment publication conflict:\n${conflicts.stdout.trim()}`,
          );
        }
        if (attempt === 3) {
          throw commandError(
            "git",
            ["rebase", "origin/main"],
            rebased.exitCode,
            rebased.stderr,
          );
        }
        continue;
      }
      if (fullCheck) {
        await checked(npmCommand, ["run", "check"]);
      }
      const pushed = await raw("git", ["push", "origin", "HEAD:main"]);
      if (pushed.exitCode === 0) {
        const commit = await checked("git", ["rev-parse", "HEAD"], {
          silent: true,
        });
        const publishedCommit = commit.stdout.trim();
        return {
          changed: true,
          publishedCommit,
          registryCommit: registryChanged ? publishedCommit : null,
        };
      }
      if (attempt === 3) {
        throw commandError(
          "git",
          ["push", "origin", "HEAD:main"],
          pushed.exitCode,
          pushed.stderr,
        );
      }
    }
    throw new Error("Enrichment publication exhausted its retry budget.");
  };
}

export function createProductionOperations(options = {}) {
  const runCommand = options.runCommand ?? executeCommand;
  const npmCommand =
    options.npmCommand ?? (process.platform === "win32" ? "npm.cmd" : "npm");
  const batchSize = String(options.batchSize ?? process.env.BATCH_SIZE ?? 20);
  const concurrency = String(
    options.concurrency ?? process.env.MODEL_CONCURRENCY ?? 4,
  );
  const batchArguments = [
    "--batch-size",
    batchSize,
    "--concurrency",
    concurrency,
  ];
  const readJson = options.readJson ?? defaultReadJson;
  const writeText = options.writeText ?? writeFile;
  const runnerTemp = options.runnerTemp ?? process.env.RUNNER_TEMP;
  const sleep =
    options.sleep ??
    ((milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const publishChanges =
    options.publishChanges ?? createGitPublisher({ runCommand, npmCommand });
  let canaryIds = [];

  const raw = (command, args, commandOptions = {}) =>
    runCommand(command, args, commandOptions);
  const checked = async (command, args, commandOptions = {}) => {
    const result = await raw(command, args, commandOptions);
    if (result.exitCode !== 0) {
      throw commandError(command, args, result.exitCode, result.stderr);
    }
    return result;
  };
  const npm = (args, commandOptions = {}) =>
    checked(npmCommand, args, commandOptions);

  async function syncMain() {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const fetched = await raw("git", ["fetch", "origin", "main"]);
      if (fetched.exitCode !== 0) {
        if (attempt === 3) {
          throw commandError(
            "git",
            ["fetch", "origin", "main"],
            fetched.exitCode,
            fetched.stderr,
          );
        }
        continue;
      }
      const rebased = await raw("git", ["rebase", "origin/main"]);
      if (rebased.exitCode === 0) return;
      const conflicts = await raw(
        "git",
        ["diff", "--name-only", "--diff-filter=U"],
        { silent: true },
      );
      await raw("git", ["rebase", "--abort"], { silent: true });
      if (conflicts.stdout.trim().length > 0 || attempt === 3) {
        throw new Error(
          conflicts.stdout.trim().length > 0
            ? `Enrichment synchronization conflict:\n${conflicts.stdout.trim()}`
            : "Enrichment synchronization failed after three attempts.",
        );
      }
    }
  }

  async function reportCheckpoint(path, message, targetMode) {
    let report = await readJson(path);
    const failed = report.status === "failed";
    if (failed) {
      await checked("git", ["restore", "--", "data/registry/projects"]);
    }
    const publication = await publishChanges({
      paths: failed ? [path] : ["data/registry/projects", path],
      message,
    });
    let checkpointCommit = publication.publishedCommit;
    if (checkpointCommit) {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        `record-${targetMode}-publication`,
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        "--commit-sha",
        checkpointCommit,
      ]);
      await publishChanges({
        paths: [path],
        message: `chore(catalog): record ${targetMode} checkpoint`,
      });
      report = await readJson(path);
    } else {
      checkpointCommit = report.publication?.checkpoint_commit_sha ?? null;
    }
    return {
      status: report.status,
      progress: reportProgress(report),
      checkpointCommit,
    };
  }

  async function checkpointCommit(path, targetMode) {
    const report = await readJson(path);
    const latest = await checked(
      "git",
      ["log", "-1", "--format=%H%x09%s", "--", path],
      { silent: true },
    );
    const [latestCommit, ...subjectParts] = latest.stdout.trim().split("\t");
    const subject = subjectParts.join("\t");
    const recorded = report.publication?.checkpoint_commit_sha ?? null;
    if (
      subject === `chore(catalog): record ${targetMode} checkpoint` &&
      /^[0-9a-f]{40}$/u.test(recorded ?? "")
    ) {
      return recorded;
    }
    const resultSubject =
      targetMode === "canary"
        ? "chore(catalog): checkpoint enrichment canary"
        : "chore(catalog): checkpoint project enrichment";
    if (
      subject === resultSubject &&
      /^[0-9a-f]{40}$/u.test(latestCommit ?? "")
    ) {
      return latestCommit;
    }
    if (!Object.hasOwn(report, "publication")) {
      const currentMain = await checked("git", ["rev-parse", "HEAD"], {
        silent: true,
      });
      const commit = currentMain.stdout.trim();
      return /^[0-9a-f]{40}$/u.test(commit) ? commit : null;
    }
    return null;
  }

  return {
    syncMain,
    async preflight() {
      const result = await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "preflight",
      ]);
      const serialized = result.stdout
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .findLast((line) => line.startsWith("{"));
      const summary = JSON.parse(serialized ?? "null");
      if (summary?.mode !== "preflight" || summary?.status !== "passed") {
        throw new Error("Provider preflight did not return a passed summary.");
      }
      if (runnerTemp) {
        await writeText(
          join(runnerTemp, "enrichment-preflight.log"),
          `${JSON.stringify(summary)}\n`,
        );
      }
    },
    async plan() {
      const result = await npm(["run", "--silent", "catalog:enrichment-plan"], {
        silent: true,
      });
      return JSON.parse(result.stdout.trim());
    },
    async startCanary() {
      const selected = await npm(["run", "--silent", "catalog:select-canary"], {
        silent: true,
      });
      canaryIds = selected.stdout
        .split(/\r?\n/u)
        .map((id) => id.trim())
        .filter(Boolean);
      if (
        canaryIds.length < 5 ||
        canaryIds.length > 7 ||
        new Set(canaryIds).size !== canaryIds.length
      ) {
        throw new Error(
          "Representative canary requires five to seven unique project IDs.",
        );
      }
      await npm([
        "run",
        "catalog:refresh",
        "--",
        "--mode",
        "project",
        ...canaryIds.flatMap((id) => ["--project-id", id]),
        "--deployment-requested",
      ]);
      await npm([
        "run",
        "catalog:backfill-identities",
        "--",
        "--write",
        ...canaryIds.flatMap((id) => ["--project-id", id]),
      ]);
      await npm(["run", "catalog:validate"]);
      await publishChanges({
        paths: [
          "data/snapshots/github",
          "data/snapshots/github-refresh.json",
          "data/registry/projects",
        ],
        message: "chore(catalog): prepare enrichment canary",
      });
    },
    async publishCanaryBatch() {
      if (canaryIds.length === 0) {
        const report = await readJson(CANARY_REPORT);
        canaryIds = [...report.manifest];
      }
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "canary",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        ...batchArguments,
        ...canaryIds.flatMap((id) => ["--project-id", id]),
      ]);
      return reportCheckpoint(
        CANARY_REPORT,
        "chore(catalog): checkpoint enrichment canary",
        "canary",
      );
    },
    async canaryCheckpointCommit() {
      return checkpointCommit(CANARY_REPORT, "canary");
    },
    async fullCheckpointCommit() {
      return checkpointCommit(FULL_REPORT, "full");
    },
    async waitForDeployment(commit) {
      const title = `Deploy Pages - ${commit}`;
      let dispatched = false;
      let dispatchFloor = 0;
      for (let attempt = 1; attempt <= 30; attempt += 1) {
        const result = await checked(
          "gh",
          [
            "run",
            "list",
            "--workflow",
            "deploy-pages.yml",
            "--branch",
            "main",
            "--event",
            "workflow_dispatch",
            "--limit",
            "50",
            "--json",
            "databaseId,displayTitle,status,conclusion",
          ],
          { silent: true },
        );
        const runs = JSON.parse(result.stdout.trim() || "[]");
        const matching = runs
          .filter(
            (run) =>
              run?.displayTitle === title &&
              Number.isInteger(run?.databaseId) &&
              run.databaseId > 0,
          )
          .sort((left, right) => right.databaseId - left.databaseId);
        const reusable = dispatched
          ? matching.find((run) => run.databaseId > dispatchFloor)
          : matching.find(
              (run) =>
                run.status !== "completed" || run.conclusion === "success",
            );
        if (reusable) {
          const runId = reusable.databaseId;
          await checked("gh", ["run", "watch", String(runId), "--exit-status"]);
          return runId;
        }
        if (!dispatched) {
          dispatchFloor = matching[0]?.databaseId ?? 0;
          await checked("gh", [
            "workflow",
            "run",
            "deploy-pages.yml",
            "--ref",
            "main",
            "-f",
            `source_sha=${commit}`,
          ]);
          dispatched = true;
        }
        if (attempt < 30) await sleep(10_000);
      }
      throw new Error(`Pages deployment was not created for ${commit}.`);
    },
    async approveCanary(commit, runId) {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "record-canary-publication",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        "--commit-sha",
        commit,
      ]);
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "approve-canary",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        "--commit-sha",
        commit,
        "--deployment-run-id",
        String(runId),
      ]);
      await publishChanges({
        paths: [CANARY_REPORT],
        message: "chore(catalog): approve enrichment canary",
      });
    },
    async recordFullDeployment(commit, runId) {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "record-full-publication",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        "--commit-sha",
        commit,
      ]);
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "record-full-deployment",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        "--commit-sha",
        commit,
        "--deployment-run-id",
        String(runId),
      ]);
      await publishChanges({
        paths: [FULL_REPORT],
        message: "chore(catalog): record full deployment",
      });
    },
    async authorizeFull() {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "authorize-full",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
      ]);
    },
    async prepareFull() {
      await syncMain();
      await npm([
        "run",
        "catalog:refresh",
        "--",
        "--mode",
        "incremental",
        "--deployment-requested",
      ]);
      await npm(["run", "catalog:backfill-identities", "--", "--write"]);
      await npm(["run", "catalog:validate"]);
      const meaningfulChanges = await checked(
        "git",
        [
          "status",
          "--porcelain",
          "--",
          "data/snapshots/github",
          "data/registry/projects",
        ],
        { silent: true },
      );
      if (meaningfulChanges.stdout.trim().length === 0) {
        await checked("git", [
          "restore",
          "--",
          "data/snapshots/github-refresh.json",
        ]);
        return;
      }
      await publishChanges({
        paths: [
          "data/snapshots/github",
          "data/snapshots/github-refresh.json",
          "data/registry/projects",
        ],
        message: "chore(catalog): prepare full enrichment rollout",
      });
    },
    async startFull() {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "start",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        ...batchArguments,
      ]);
      return reportCheckpoint(
        FULL_REPORT,
        "chore(catalog): checkpoint project enrichment",
        "full",
      );
    },
    async resumeFull() {
      await npm([
        "run",
        "catalog:enrich",
        "--",
        "--mode",
        "resume",
        "--report-path",
        FULL_REPORT,
        "--canary-report-path",
        CANARY_REPORT,
        ...batchArguments,
      ]);
      return reportCheckpoint(
        FULL_REPORT,
        "chore(catalog): checkpoint project enrichment",
        "full",
      );
    },
  };
}

async function main() {
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        command: "catalog:enrichment-rollout",
        mutations: false,
      }),
    );
    return;
  }
  const result = await runEnrichmentRollout(createProductionOperations());
  console.log(JSON.stringify(result));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.stack ?? error.message);
    process.exitCode = 1;
  });
}
