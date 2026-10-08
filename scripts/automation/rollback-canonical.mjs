import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { buildCatalog } from "../catalog/build.mjs";
import {
  buildTavernKeeperTargets,
  popularityTopProjectIds,
  popularityRankedProjectIds,
} from "../security/tavernkeeper-targets.mjs";
import { validateStoredReportIndex } from "../security/tavernkeeper-reports.mjs";
import { automationDataDigests } from "./data-digests.mjs";
export async function readRollbackCanonicalData({ root = process.cwd() } = {}) {
  let totalBytes = 0;
  async function json(path) {
    const absolute = resolve(root, path),
      stat = await lstat(absolute);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size > 8 * 1024 * 1024 ||
      (totalBytes += stat.size) > 256 * 1024 * 1024
    )
      throw new Error("Canonical restore data exceeds its bounds.");
    return JSON.parse(await readFile(absolute, "utf8"));
  }
  async function records(path, optional = false) {
    try {
      const absolute = resolve(root, path),
        stat = await lstat(absolute);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("Canonical restore directory is invalid.");
      const names = (await readdir(absolute))
        .filter((name) => name.endsWith(".json"))
        .sort();
      if (
        names.length > 50000 ||
        names.some((name) => !/^[-a-z0-9]+\.json$/u.test(name))
      )
        throw new Error("Canonical restore record path is invalid.");
      return await Promise.all(names.map((name) => json(`${path}/${name}`)));
    } catch (error) {
      if (optional && error.code === "ENOENT") return [];
      throw error;
    }
  }
  const [
    projects,
    sources,
    github,
    codeberg,
    kits,
    installEvidence,
    kitSnapshots,
    blockedUsers,
    reports,
    refreshManifest,
  ] = await Promise.all([
    records("data/registry/projects"),
    records("data/registry/sources"),
    records("data/snapshots/github"),
    records("data/snapshots/codeberg", true),
    records("data/registry/kits"),
    records("data/snapshots/install", true),
    records("data/snapshots/github/kits", true),
    json("data/moderation/blocked-github-users.json"),
    json("data/security/tavernkeeper-report-summaries.json"),
    json("data/snapshots/github-refresh.json"),
  ]);
  const snapshots = [...github, ...codeberg],
    stored = validateStoredReportIndex(reports, sources);
  const catalog = await buildCatalog({
    write: false,
    records: projects,
    sources,
    snapshots,
    kitRecords: kits,
    installEvidence,
    kitSnapshots,
    blockedUsers,
    tavernKeeperReports: stored,
    refreshManifest,
    now: refreshManifest.completed_at,
  });
  const visible = new Set(catalog.projects.map((project) => project.id)),
    published = projects.filter((project) => visible.has(project.id));
  const targets = buildTavernKeeperTargets({
    contractVersion: 3,
    sources,
    snapshots,
    projects: published,
    topProjectIds: popularityTopProjectIds(catalog.projects),
    rankedProjectIds: popularityRankedProjectIds(catalog.projects),
    publishedSourceIds: new Set(published.map((project) => project.source_id)),
    generatedAt: refreshManifest.completed_at,
  });
  const ownerTombstones = [
    ...new Set([
      ...sources
        .filter((source) => source.status === "delisted")
        .map((source) => source.id),
      ...projects
        .filter((project) => project.listing_status !== "active")
        .map((project) => project.id),
      ...kits.filter((kit) => kit.status === "withdrawn").map((kit) => kit.id),
    ]),
  ].sort();
  return { ...automationDataDigests({ catalog, targets }), ownerTombstones };
}
