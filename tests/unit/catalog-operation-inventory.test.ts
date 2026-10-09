import { expect, test } from "vitest";
import { discoverCatalogOperations } from "../../scripts/automation/catalog-operations.mjs";
import { catalogInventoryFixture } from "../helpers/automation-fixtures";
import { AUTOMATION_NOW, receiptFixture } from "../helpers/automation-fixtures";
import { createPolicyEvidenceFingerprint } from "../../scripts/moderation/catalog-policy-review-contract.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { validateAutomationOperation } from "../../scripts/automation/operation.mjs";
import {
  createMetadataCache,
  metadataTraitsDigest,
} from "../../scripts/automation/metadata-refresh.mjs";
import { tagVocabularyHash } from "../../scripts/catalog/tag-vocabulary.mjs";
import tags from "../../data/vocabularies/tags.json";

test("a dropped advisory dispatch is reconstructed before state exists", () => {
  const operations = discoverCatalogOperations(
    catalogInventoryFixture({
      changedEvidence: true,
      advisoryState: [],
      receipts: [],
    }),
  );
  expect(
    operations.some((operation) => operation.identity.kind === "advisory"),
  ).toBe(true);
});

test("a repository description change refreshes automatic metadata even with the same commit", () => {
  const input = catalogInventoryFixture();
  const before = discoverCatalogOperations(input).find(
    (value) => value.identity.kind === "metadata",
  )!;
  input.evidence[0].repository = {
    ...input.evidence[0].repository!,
    description: "New verified repository description",
  } as (typeof input.evidence)[0]["repository"];
  const after = discoverCatalogOperations(input).find(
    (value) => value.identity.kind === "metadata",
  )!;
  expect(after.key).not.toBe(before.key);
});

test("metadata input identity binds the immutable repository identifier", () => {
  const input = catalogInventoryFixture();
  const before = discoverCatalogOperations(input).find(
    (value) => value.identity.kind === "metadata",
  )!;
  const source = input.catalog.sources[0];
  if (source.type !== "github" && source.type !== "codeberg")
    throw new Error("Expected repository fixture");
  source.repository_id = 43;
  input.evidence[0].repository!.id = 43;
  const after = discoverCatalogOperations(input).find(
    (value) => value.identity.kind === "metadata",
  )!;
  expect(after.key).not.toBe(before.key);
});

test.each(["metadata", "advisory"] as const)(
  "an authenticated active %s preparation suppresses duplicate dispatch",
  (kind) => {
    const input = catalogInventoryFixture();
    input.repository = "Owner/Repo";
    input.publisherActorId = 41;
    const operation = discoverCatalogOperations(input).find(
      (value) => value.identity.kind === kind,
    )!;
    input.runs = [
      {
        id: 700,
        path: `.github/workflows/${kind === "metadata" ? "enrich-catalog" : "review-catalog-policy"}.yml`,
        head_sha: "b".repeat(40),
        head_branch: "main",
        head_repository: { full_name: input.repository },
        event: "workflow_dispatch",
        display_title: `Automation prepare ${operation.key}`,
        actor: { id: 41, type: "Bot" },
        created_at: new Date(AUTOMATION_NOW).toISOString(),
        status: "in_progress",
        conclusion: null,
      },
    ];
    expect(
      discoverCatalogOperations(input).find(
        (current) => current.key === operation.key,
      )?.workerRunId,
    ).toBe(700);
    input.runs![0].actor!.id = 42;
    expect(
      discoverCatalogOperations(input).find(
        (current) => current.key === operation.key,
      )?.workerRunId,
    ).toBeNull();
  },
);

test("unchanged reviewed evidence is skipped, while changed evidence or policy is rediscovered", () => {
  const input = catalogInventoryFixture();
  const fingerprint = createPolicyEvidenceFingerprint({
    projectId: "example-project",
    sourceId: "github-42",
    headSha: "a".repeat(40),
    policyVersion: CATALOG_POLICY_VERSION,
  });
  input.advisoryState = [
    {
      project_id: "example-project",
      source_id: "github-42",
      source_identity: "github:owner/repo",
      evidence_fingerprint: fingerprint,
      policy_version: CATALOG_POLICY_VERSION,
      status: "clear",
      reviewed_at: new Date(AUTOMATION_NOW).toISOString(),
    },
  ];
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(false);
  input.evidence[0].repository!.head_sha = "e".repeat(40);
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(true);
  input.evidence[0].repository!.head_sha = "a".repeat(40);
  input.advisoryState[0].policy_version = "old";
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(true);
});

test("unavailable advisory state retains a stable daily probe after a 72-hour outage", () => {
  const input = catalogInventoryFixture();
  input.advisoryState = [
    {
      project_id: "example-project",
      source_id: "github-42",
      source_identity: "github:owner/repo",
      evidence_fingerprint: createPolicyEvidenceFingerprint({
        projectId: "example-project",
        sourceId: "github-42",
        headSha: "a".repeat(40),
        policyVersion: CATALOG_POLICY_VERSION,
      }),
      policy_version: CATALOG_POLICY_VERSION,
      status: "review-unavailable",
      reviewed_at: new Date(AUTOMATION_NOW).toISOString(),
      retry: {
        attempts: 3,
        last_failure_at: new Date(AUTOMATION_NOW).toISOString(),
      },
    },
  ];
  const operation = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "advisory",
  )!;
  expect(operation.nextEligibleAt).toBe(
    new Date(AUTOMATION_NOW + 86_400_000).toISOString(),
  );
  input.nowMs += 72 * 3_600_000;
  expect(
    discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === "advisory",
    )!.nextEligibleAt,
  ).toBe(operation.nextEligibleAt);
});

test("due refresh and changed automatic metadata remain separate operations with validated identities", () => {
  const input = catalogInventoryFixture();
  const operations = discoverCatalogOperations(input);
  expect(operations.map((operation) => operation.identity.kind)).toEqual(
    expect.arrayContaining(["refresh", "metadata", "advisory"]),
  );
  for (const operation of operations)
    expect(() => validateAutomationOperation(operation)).not.toThrow();
  input.evidence[0].refreshed_at = new Date(AUTOMATION_NOW).toISOString();
  expect(
    Date.parse(
      discoverCatalogOperations(input).find(
        (operation) => operation.identity.kind === "refresh",
      )!.nextEligibleAt!,
    ),
  ).toBeGreaterThan(AUTOMATION_NOW);
});

test("cached metadata and fully manual fields do not call optional enrichment", () => {
  const input = catalogInventoryFixture();
  const metadata = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "metadata",
  )!;
  input.metadataState = [
    createMetadataCache({
      operation: metadata,
      record: { ...input.catalog.projects[0], metadata_status: "curated" },
      sourceIdentity: "github:42",
      headSha: input.evidence[0].repository!.head_sha!,
      normalizedContent: "fixture",
      vocabularyHash: tagVocabularyHash(
        tags as Parameters<typeof tagVocabularyHash>[0],
      ),
      nowMs: AUTOMATION_NOW,
    }),
  ];
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "metadata",
    ),
  ).toBe(false);
  const cache = input.metadataState[0];
  cache.traitsDigest = metadataTraitsDigest({
    ...input.catalog.projects[0],
    name: "Changed project",
  });
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "metadata",
    ),
  ).toBe(true);
  input.metadataState = [];
  input.catalog.projects[0].metadata_policy = {
    summary: { mode: "manual" },
    tags: { mode: "manual" },
  };
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "metadata",
    ),
  ).toBe(false);
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(true);
});

test.each(["delisted", "deleted", "identity-change"])(
  "%s sources cannot enter optional model review",
  (condition) => {
    const input = catalogInventoryFixture();
    if (condition === "delisted") input.catalog.sources[0].status = "delisted";
    else input.evidence[0].source_health = condition;
    expect(
      discoverCatalogOperations(input).some((operation) =>
        ["metadata", "advisory"].includes(operation.identity.kind),
      ),
    ).toBe(false);
  },
);

test("a suggested review without its notice is recovered separately from model inference", () => {
  const input = catalogInventoryFixture();
  input.advisoryState = [
    {
      project_id: "example-project",
      source_id: "github-42",
      source_identity: "github:owner/repo",
      evidence_fingerprint: createPolicyEvidenceFingerprint({
        projectId: "example-project",
        sourceId: "github-42",
        headSha: "a".repeat(40),
        policyVersion: CATALOG_POLICY_VERSION,
      }),
      policy_version: CATALOG_POLICY_VERSION,
      status: "review-suggested",
      reviewed_at: new Date(AUTOMATION_NOW).toISOString(),
      maintenance_issue_number: null,
    },
  ];
  expect(
    discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === "advisory",
    )?.stage,
  ).toBe("validated");
  input.advisoryState[0].maintenance_issue_number = 123;
  expect(
    discoverCatalogOperations(input).some(
      (operation) => operation.identity.kind === "advisory",
    ),
  ).toBe(false);
});

test("a cancelled advisory without state retains current-input retry timing and detects active workers", () => {
  const input = catalogInventoryFixture();
  const operation = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "advisory",
  )!;
  input.publisherActorId = 41_982_982;
  input.runs = [
    {
      id: 700,
      path: ".github/workflows/automation-worker.yml",
      event: "workflow_dispatch",
      display_title: `Automation ${operation.key}`,
      actor: { id: input.publisherActorId, type: "Bot" },
      head_branch: "main",
      status: "completed",
      conclusion: "cancelled",
      created_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
      updated_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
    },
  ];
  input.receipts = [
    receiptFixture({ operation: { ...operation, workerRunId: 700 } }),
  ];
  const failed = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "advisory",
  )!;
  expect(failed.retry?.failure.kind).toBe("transient");
  input.receipts = [receiptFixture({ operation: failed })];
  input.nowMs += 72 * 3_600_000;
  expect(
    discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === "advisory",
    )!.nextEligibleAt,
  ).toBe(failed.nextEligibleAt);
  input.runs[0].conclusion = null;
  input.runs[0].status = "in_progress";
  expect(
    discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === "advisory",
    )!.workerRunId,
  ).toBe(700);
});

test("a persisted dispatch intent suppresses duplicates while GitHub makes the worker visible", () => {
  const input = catalogInventoryFixture();
  const operation = discoverCatalogOperations(input).find(
    (operation) => operation.identity.kind === "advisory",
  )!;
  const intent = {
    ...operation,
    nextEligibleAt: new Date(AUTOMATION_NOW + 15 * 60_000).toISOString(),
  };
  input.receipts = [receiptFixture({ operation: intent })];
  expect(
    discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === "advisory",
    )?.nextEligibleAt,
  ).toBe(intent.nextEligibleAt);
});

test.each(["refresh", "metadata", "advisory"])(
  "%s retains its dispatch delay and failure receipt across bookkeeping commits",
  (kind) => {
    const input = catalogInventoryFixture();
    input.catalog.revision = "a".repeat(40);
    const operation = discoverCatalogOperations(input).find(
      (operation) => operation.identity.kind === kind,
    )!;
    const deadline = new Date(AUTOMATION_NOW + 86_400_000).toISOString();
    const intent = { ...operation, nextEligibleAt: deadline };
    input.receipts = [receiptFixture({ operation: intent })];
    input.catalog.revision = "b".repeat(40);
    expect(
      discoverCatalogOperations(input).find(
        (current) => current.key === operation.key,
      )?.nextEligibleAt,
    ).toBe(deadline);
    const retry = {
      failure: {
        kind: "configuration" as const,
        reasonCode: "budget-exhausted" as const,
      },
      transientAttempts: 0,
      immediateAttempts: 0,
    };
    input.receipts = [receiptFixture({ operation: { ...intent, retry } })];
    input.catalog.revision = "c".repeat(40);
    const recovered = discoverCatalogOperations(input).find(
      (current) => current.key === operation.key,
    )!;
    expect(recovered.retry).toEqual(retry);
    expect(recovered.nextEligibleAt).toBe(deadline);
  },
);
