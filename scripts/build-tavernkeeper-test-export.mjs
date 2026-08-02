import {
  cp,
  mkdtemp,
  mkdir,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rootDirectory = resolve(import.meta.dirname, "..");
const fixtureEntries = [
  "config",
  "data",
  "public",
  "scripts",
  "src",
  "next-env.d.ts",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "tsconfig.json",
];

function aborted() {
  return new Error("TavernKeeper browser fixture build was interrupted");
}

function runNpm(arguments_, cwd, signal) {
  return new Promise((resolveRun, rejectRun) => {
    const environment = {
      ...process.env,
      TAVERNARY_TURBOPACK_ROOT: rootDirectory,
    };
    const process_ =
      process.platform === "win32"
        ? spawn(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `npm.cmd ${arguments_.join(" ")}`],
            { cwd, env: environment, stdio: "inherit" },
          )
        : spawn("npm", arguments_, {
            cwd,
            env: environment,
            stdio: "inherit",
          });
    const stop = () => process_.kill("SIGTERM");
    if (signal?.aborted) stop();
    signal?.addEventListener("abort", stop, { once: true });
    process_.once("error", (error) => {
      signal?.removeEventListener("abort", stop);
      rejectRun(error);
    });
    process_.once("exit", (code) => {
      signal?.removeEventListener("abort", stop);
      if (signal?.aborted) rejectRun(aborted());
      else if (code === 0) resolveRun();
      else
        rejectRun(new Error(`npm ${arguments_.join(" ")} exited with ${code}`));
    });
  });
}

async function jsonDirectory(path) {
  const entries = await readdir(path, { withFileTypes: true });
  return Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(async (entry) =>
        JSON.parse(await readFile(resolve(path, entry.name), "utf8")),
      ),
  );
}

async function fixtureReports() {
  const [sources, snapshots] = await Promise.all([
    jsonDirectory(resolve(rootDirectory, "data/registry/sources")),
    jsonDirectory(resolve(rootDirectory, "data/snapshots/github")),
  ]);
  const snapshotsBySource = new Map(
    snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
  );
  const targets = sources
    .filter((source) => source.type === "github" && source.status === "active")
    .map((source) => ({ source, snapshot: snapshotsBySource.get(source.id) }))
    .filter(
      ({ source, snapshot }) =>
        snapshot?.provider === "github" &&
        snapshot.source_health === "healthy" &&
        snapshot.stale_since == null &&
        snapshot.repository?.id === source.repository_id &&
        /^[0-9a-f]{40}$/u.test(snapshot.repository?.head_sha ?? ""),
    )
    .slice(0, 3);
  if (targets.length !== 3) {
    throw new Error(
      "TavernKeeper browser fixture needs three healthy GitHub sources",
    );
  }
  function report({ source, snapshot }, ordinal, result, current = false) {
    const targetSha = current
      ? snapshot.repository.head_sha
      : ordinal.toString(16).padStart(40, "0");
    const red = result === "red";
    return {
      report_id: ordinal.toString(16).padStart(64, "0"),
      report_version: 1,
      supersedes_report_id: null,
      scanner_version: "browser-fixture-v2",
      scanner_policy_version: "1",
      prompt_policy_version: "browser-fixture-v2",
      source_id: source.id,
      provider: "github",
      repository_id: source.repository_id,
      repository: source.repository,
      target_sha: targetSha,
      completed_at: `2026-07-${String(ordinal).padStart(2, "0")}T12:00:00.000Z`,
      mode: "standard",
      result,
      finding_counts: {
        total: red ? 3 : 0,
        actionable: red ? 3 : 0,
        actionable_severity: {
          critical: 0,
          high: red ? 1 : 0,
          medium: red ? 2 : 0,
        },
        severity: {
          critical: 0,
          high: red ? 1 : 0,
          medium: red ? 2 : 0,
          low: 0,
          info: 0,
        },
        confidence: { high: red ? 3 : 0, medium: 0, low: 0 },
        disposition: {
          confirmed: red ? 3 : 0,
          not_supported: 0,
          inconclusive: 0,
        },
        categories: red ? [{ category: "credential-theft", count: 3 }] : [],
      },
      coverage: {
        history_commits: 20,
        inventory_files: 12,
        inventory_bytes: 4096,
        tools_completed: 6,
        tools_not_applicable: 0,
        model_chunks: 2,
      },
      report_url:
        `https://mentallyquill.github.io/TavernKeeper/reports/github/` +
        `${source.repository_id}/${targetSha}/1/standard/1/`,
      history_url:
        `https://mentallyquill.github.io/TavernKeeper/reports/github/` +
        `${source.repository_id}/history/`,
    };
  }

  return {
    schema_version: 2,
    generated_at: "2026-07-31T12:00:00.000Z",
    reports: [
      ...Array.from({ length: 13 }, (_, index) =>
        report(
          targets[0],
          index + 1,
          index === 1 ? "red" : "teal",
          index === 12,
        ),
      ),
      report(targets[1], 31, "red", true),
      report(targets[2], 30, "teal"),
    ],
  };
}

async function copyFixtureWorkspace(workspaceDirectory) {
  for (const entry of fixtureEntries) {
    await cp(
      resolve(rootDirectory, entry),
      resolve(workspaceDirectory, entry),
      {
        recursive: true,
      },
    );
  }
  await symlink(
    resolve(rootDirectory, "node_modules"),
    resolve(workspaceDirectory, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
}

/** Builds colored test data without writing to the checked-out worktree. */
export async function buildTavernKeeperTestExport({ signal } = {}) {
  await mkdir(resolve(rootDirectory, ".tmp"), { recursive: true });
  const temporaryDirectory = await mkdtemp(
    resolve(rootDirectory, ".tmp/tavernary-tavernkeeper-scan-"),
  );
  const workspaceDirectory = resolve(temporaryDirectory, "workspace");
  const cleanup = () =>
    rm(temporaryDirectory, { recursive: true, force: true });

  try {
    await copyFixtureWorkspace(workspaceDirectory);
    if (signal?.aborted) throw aborted();
    await writeFile(
      resolve(
        workspaceDirectory,
        "data/security/tavernkeeper-report-summaries.json",
      ),
      `${JSON.stringify(await fixtureReports(), null, 2)}\n`,
    );
    await runNpm(["run", "build"], workspaceDirectory, signal);
    if (signal?.aborted) throw aborted();
    return { cleanup, outputDirectory: resolve(workspaceDirectory, "out") };
  } catch (error) {
    try {
      await cleanup();
    } catch (cleanupError) {
      console.error("Failed to remove TavernKeeper fixture", cleanupError);
    }
    throw error;
  }
}
