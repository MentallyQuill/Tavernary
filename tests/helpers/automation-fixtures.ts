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

export const AUTOMATION_NOW = Date.parse("2026-10-07T12:00:00.000Z");

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
