import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const rootDirectory = resolve(import.meta.dirname, "..");
const summariesPath = resolve(
  rootDirectory,
  "data/security/tavernkeeper-report-summaries.json",
);
const nextConfigPath = resolve(rootDirectory, "next.config.ts");
const nextBuildDirectory = resolve(rootDirectory, ".next");

function runNpm(arguments_) {
  return new Promise((resolveRun, rejectRun) => {
    const process_ =
      process.platform === "win32"
        ? spawn(
            process.env.ComSpec ?? "cmd.exe",
            ["/d", "/s", "/c", `npm.cmd ${arguments_.join(" ")}`],
            { cwd: rootDirectory, stdio: "inherit" },
          )
        : spawn("npm", arguments_, { cwd: rootDirectory, stdio: "inherit" });
    process_.once("error", rejectRun);
    process_.once("exit", (code) => {
      if (code === 0) resolveRun();
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
    .slice(0, 2);
  if (targets.length !== 2) {
    throw new Error(
      "TavernKeeper browser fixture needs two healthy GitHub sources",
    );
  }
  return {
    schema_version: 1,
    generated_at: "2026-07-31T12:00:00.000Z",
    reports: targets.map(({ source, snapshot }, index) => ({
      report_id: `browser-fixture-${index + 1}`,
      source_id: source.id,
      provider: "github",
      repository_id: source.repository_id,
      repository: source.repository,
      target_sha: snapshot.repository.head_sha,
      scanner_policy_version: "1",
      completed_at: "2026-07-31T12:00:00.000Z",
      result: index === 0 ? "green" : "yellow",
      finding_counts: {
        severity:
          index === 0
            ? { critical: 0, high: 0, medium: 0, low: 0, info: 0 }
            : { critical: 0, high: 1, medium: 2, low: 0, info: 0 },
      },
      report_url: `https://mentallyquill.github.io/TavernKeeper/reports/browser-fixture-${index + 1}/`,
    })),
  };
}

export async function buildTavernKeeperTestExport() {
  const [originalSummaries, originalNextConfig] = await Promise.all([
    readFile(summariesPath),
    readFile(nextConfigPath, "utf8"),
  ]);
  const fixtureNextConfig = originalNextConfig.replace(
    'allowedDevOrigins: ["127.0.0.1"],',
    'allowedDevOrigins: ["127.0.0.1"],\n  turbopack: { root: process.cwd() },',
  );
  if (fixtureNextConfig === originalNextConfig) {
    throw new Error("TavernKeeper browser fixture could not scope Turbopack");
  }
  await writeFile(
    summariesPath,
    `${JSON.stringify(await fixtureReports(), null, 2)}\n`,
  );
  await writeFile(nextConfigPath, fixtureNextConfig);
  try {
    await rm(nextBuildDirectory, { recursive: true, force: true });
    await runNpm(["run", "build"]);
  } finally {
    await Promise.all([
      writeFile(summariesPath, originalSummaries),
      writeFile(nextConfigPath, originalNextConfig),
    ]);
  }
}

export async function restoreProductionExport() {
  await rm(nextBuildDirectory, { recursive: true, force: true });
  await runNpm(["run", "build"]);
}
