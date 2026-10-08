import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { createPolicyEvidenceFingerprint } from "../moderation/catalog-policy-review-contract.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { operationKey } from "./operation.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import { supportsAutomaticEnrichmentSource } from "../catalog/enrichment-policy.mjs";
import { metadataFieldsToGenerate } from "../catalog/metadata-policy.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { planAutomationRetry } from "./retry.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";

function makeOperation(input, kind, subject, value, createdAt) {
  const identity = {
    kind,
    subject,
    inputDigest: fingerprintProjectPublicationInput(value),
    policyVersion: CATALOG_POLICY_VERSION,
  };
  return {
    key: operationKey(identity),
    identity,
    stage: "admitted",
    createdAt: new Date(
      Number.isFinite(createdAt) ? createdAt : 0,
    ).toISOString(),
    nextEligibleAt: null,
    expectedSha: input.catalog.revision ?? null,
    workerRunId: null,
    retry: null,
  };
}

function sourceIdentity(source) {
  return ["github", "codeberg"].includes(source.type)
    ? `${source.type}:${source.repository.toLowerCase()}`
    : `url:${source.url ?? ""}`;
}

export function discoverCatalogOperations(input) {
  const operations = [];
  for (const source of input.catalog.sources) {
    if (
      source.status !== "active" ||
      source.refresh_policy !== "automatic" ||
      !["github", "codeberg"].includes(source.type)
    )
      continue;
    const evidence = input.evidence.find(
      (evidence) => evidence.source_id === source.id,
    );
    const refreshed = Date.parse(evidence?.refreshed_at ?? "");
    const lastRefresh = Number.isFinite(refreshed) ? refreshed : 0;
    const operation = makeOperation(
      input,
      "refresh",
      `source:${source.id}`,
      { source, lastRefresh },
      lastRefresh,
    );
    operation.nextEligibleAt = new Date(lastRefresh + 86_400_000).toISOString();
    operations.push(operation);
  }
  for (const project of input.catalog.projects) {
    const source = input.catalog.sources.find(
      (source) => source.id === project.source_id,
    );
    if (
      !source ||
      !supportsAutomaticEnrichmentSource(source) ||
      project.visibility === "hidden"
    )
      continue;
    const evidence = input.evidence.find(
      (evidence) => evidence.source_id === source.id,
    );
    if (
      !effectiveListingState({ project, source, snapshot: evidence }).public ||
      (evidence?.repository?.id != null &&
        source.repository_id != null &&
        evidence.repository.id !== source.repository_id)
    )
      continue;
    const createdAt = Date.parse(
      evidence?.refreshed_at ?? evidence?.observed_at ?? "",
    );
    const fields = metadataFieldsToGenerate(project);
    if (fields.length) {
      const metadata = makeOperation(
        input,
        "metadata",
        `source:${source.id}:${project.id}`,
        {
          sourceIdentity: sourceIdentity(source),
          sourceId: source.id,
          content:
            evidence?.contentDigest ??
            evidence?.repository?.head_sha ??
            "unavailable",
          fields,
          metadataPolicy: project.metadata_policy,
        },
        createdAt,
      );
      const cached = input.metadataState?.some(
        (state) =>
          state.projectId === project.id &&
          state.inputDigest === metadata.identity.inputDigest &&
          state.policyVersion === CATALOG_POLICY_VERSION,
      );
      if (!cached) operations.push(metadata);
    }
    const fingerprint = createPolicyEvidenceFingerprint({
      projectId: project.id,
      sourceId: source.id,
      headSha: evidence?.repository?.head_sha ?? "unavailable",
      policyVersion: CATALOG_POLICY_VERSION,
    });
    const previous = input.advisoryState.find(
      (state) =>
        state.project_id === project.id &&
        state.source_id === source.id &&
        state.source_identity === sourceIdentity(source) &&
        state.policy_version === CATALOG_POLICY_VERSION &&
        state.evidence_fingerprint === fingerprint,
    );
    if (
      previous?.status === "clear" ||
      (previous?.status === "review-suggested" &&
        Number.isSafeInteger(previous.maintenance_issue_number) &&
        previous.maintenance_issue_number > 0)
    )
      continue;
    const operation = makeOperation(
      input,
      "advisory",
      `source:${source.id}:${project.id}`,
      { sourceIdentity: sourceIdentity(source), fingerprint },
      createdAt,
    );
    if (previous?.status === "review-suggested") operation.stage = "validated";
    if (previous?.status === "review-unavailable") {
      const failure = classifyAutomationFailure();
      const attempts = previous.retry?.attempts ?? 1;
      operation.retry = {
        failure,
        transientAttempts: Math.max(0, attempts - 1),
        immediateAttempts: attempts,
      };
      const failedAt = Date.parse(
        previous.retry?.last_failure_at ?? previous.reviewed_at,
      );
      operation.nextEligibleAt = planAutomationRetry({
        ...operation.retry,
        nowMs: Number.isFinite(failedAt) ? failedAt : input.nowMs,
        jitterSeed: operation.key,
      }).nextEligibleAt;
    }
    operations.push(operation);
  }
  for (const operation of operations)
    recoverInventoryWorker(
      operation,
      input,
      trustedOperationWorkerRuns(input, operation),
    );
  return operations;
}
