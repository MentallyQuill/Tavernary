import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readCanonicalPublicationEvidence } from "./publication-evidence.mjs";
import {
  loadGithubAutomationInventory,
  loadAutomationWorkerRuns,
} from "./github-inventory.mjs";
import { discoverProjectOperations } from "./project-operations.mjs";
import { discoverKitOperations } from "./kit-operations.mjs";
import { discoverCatalogOperations } from "./catalog-operations.mjs";
import { discoverReportOperations } from "./report-operations.mjs";
import { discoverDeploymentOperations } from "./deployment-operations.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import {
  automationDataDigests,
  verifiedAutomationDeployments,
} from "./data-digests.mjs";
import { buildCatalog } from "../catalog/build.mjs";
import {
  buildTavernKeeperTargets,
  popularityRankedProjectIds,
  popularityTopProjectIds,
} from "../security/tavernkeeper-targets.mjs";
import {
  fetchAndValidateTavernKeeperIndex,
  validateStoredReportIndex,
} from "../security/tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import { trustedOperationWorkerRuns } from "./inventory-worker.mjs";
import { recoverInventoryWorker } from "./inventory-worker.mjs";
import {
  validateCanonicalPublicationRecord,
  discoverCanonicalPublications,
} from "./publication-record.mjs";

async function readJson(root, path, fallback) {
  try {
    return JSON.parse(await readFile(resolve(root, path), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT" && fallback !== undefined) return fallback;
    throw error;
  }
}
async function records(root, path, required = false) {
  let files;
  try {
    files = await readdir(resolve(root, path));
  } catch (error) {
    if (!required && error.code === "ENOENT") return [];
    throw error;
  }
  return Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map((file) => readJson(root, `${path}/${file}`)),
  );
}
export function discoverAutomationState(state) {
  const { remote, local, receipts, nowMs, publisherActorId, repository } =
    state;
  const common = {
    receipts,
    nowMs,
    runs: remote.runs,
    publisherActorId,
    repository,
  };
  const confirmedRevisions = local.confirmedRevisions ?? [];
  const requestedRevisions = local.deployments
    .filter((record) => record.status === "requested")
    .map((record) => record.sourceSha);
  const canonicalPublications = discoverCanonicalPublications({
    records: local.publications ?? [],
    fileDigests: local.publicationFileDigests ?? {},
    receipts,
    confirmedRevisions,
    requestedRevisions,
    nowMs,
  }).map((operation) => {
    recoverInventoryWorker(
      operation,
      common,
      trustedOperationWorkerRuns(common, operation),
    );
    return operation;
  });
  const publishedKeys = new Set(
    canonicalPublications.map((operation) => operation.key),
  );
  const discovered = [
    ...discoverProjectOperations({
      ...common,
      issues: remote.issues,
      pulls: remote.pulls,
      repository,
      catalog: {
        projects: local.projects,
        sources: local.sources,
        confirmedRevisions,
        requestedRevisions,
      },
    }),
    ...discoverKitOperations({
      ...common,
      issues: remote.issues,
      kits: local.kits,
      projects: local.projects,
      sourcesById: Object.fromEntries(
        local.sources.map((source) => [source.id, source]),
      ),
      snapshotsBySourceId: Object.fromEntries(
        local.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
      ),
      blockedUsers: local.blockedUsers,
      trustedEditors: local.trustedEditors,
      canonicalRevision: local.revision,
      confirmedRevisions,
      requestedRevisions,
    }),
    ...discoverCatalogOperations({
      ...common,
      catalog: {
        projects: local.projects,
        sources: local.sources,
        revision: local.revision,
      },
      evidence: local.snapshots,
      advisoryState: local.advisoryState,
      metadataState: local.metadataState,
    }),
    ...(local.reportIndex
      ? discoverReportOperations({
          ...common,
          reportIndex: local.reportIndex,
          registry: local.sources,
          importState: local.importState,
          importedReports: local.importedReports,
        })
      : []),
    ...discoverDeploymentOperations({
      ...common,
      mainHeadSha: remote.mainHeadSha,
      mainCommits: [
        {
          sha: local.revision,
          committedAt: local.committedAt,
          publishable: true,
          catalogDigest: local.catalogDigest,
          targetDigest: local.targetDigest,
        },
      ],
      deployments: local.deployments,
    }),
  ];
  return [
    ...canonicalPublications,
    ...discovered.filter((operation) => !publishedKeys.has(operation.key)),
  ];
}

export async function loadAutomationInventory({
  root,
  gh,
  repository,
  publisherActorId,
  nowMs,
  reportIndex,
}) {
  if (!Number.isSafeInteger(publisherActorId) || publisherActorId < 1)
    throw Object.assign(new Error("Publisher actor is not configured."), {
      code: "publisher-authentication-failed",
    });
  const [
    projects,
    sources,
    snapshots,
    kits,
    receipts,
    advisoryState,
    metadataState,
    deployments,
    blockedUsers,
    importState,
    storedReports,
    installEvidence,
    kitSnapshots,
    codebergSnapshots,
    publicationRecords,
    trustedEditors,
  ] = await Promise.all([
    records(root, "data/registry/projects", true),
    records(root, "data/registry/sources", true),
    records(root, "data/snapshots/github", true),
    records(root, "data/registry/kits", true),
    records(root, "data/maintenance/automation/operations"),
    records(root, "data/snapshots/policy-review"),
    records(root, "data/maintenance/automation/metadata"),
    records(root, "data/maintenance/automation/deployments"),
    readJson(root, "data/moderation/blocked-github-users.json"),
    readJson(root, "data/security/tavernkeeper-import-state.json"),
    readJson(root, "data/security/tavernkeeper-report-summaries.json"),
    records(root, "data/snapshots/install"),
    records(root, "data/snapshots/github/kits"),
    records(root, "data/snapshots/codeberg"),
    records(root, "data/maintenance/automation/publications"),
    readJson(root, "data/maintenance/trusted-tavernary-editors.json"),
  ]);
  snapshots.push(...codebergSnapshots);
  receipts.forEach(validateAutomationReceipt);
  validateTavernKeeperImportState(importState);
  const stored = validateStoredReportIndex(storedReports, sources);
  const remote = await loadGithubAutomationInventory({
    gh,
    repository,
    receipts,
    nowMs,
  });
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const committedAt = new Date(
    execFileSync("git", ["show", "-s", "--format=%cI", revision], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ).toISOString();
  const catalog = await buildCatalog({
    write: false,
    records: projects,
    sources,
    snapshots,
    installEvidence,
    kitRecords: kits,
    kitSnapshots,
    blockedUsers,
    tavernKeeperReports: stored,
    now: committedAt,
  });
  const publicIds = new Set(catalog.projects.map((project) => project.id));
  const targets = buildTavernKeeperTargets({
    contractVersion: 3,
    sources,
    snapshots,
    projects: projects.filter((project) => publicIds.has(project.id)),
    topProjectIds: popularityTopProjectIds(catalog.projects),
    rankedProjectIds: popularityRankedProjectIds(catalog.projects),
    publishedSourceIds: new Set(
      projects
        .filter((project) => publicIds.has(project.id))
        .map((project) => project.source_id),
    ),
    generatedAt: committedAt,
  });
  let index = reportIndex;
  if (!index) {
    try {
      index = await fetchAndValidateTavernKeeperIndex({
        registry: sources,
        timeoutMs: 20_000,
      });
    } catch {
      index = null;
    }
  }
  const local = {
    projects,
    sources,
    snapshots,
    installEvidence,
    kitSnapshots,
    kits,
    advisoryState,
    metadataState,
    deployments,
    blockedUsers,
    importState,
    trustedEditors,
    reportIndex: index,
    storedReports: stored,
    refreshManifest: await readJson(root, "data/snapshots/github-refresh.json"),
    importedReports: stored.reports.map((report) => ({
      ...report,
      synthesis_policy_version: report.synthesis_policy_version,
    })),
    revision,
    committedAt,
    ...automationDataDigests({ catalog, targets }),
  };
  const validatedPublications = publicationRecords.map(
    validateCanonicalPublicationRecord,
  );
  const publicationProof = await readCanonicalPublicationEvidence({
    root,
    revision,
    records: validatedPublications,
  });
  local.publications = publicationProof.publications;
  local.publicationFileDigests = publicationProof.fileDigests;
  local.confirmedRevisions = verifiedAutomationDeployments({
    deployments,
    revision,
    catalogDigest: local.catalogDigest,
    targetDigest: local.targetDigest,
    isAncestor: (ancestor, descendant) => {
      try {
        execFileSync(
          "git",
          ["merge-base", "--is-ancestor", ancestor, descendant],
          { cwd: root, stdio: "ignore" },
        );
        return true;
      } catch {
        return false;
      }
    },
  });
  const state = {
    root,
    repository,
    publisherActorId,
    nowMs,
    remote,
    local,
    receipts,
    operations: [],
  };
  state.operations = discoverAutomationState(state);
  return state;
}

export async function revalidateAutomationOperation({
  state,
  operation,
  gh,
  repository,
  nowMs,
  env = process.env,
}) {
  if (
    ["project", "owner-request"].includes(operation.identity.kind) &&
    ["generated", "validated"].includes(operation.stage) &&
    env.PROJECT_AUTO_PUBLICATION_ENABLED !== "true"
  )
    return null;
  const subject = operation.identity.subject;
  if (subject.startsWith("issue:")) {
    const issueNumber = Number(subject.slice(6));
    const issue = JSON.parse(
      await gh(["api", `repos/${repository}/issues/${issueNumber}`]),
    );
    const relatedPulls = state.remote.pulls.filter((pull) =>
      pull.head?.ref?.endsWith(`-${issueNumber}`),
    );
    const freshPulls = await Promise.all(
      relatedPulls.map((pull) =>
        gh(["api", `repos/${repository}/pulls/${pull.number}`]).then(
          JSON.parse,
        ),
      ),
    );
    state.remote.issues = state.remote.issues.map((previous) =>
      previous.number === issueNumber ? issue : previous,
    );
    const replacements = new Map(freshPulls.map((pull) => [pull.number, pull]));
    state.remote.pulls = state.remote.pulls.map(
      (pull) => replacements.get(pull.number) ?? pull,
    );
  }
  const runs = await loadAutomationWorkerRuns({ gh, repository, nowMs });
  const replacementRuns = new Map(
    [...state.remote.runs, ...runs].map((run) => [run.id, run]),
  );
  state.remote.runs = [...replacementRuns.values()];
  state.nowMs = nowMs;
  return (
    discoverAutomationState(state).find(
      (candidate) => candidate.key === operation.key,
    ) ?? null
  );
}

export async function dispatchAutomationOperation({
  operation,
  gh,
  repository,
  env,
}) {
  validateAutomationOperation(operation);
  if (
    ["project", "owner-request"].includes(operation.identity.kind) &&
    ["generated", "validated"].includes(operation.stage) &&
    env.PROJECT_AUTO_PUBLICATION_ENABLED !== "true"
  )
    throw Object.assign(new Error("Automatic publication is paused."), {
      code: "publisher-authentication-failed",
    });
  await gh([
    "workflow",
    "run",
    "automation-worker.yml",
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    `operation_key=${operation.key}`,
  ]);
  const recentRuns = await loadAutomationWorkerRuns({
    gh,
    repository,
    nowMs: Date.now(),
  });
  const runs = trustedOperationWorkerRuns(
    {
      runs: recentRuns,
      publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    },
    operation,
  );
  return { workerRunId: runs[0]?.id ?? null };
}
