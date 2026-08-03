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
  function report({ source, snapshot }, ordinal, riskLevel, current = false) {
    const targetSha = current
      ? snapshot.repository.head_sha
      : ordinal.toString(16).padStart(40, "0");
    const high = riskLevel === "high";
    const reportId = ordinal.toString(16).padStart(64, "0");
    return {
      report_id: reportId,
      scanner_policy_version: "3",
      contextual_review_policy_version: "1",
      source_id: source.id,
      provider: "github",
      repository_id: source.repository_id,
      repository: source.repository,
      target_sha: targetSha,
      completed_at: `2026-07-${String(ordinal).padStart(2, "0")}T12:00:00.000Z`,
      assessed_at: `2026-07-${String(ordinal).padStart(2, "0")}T12:05:00.000Z`,
      synthesis_policy_version: "1",
      synthesis_model: "gpt-5.6-luna",
      assessment: {
        risk_level: riskLevel,
        headline: high ? "High concern" : "Low concern",
        summary: high
          ? "The combined reviewed behavior could expose credentials to an untrusted endpoint."
          : "The reviewed behavior matches the extension's stated purpose, with no material concerns.",
        minor_cautions: high ? 1 : 0,
        material_concerns: high ? 1 : 0,
        high_danger: high ? 1 : 0,
        malicious_evidence: high
          ? "The review found evidence consistent with credential theft."
          : "No evidence of malicious behavior was identified.",
        cited_finding_ids: high ? ["a".repeat(64)] : [],
        interaction_chains: [],
      },
      report_url:
        `https://mentallyquill.github.io/TavernKeeper/reports/github/` +
        `${source.repository_id}/${targetSha}/3/${reportId}/`,
      history_url:
        `https://mentallyquill.github.io/TavernKeeper/reports/github/` +
        `${source.repository_id}/history/`,
    };
  }

  return {
    schema_version: 5,
    generated_at: "2026-07-31T12:00:00.000Z",
    preferred_report_ids: [
      (13).toString(16).padStart(64, "0"),
      (31).toString(16).padStart(64, "0"),
      (30).toString(16).padStart(64, "0"),
    ],
    reports: [
      ...Array.from({ length: 13 }, (_, index) =>
        report(
          targets[0],
          index + 1,
          index === 1 ? "high" : "low",
          index === 12,
        ),
      ),
      report(targets[1], 31, "high", true),
      report(targets[2], 30, "low"),
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
