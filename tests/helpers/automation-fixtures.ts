import {
  operationKey,
  type AutomationOperation,
} from "../../scripts/automation/operation.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import type {
  ProjectInventoryInput,
  ProjectInventoryPull,
  ProjectInventoryRun,
} from "../../scripts/automation/project-operations.mjs";
import {
  createProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
  fingerprintProjectPublicationInput,
} from "../../scripts/publication/project-publication-transaction.mjs";
import { parseProjectSubmissionIssue } from "../../scripts/submissions/parse-project-submission.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import recursion from "../../data/registry/projects/mentallyquill-recursion.json";
import type { KitInventoryInput } from "../../scripts/automation/kit-operations.mjs";
import type { CatalogInventoryInput } from "../../scripts/automation/catalog-operations.mjs";
import type { ReportInventoryInput } from "../../scripts/automation/report-operations.mjs";
import type { DeploymentInventoryInput } from "../../scripts/automation/deployment-operations.mjs";
import type { ReconciliationInput } from "../../scripts/automation/reconcile.mjs";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import reportIndexFixture from "../fixtures/tavernkeeper/report-index.v5.valid.json";
import { validateReportIndex } from "../../scripts/security/tavernkeeper-reports.mjs";
import { initialTavernKeeperImportState } from "../../scripts/security/tavernkeeper-import-state.mjs";
import { createHash } from "node:crypto";
import type {
  PreparedResult,
  PreparedResultContext,
} from "../../scripts/automation/prepared-result.mjs";
import type { PublicationPlanningInput } from "../../scripts/automation/write-lane.mjs";

export function preparedResultFixture(
  overrides: Partial<PreparedResult> & { paths?: string[] } = {},
): PreparedResult {
  const operation = operationFixture({
    identity: {
      kind: "refresh",
      subject: "source:github-42",
      inputDigest: "a".repeat(64),
      policyVersion: "1",
    },
  });
  const content = JSON.stringify({ source_id: "github-42", repository_id: 42 });
  const { paths, ...values } = overrides;
  return {
    schema_version: 1,
    operationKey: operation.key,
    kind: operation.identity.kind,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    source: { id: "github-42", identity: "github:42" },
    authorId: 41_982_982,
    repository: "MentallyQuill/Tavernary",
    producer: {
      workflow: ".github/workflows/refresh-catalog.yml",
      runId: 700,
      sourceSha: "b".repeat(40),
    },
    baseSha: "b".repeat(40),
    files: (paths ?? ["data/snapshots/github/github-42.json"]).map((path) => ({
      path,
      type: "file" as const,
      content,
      sha256: createHash("sha256").update(content).digest("hex"),
      bytes: Buffer.byteLength(content),
      baseDigest: null,
    })),
    ...values,
  };
}
export function preparedResultContextFixture(
  overrides: Partial<PreparedResultContext> = {},
): PreparedResultContext {
  const result = preparedResultFixture();
  return {
    operation: operationFixture({
      identity: {
        kind: "refresh",
        subject: "source:github-42",
        inputDigest: result.inputDigest,
        policyVersion: result.policyVersion,
      },
    }),
    publisherActorId: result.authorId,
    run: {
      id: result.producer.runId,
      path: result.producer.workflow,
      event: "workflow_dispatch",
      head_branch: "main",
      head_sha: result.producer.sourceSha,
      actor: { id: result.authorId, type: "Bot" },
      head_repository: { full_name: result.repository },
      status: "completed",
      conclusion: "success",
    },
    currentState: {
      repository: result.repository,
      mainSha: result.baseSha,
      source: result.source,
      authorId: result.authorId,
      inputDigest: result.inputDigest,
      policyVersion: result.policyVersion,
      authorityValid: true,
      fileDigests: {},
      allowedPaths: result.files.map((file) => file.path),
      validateContent: (_path, value) => {
        const record = value as { source_id?: string; repository_id?: number };
        return (
          record.source_id === result.source.id && record.repository_id === 42
        );
      },
    },
    ...overrides,
  };
}
export function writeLaneFixture(
  overrides: Partial<Omit<PublicationPlanningInput, "candidates">> & {
    candidates?: PreparedResult[];
  } = {},
): PublicationPlanningInput {
  const { candidates = [preparedResultFixture()], ...values } = overrides;
  const context = preparedResultContextFixture();
  return {
    operations: [context.operation],
    currentMainSha: context.currentState.mainSha,
    expectedPublisherId: context.publisherActorId,
    candidates: candidates.map((result) => ({
      result,
      run: {
        ...context.run,
        id: result.producer.runId,
        path: result.producer.workflow,
        head_sha: result.producer.sourceSha,
      },
      currentState: context.currentState,
    })),
    ...values,
  };
}

export const AUTOMATION_NOW = Date.parse("2026-10-07T12:00:00.000Z");

export function controllerFixture(options: { missedWebhook?: boolean } = {}) {
  const inventory = discoverProjectOperations(
    projectInventoryFixture({
      generationRun: options.missedWebhook === false ? {} : null,
    }),
  );
  const dispatches: AutomationOperation[] = [];
  const receipts: AutomationReceipt[] = [];
  const input: ReconciliationInput = {
    inventory: async () => inventory,
    receipts: [],
    nowMs: AUTOMATION_NOW,
    dispatch: async (operation) => {
      dispatches.push(structuredClone(operation));
      return { workerRunId: 700 };
    },
    persist: async (receipt) => {
      receipts.push(structuredClone(receipt));
    },
  };
  return { input, dispatches, receipts };
}

export function deploymentInventoryFixture(): DeploymentInventoryInput {
  return {
    mainHeadSha: "d".repeat(40),
    mainCommits: [
      {
        sha: "d".repeat(40),
        committedAt: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
        catalogDigest: "b".repeat(64),
        targetDigest: "c".repeat(64),
        publishable: true,
      },
    ],
    deployments: [],
    receipts: [],
    nowMs: AUTOMATION_NOW,
  };
}

export function catalogInventoryFixture(
  options: Partial<CatalogInventoryInput> & { changedEvidence?: boolean } = {},
): CatalogInventoryInput {
  const project = {
    ...recursion,
    id: "example-project",
    source_id: "github-42",
  };
  const source = {
    schema_version: 1 as const,
    id: "github-42",
    type: "github" as const,
    repository: "Owner/Repo",
    repository_id: 42,
    status: "active" as const,
    status_reason: null,
    refresh_policy: "automatic" as const,
  };
  const { changedEvidence, ...overrides } = options;
  return {
    catalog: { projects: [project], sources: [source] },
    evidence: [
      {
        source_id: source.id,
        repository: {
          id: 42,
          head_sha: (changedEvidence ? "e" : "a").repeat(40),
        },
        refreshed_at: new Date(AUTOMATION_NOW - 2 * 86_400_000).toISOString(),
        source_health: "healthy",
      },
    ],
    advisoryState: [],
    metadataState: [],
    receipts: [],
    nowMs: AUTOMATION_NOW,
    ...overrides,
  };
}

export function reportInventoryFixture(): ReportInventoryInput {
  const registry = [
    {
      id: "github-42",
      type: "github",
      repository: "owner/repo",
      repository_id: 42,
      status: "active",
    },
  ];
  return {
    reportIndex: validateReportIndex(
      structuredClone(reportIndexFixture),
      registry,
    ),
    registry,
    importState: initialTavernKeeperImportState(
      new Date(AUTOMATION_NOW).toISOString(),
    ),
    importedReports: [],
    receipts: [],
    nowMs: AUTOMATION_NOW,
  };
}

export function kitInventoryFixture(
  options: {
    canonicalPublished?: boolean;
    issueOpen?: boolean;
    confirmedDeployment?: boolean;
    operation?: "create" | "edit" | "withdrawal";
    ready?: boolean;
    admitted?: boolean;
  } = {},
): KitInventoryInput {
  const withdrawal = options.operation === "withdrawal";
  const manifest = withdrawal
    ? {
        schema_version: 1,
        request_kind: "kit-withdrawal",
        kit_id: "example-kit-42",
        confirmation: true,
      }
    : {
        operation: options.operation ?? "create",
        kit_id: options.operation === "edit" ? "example-kit-42" : null,
        title: "Example Kit",
        description: "A useful collection.",
        project_ids: ["frontend", "extension-a", "extension-b"],
      };
  const kit = {
    schema_version: 1 as const,
    id: "example-kit-42",
    status: "published" as const,
    title: "Example Kit",
    description: "A useful collection.",
    project_ids: ["frontend", "extension-a", "extension-b"],
    author: { github_user_id: 1, login: "Owner" },
    source_issue_number: 42,
    published_at: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
  };
  const projects = ["frontend", "extension-a", "extension-b"].map(
    (id, index) => ({
      id,
      kind: index === 0 ? "frontend" : "extension",
      source_id: `github-${index + 1}`,
      listing_status: "active",
    }),
  );
  return {
    issues: [
      {
        number: 42,
        state: options.issueOpen === false ? "closed" : "open",
        state_reason: null,
        user: { id: 1, login: "Owner", type: "User" },
        body: `### ${withdrawal ? "Kit withdrawal manifest" : "Kit manifest"}\n${JSON.stringify(manifest)}`,
        labels: [
          withdrawal ? "kit-withdrawal" : "kit-submission",
          ...(options.admitted === false ? [] : ["issue-admitted"]),
          ...(options.ready === false || withdrawal
            ? []
            : ["kit-publication-ready"]),
        ],
        created_at: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
      },
    ],
    kits:
      options.canonicalPublished || options.operation === "edit" || withdrawal
        ? [kit]
        : [],
    projects,
    sourcesById: Object.fromEntries(
      projects.map((project) => [
        project.source_id,
        { id: project.source_id, status: "active" },
      ]),
    ),
    snapshotsBySourceId: {},
    blockedUsers: { blocked: [] },
    runs: [],
    receipts: [],
    nowMs: AUTOMATION_NOW,
    publisherActorId: 41_982_982,
    canonicalRevision: "d".repeat(40),
    confirmedRevisions: options.confirmedDeployment ? ["d".repeat(40)] : [],
  };
}

export function operationFixture(
  overrides: Partial<AutomationOperation> = {},
): AutomationOperation {
  const identity = overrides.identity ?? {
    kind: "project",
    subject: "issue:42",
    inputDigest: "a".repeat(64),
    policyVersion: "1",
  };
  return {
    key: operationKey(identity),
    identity,
    stage: "admitted",
    createdAt: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
    nextEligibleAt: null,
    expectedSha: "b".repeat(40),
    workerRunId: null,
    retry: null,
    ...overrides,
  };
}

export function receiptFixture(
  overrides: Partial<AutomationReceipt> = {},
): AutomationReceipt {
  return {
    schema_version: 1,
    operation: operationFixture(),
    updatedAt: new Date(AUTOMATION_NOW).toISOString(),
    completedAt: null,
    ...overrides,
  };
}

export function projectInventoryFixture(
  options: {
    admittedIssue?: boolean;
    producer?: "project-submission" | "project-owner-request";
    generatedPull?: Partial<ProjectInventoryPull> | null;
    generationRun?: Partial<ProjectInventoryRun> | null;
    validationRun?: Partial<ProjectInventoryRun> | null;
    merged?: boolean;
    publicationMode?: "automatic" | "manual";
    confirmedDeployment?: boolean;
  } = {},
): ProjectInventoryInput {
  const producer = options.producer ?? "project-submission";
  const manifest =
    producer === "project-submission"
      ? {
          schema_version: 4,
          project_type: "extension",
          primary_function: "generation-reasoning",
          source_url: "https://github.com/Owner/Repo",
          frontends: { known_ids: ["sillytavern"], other: [] },
          frontend_independent: false,
          additional_context: null,
          metadata: {
            summary: { mode: "automatic" },
            tags: { mode: "automatic" },
          },
        }
      : {
          schema_version: 2,
          request_kind: "project-owner",
          operation: "retire-card",
          source_id: "github-42",
          repository_id: 42,
          explanation: null,
          project_id: "example-project",
          project_fingerprint: "b".repeat(64),
          original: { listing_status: "active", listing_status_reason: null },
          proposed: {
            listing_status: "retired",
            listing_status_reason: "owner-request",
          },
        };
  const body = `### ${producer === "project-submission" ? "Project manifest" : "Owner request manifest"}\n${JSON.stringify(manifest)}`;
  const parsed =
    producer === "project-submission"
      ? parseProjectSubmissionIssue(body)
      : null;
  if (parsed && !parsed.valid)
    throw new Error("Project inventory fixture manifest is invalid");
  const inputDigest = fingerprintProjectPublicationInput(
    parsed?.valid ? parsed.manifest : manifest,
  );
  const actor = { id: 1, login: "Owner", type: "User" as const };
  const issue = {
    number: 42,
    state: "open",
    body,
    user: actor,
    labels: [
      producer,
      ...(options.admittedIssue === false ? [] : ["issue-admitted"]),
      "needs-maintainer-review",
    ],
    created_at: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 3_600_000).toISOString(),
  };
  const head = "c".repeat(40);
  const transaction = createProjectPublicationTransaction({
    schema_version: 2,
    operation: producer === "project-submission" ? "create" : "retire-card",
    producer,
    publication_mode: options.publicationMode ?? "automatic",
    issue_number: 42,
    project_ids: ["example-project"],
    source_id: "github-42",
    source_identity: {
      type: "github",
      canonical: "github:42",
      repository_id: 42,
    },
    actor,
    authority_type:
      producer === "project-submission" && options.publicationMode !== "manual"
        ? "community-submitter"
        : "repository-owner",
    input_digest: inputDigest,
    input_fingerprints: {
      projects:
        producer === "project-submission"
          ? {}
          : { "example-project": "b".repeat(64) },
      source: null,
    },
    base_sha: "b".repeat(40),
    generated_head_sha: head,
    generated_paths: [
      "data/registry/projects/example-project.json",
      ...(producer === "project-submission"
        ? [
            "data/registry/sources/github-42.json",
            "data/snapshots/github/github-42.json",
          ]
        : []),
    ],
    policy_version: CATALOG_POLICY_VERSION,
    copy_result: null,
  });
  const branch = `automation/${producer}-${issue.number}`;
  const publisherActorId = 41_982_982;
  const pull: ProjectInventoryPull = {
    number: 84,
    state: options.merged ? "closed" : "open",
    user: { id: publisherActorId, type: "Bot" },
    head: {
      ref: branch,
      sha: head,
      repo: { full_name: "MentallyQuill/Tavernary" },
    },
    base: { ref: "main", repo: { full_name: "MentallyQuill/Tavernary" } },
    body: `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`,
    merged_at: options.merged
      ? new Date(AUTOMATION_NOW - 60_000).toISOString()
      : null,
    merge_commit_sha: options.merged ? "d".repeat(40) : null,
    updated_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
    ...options.generatedPull,
  };
  const generation: ProjectInventoryRun = {
    id: 700,
    path: `.github/workflows/generate-${producer}.yml`,
    event: "workflow_dispatch",
    display_title: `${producer === "project-submission" ? "Project" : "Owner request"} #42: Create review PR`,
    actor: { id: publisherActorId, type: "Bot" },
    status: "in_progress",
    conclusion: null,
    head_branch: "main",
    head_sha: "b".repeat(40),
    created_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
    updated_at: new Date(AUTOMATION_NOW - 60_000).toISOString(),
    ...options.generationRun,
  };
  const validation: ProjectInventoryRun = {
    ...generation,
    id: 701,
    path: ".github/workflows/ci.yml",
    head_branch: branch,
    head_sha: head,
    status: "completed",
    conclusion: "success",
    ...options.validationRun,
  };
  return {
    issues: [issue],
    pulls: options.generatedPull || options.merged ? [pull] : [],
    runs: [
      ...(options.generationRun ? [generation] : []),
      ...(options.validationRun ? [validation] : []),
    ],
    receipts: [],
    publisherActorId,
    nowMs: AUTOMATION_NOW,
    catalog: {
      projects: [
        { ...recursion, id: "example-project", source_id: "github-42" },
      ],
      sources: [
        {
          schema_version: 1,
          id: "github-42",
          type: "github",
          repository: "Owner/Repo",
          repository_id: 42,
          status: "active",
          status_reason: null,
          refresh_policy: "automatic",
        },
      ],
      confirmedRevisions: options.confirmedDeployment ? ["d".repeat(40)] : [],
    },
  };
}
