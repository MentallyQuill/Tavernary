import { readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readCanonicalPublicationEvidence } from "./publication-evidence.mjs";
import { publicationHistory } from "./canonical-files.mjs";
import {
  loadGithubAutomationInventory,
  loadAutomationWorkerRuns,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { discoverProjectOperations } from "./project-operations.mjs";
import { discoverKitOperations } from "./kit-operations.mjs";
import { discoverCatalogOperations } from "./catalog-operations.mjs";
import { discoverReportOperations } from "./report-operations.mjs";
import { discoverEnrichmentOperations } from "./enrichment-preparation.mjs";
import { discoverDeploymentOperations } from "./deployment-operations.mjs";
import { readDeploymentCoverage } from "./deployment-coverage.mjs";
import {
  readLatestPublishableRevision,
  readAuthoritativeActiveDeployment,
} from "./deployment-gate.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { assertTrustedPreparationOrigin } from "./prepared-result.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { loadRetiredAutomationReceipts } from "./retention.mjs";
import {
  automationDataDigests,
  verifiedAutomationDeployments,
} from "./data-digests.mjs";
import { buildCatalog } from "../catalog/build.mjs";
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
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
import {
  recoverInventoryWorker,
  matchingOperationReceipt,
  trustedWriterHandoff,
} from "./inventory-worker.mjs";
import {
  inspectProjectRetry,
  inspectProjectRetries,
} from "./project-retries.mjs";
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
async function records(root, path, required = false, invalidReceiptKeys) {
  let files;
  try {
    files = await readdir(resolve(root, path));
  } catch (error) {
    if (!required && error.code === "ENOENT") return [];
    throw error;
  }
  const values = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .sort()
      .map(async (file) => {
        try {
          const value = await readJson(root, `${path}/${file}`);
          if (invalidReceiptKeys) {
            validateAutomationReceipt(value);
            if (file !== `${value.operation.key}.json`)
              throw new Error("Stored receipt path and identity disagree.");
          }
          return value;
        } catch (error) {
          if (!invalidReceiptKeys || (error.code && error.code !== "ENOENT"))
            throw error;
          invalidReceiptKeys.push(
            /^[a-f0-9]{64}\.json$/u.test(file)
              ? file.slice(0, -5)
              : createHash("sha256").update(file).digest("hex"),
          );
          return null;
        }
      }),
  );
  return invalidReceiptKeys ? values.filter((value) => value !== null) : values;
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
    executingWriterRunId: state.executingWriterRunId,
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
    ...discoverEnrichmentOperations(state),
    ...discoverProjectOperations({
      ...common,
      issues: remote.issues,
      pulls: remote.pulls,
      repository,
      resolvedDependencies: new Set(local.resolvedProjectWaits ?? []),
      deferredRetries: new Map(local.deferredProjectRetries ?? []),
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
      canonicalRevisions: local.canonicalKitRevisions,
      confirmedRevisions,
      requestedRevisions,
    }),
    ...discoverCatalogOperations({
      ...common,
      catalog: {
        projects: local.projects,
        sources: local.sources,
        revision: local.revision,
        vocabularyHash: local.vocabularyHash,
        kits: local.kits,
        kitSnapshots: local.kitSnapshots,
        blockedUsers: local.blockedUsers,
        refreshManifest: local.refreshManifest,
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
      ...(local.revision === remote.mainHeadSha && local.publishableRevision
        ? { latestPublishableSha: local.publishableRevision }
        : {}),
      mainCommits: [
        {
          sha: local.publishableRevision ?? local.revision,
          committedAt: local.publishableCommittedAt ?? local.committedAt,
          publishable: true,
          catalogDigest: local.catalogDigest,
          targetDigest: local.targetDigest,
        },
      ],
      deployments: local.deployments,
      activeDeployment: local.activeDeployment ?? null,
      isAncestor: (ancestor, descendant) => {
        try {
          execFileSync(
            "git",
            ["merge-base", "--is-ancestor", ancestor, descendant],
            {
              cwd: state.root,
              timeout: 30000,
              stdio: "ignore",
              windowsHide: true,
            },
          );
          return true;
        } catch (error) {
          return error.status === 1 ? false : null;
        }
      },
    }),
  ];
  const retired = new Map(
    (local.retiredReceipts ?? []).map((receipt) => {
      validateAutomationReceipt(receipt);
      if (receipt.operation.stage !== "finalized")
        throw new Error("Retired automation state is not terminal.");
      return [receipt.operation.key, receipt.operation];
    }),
  );
  return [
    ...canonicalPublications,
    ...discovered.filter((operation) => !publishedKeys.has(operation.key)),
  ]
    .map((operation) => retired.get(operation.key) ?? operation)
    .filter(
      (operation) =>
        !remote.finalizationOperationKey ||
        operation.key === remote.finalizationOperationKey,
    );
}

export async function loadAutomationInventory({
  root,
  gh,
  repository,
  publisherActorId,
  nowMs,
  reportIndex,
  finalizationOperationKey,
  executingWriterRunId,
}) {
  if (
    finalizationOperationKey !== undefined &&
    !/^[a-f0-9]{64}$/u.test(finalizationOperationKey)
  )
    throw new Error("Finalization inventory key is invalid.");
  if (!Number.isSafeInteger(publisherActorId) || publisherActorId < 1)
    throw Object.assign(new Error("Publisher actor is not configured."), {
      code: "publisher-authentication-failed",
    });
  const invalidReceiptKeys = [];
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
    refreshManifest,
    modelBudget,
    enrichmentCanary,
    enrichmentFull,
    runtimePolicy,
  ] = await Promise.all([
    records(root, "data/registry/projects", true),
    records(root, "data/registry/sources", true),
    records(root, "data/snapshots/github", true),
    records(root, "data/registry/kits", true),
    records(
      root,
      "data/maintenance/automation/operations",
      false,
      invalidReceiptKeys,
    ),
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
    readJson(root, "data/snapshots/github-refresh.json"),
    readJson(
      root,
      "data/maintenance/automation/model-budgets/global.json",
      null,
    ),
    readJson(root, "data/reports/enrichment-canary.json", null),
    readJson(root, "data/reports/enrichment-report.json", null),
    readJson(root, "config/supported-runtimes.json", { missing: true }),
  ]);
  snapshots.push(...codebergSnapshots);
  const validatedPublications = publicationRecords.map(
    validateCanonicalPublicationRecord,
  );
  validateTavernKeeperImportState(importState);
  const stored = validateStoredReportIndex(storedReports, sources);
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  const publicationProof = await readCanonicalPublicationEvidence({
    root,
    revision,
    records: validatedPublications,
  });
  const completedPublications = new Set(
    receipts
      .filter((receipt) => receipt.operation.stage === "finalized")
      .map(
        (receipt) =>
          `${receipt.operation.key}:${receipt.operation.expectedSha}`,
      ),
  );
  const remote = await loadGithubAutomationInventory({
    gh,
    repository,
    publisherActorId,
    receipts,
    referencedOperations: publicationProof.publications
      .filter(
        ({ record, revision: publishedSha }) =>
          !completedPublications.has(`${record.operation.key}:${publishedSha}`),
      )
      .map(({ record }) => record.operation),
    nowMs,
    finalizationOperation:
      finalizationOperationKey === undefined
        ? undefined
        : receipts.find(
            (receipt) => receipt.operation.key === finalizationOperationKey,
          )?.operation,
  });
  const committedAt = new Date(
    execFileSync("git", ["show", "-s", "--format=%cI", revision], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
  ).toISOString();
  const publishableRevision = readLatestPublishableRevision({ root, revision });
  const activeDeployment = readAuthoritativeActiveDeployment({
    root,
    revision,
  });
  const publishableCommittedAt = new Date(
    execFileSync("git", ["show", "-s", "--format=%cI", publishableRevision], {
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
    refreshManifest,
    now: refreshManifest.completed_at,
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
    generatedAt: refreshManifest.completed_at,
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
    invalidReceiptKeys: invalidReceiptKeys.sort(),
    receiptInspectionComplete: true,
    projects,
    sources,
    snapshots,
    installEvidence,
    kitSnapshots,
    kits,
    advisoryState,
    metadataState,
    vocabularyHash: tagVocabularyHash(
      await readJson(root, "data/vocabularies/tags.json"),
    ),
    deployments,
    activeDeployment,
    blockedUsers,
    importState,
    trustedEditors,
    reportIndex: index,
    storedReports: stored,
    refreshManifest,
    importedReports: stored.reports.map((report) => ({
      ...report,
      synthesis_policy_version: report.synthesis_policy_version,
    })),
    revision,
    committedAt,
    publishableRevision,
    publishableCommittedAt,
    ...automationDataDigests({ catalog, targets }),
    modelBudget,
    enrichmentCanary,
    enrichmentFull,
    runtimePolicy,
  };
  const kitHistory = await publicationHistory({
    root,
    revision,
    paths: kits.map((kit) => `data/registry/kits/${kit.id}.json`),
  });
  local.canonicalKitRevisions = Object.fromEntries(
    kits.map((kit) => [
      kit.id,
      kitHistory[`data/registry/kits/${kit.id}.json`],
    ]),
  );
  local.publications = publicationProof.publications;
  local.publicationFileDigests = publicationProof.fileDigests;
  const confirmedSources = verifiedAutomationDeployments({
    deployments,
    activeDeployment,
    nowMs,
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
  local.confirmedRevisions = readDeploymentCoverage({
    root,
    sourceShas: confirmedSources,
    candidates: [
      ...confirmedSources,
      ...Object.values(local.canonicalKitRevisions),
      ...publicationProof.publications.map(
        (publication) => publication.revision,
      ),
      ...(remote.pulls ?? [])
        .map((pull) => pull.merge_commit_sha)
        .filter(
          (value) => typeof value === "string" && /^[a-f0-9]{40}$/u.test(value),
        ),
      local.publishableRevision,
    ],
  });
  const state = {
    root,
    repository,
    publisherActorId,
    nowMs,
    inventoryNowMs: nowMs,
    executingWriterRunId,
    remote,
    local,
    receipts,
    operations: [],
  };
  const retries = await inspectProjectRetries({ state, gh });
  local.resolvedProjectWaits = [...retries.resolvedDependencies];
  local.deferredProjectRetries = [...retries.deferredRetries];
  local.projectRetryInspectionFailures = retries.failures;
  local.projectRetryInspectionComplete = retries.inspectionComplete;
  state.operations = discoverAutomationState(state);
  const liveKeys = new Set(receipts.map((receipt) => receipt.operation.key));
  local.retiredReceipts = await loadRetiredAutomationReceipts({
    root,
    revision,
    nowMs,
    operations: state.operations.filter(
      (operation) => !liveKeys.has(operation.key),
    ),
  });
  if (local.retiredReceipts.length) {
    state.receipts.push(...local.retiredReceipts);
    state.operations = discoverAutomationState(state);
  }
  if (remote.finalizationOperationKey) {
    const operation = state.operations.find(
      (current) => current.key === remote.finalizationOperationKey,
    );
    const receipt = receipts.find(
      (current) => current.operation.key === remote.finalizationOperationKey,
    );
    if (
      !operation ||
      !["deployment-confirmed", "finalized"].includes(operation.stage) ||
      operation.expectedSha !== receipt?.operation.expectedSha
    )
      return loadAutomationInventory({
        root,
        gh,
        repository,
        publisherActorId,
        nowMs,
        reportIndex,
        executingWriterRunId,
      });
  }
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
  // Keep the original inventory window while each candidate advances state.nowMs.
  state.inventoryNowMs ??= state.nowMs;
  const runs = await loadAutomationWorkerRuns({
    gh,
    repository,
    nowMs,
    createdAfterMs: state.inventoryNowMs - 1000,
  });
  const replacementRuns = new Map(
    state.remote.runs.map((run) => [run.id, run]),
  );
  function replaceRun(run) {
    const previous = replacementRuns.get(run.id);
    if (
      previous?.automationDiagnostic &&
      Number.isSafeInteger(run.run_attempt) &&
      run.run_attempt > 0 &&
      previous.run_attempt === run.run_attempt &&
      /^[a-f0-9]{40}$/u.test(run.head_sha ?? "") &&
      previous.head_sha === run.head_sha
    )
      run.automationDiagnostic = previous.automationDiagnostic;
    replacementRuns.set(run.id, run);
  }
  runs.forEach(replaceRun);
  const latestWorker = trustedOperationWorkerRuns(
    { runs: state.remote.runs, publisherActorId: state.publisherActorId },
    operation,
  )[0];
  const latestPreparation = state.remote.runs
    .filter((run) => {
      if (run.display_title !== `Automation prepare ${operation.key}`)
        return false;
      try {
        assertTrustedPreparationOrigin({
          kind: operation.identity.kind,
          repository,
          run,
          publisherActorId: state.publisherActorId,
        });
        return true;
      } catch {
        return false;
      }
    })
    .sort((left, right) => right.id - left.id)[0];
  const latestWriter = state.remote.runs
    .filter((run) => trustedWriterHandoff(run, state, operation))
    .sort((left, right) => right.id - left.id)[0];
  const receipt = matchingOperationReceipt(state, operation);
  const freshIds = new Set(runs.map((run) => run.id));
  const knownIds = new Set(
    [
      operation.workerRunId,
      receipt?.operation.workerRunId,
      latestWorker?.id,
      latestPreparation?.id,
      latestWriter?.id,
    ].filter((id) => Number.isSafeInteger(id) && id > 0 && !freshIds.has(id)),
  );
  // A rerun keeps its original creation time and can fall outside the delta.
  await Promise.all(
    [...knownIds].map(async (id) => {
      try {
        const run = JSON.parse(
          await gh(["api", `repos/${repository}/actions/runs/${id}`]),
        );
        if (run.id !== id || typeof run.status !== "string")
          throw new Error("GitHub returned an invalid saved worker.");
        replaceRun(run);
      } catch (error) {
        if (githubFailureStatus(error) !== 404) throw error;
        replacementRuns.delete(id);
      }
    }),
  );
  state.remote.runs = [...replacementRuns.values()];
  state.nowMs = nowMs;
  if (operation.identity.kind === "project") {
    const issue = state.remote.issues.find(
      (value) => value.number === Number(operation.identity.subject.slice(6)),
    );
    if (issue) {
      const retry = await inspectProjectRetry({ state, issue, gh });
      const resolved = new Set(state.local.resolvedProjectWaits ?? []);
      const deferred = new Map(state.local.deferredProjectRetries ?? []);
      if (retry.resolved) resolved.add(issue.number);
      else resolved.delete(issue.number);
      if (retry.notBefore) deferred.set(issue.number, retry.notBefore);
      else deferred.delete(issue.number);
      state.local.resolvedProjectWaits = [...resolved];
      state.local.deferredProjectRetries = [...deferred];
    }
  }
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
  // The persisted dispatch intent protects the operation until the next inventory
  // observes its worker; GitHub may not expose the new run immediately.
  return { workerRunId: null };
}
