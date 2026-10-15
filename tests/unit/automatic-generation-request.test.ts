import { execFileSync } from "node:child_process";
import { expect, test, vi } from "vitest";
import {
  metadataMaintenanceFixture,
  projectInventoryFixture,
} from "../helpers/automation-fixtures";
import { discoverAutomationState } from "../../scripts/automation/inventory.mjs";
import {
  generationRequestOperation,
  generationRequestPublisherRecovery,
  parseGenerationOwnerRequest,
  runPreparationRequestCli,
} from "../../scripts/automation/preparation-request.mjs";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import {
  createModelBudgetState,
  validateModelBudgetState,
} from "../../scripts/automation/model-budget.mjs";
import {
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";
import { fingerprintProjectRecord } from "../../src/features/help/project-owner-record.mjs";
import * as githubInventory from "../../scripts/automation/github-inventory.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";
import type { ProjectInventoryRun } from "../../scripts/automation/project-operations.mjs";
import { persistPreparedFailure } from "../../scripts/automation/prepared-failure.mjs";

async function fixture(
  producer:
    "project-submission" | "project-owner-request" = "project-submission",
  stage: "generated" | "validated" = "validated",
) {
  const p = projectInventoryFixture({
    producer,
    generatedPull: { mergeable: true } as never,
    validationRun: stage === "validated" ? {} : null,
  });
  p.issues[0].labels.push("submission-pr-open");
  const f = await metadataMaintenanceFixture();
  const state = f.state;
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  Object.assign(state, {
    publisherActorId: p.publisherActorId,
    nowMs: p.nowMs,
  });
  Object.assign(state.local, {
    projects: p.catalog.projects,
    sources: p.catalog.sources,
    snapshots: [],
    kits: [],
    kitSnapshots: [],
    deployments: [],
    advisoryState: [],
    metadataState: [],
    revision,
    modelBudget: createModelBudgetState(p.nowMs),
  });
  Object.assign(state.remote, {
    mainHeadSha: revision,
    issues: p.issues,
    pulls: p.pulls,
    runs: p.runs,
  });
  const transaction = parseProjectPublicationTransaction(p.pulls[0].body)!;
  if (producer === "project-owner-request")
    transaction.input_fingerprints.projects["example-project"] =
      fingerprintProjectRecord(p.catalog.projects[0]);
  const writeTransaction = () => {
    p.pulls[0].body = `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`;
  };
  writeTransaction();
  state.receipts = [];
  state.operations = discoverAutomationState(state);
  const run = {
    id: 800,
    path: `.github/workflows/generate-${producer}.yml`,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: revision,
    repository: { id: 1309605115, full_name: state.repository },
    head_repository: { id: 1309605115, full_name: state.repository },
    actor: { id: p.publisherActorId, type: "Bot" },
    run_attempt: 1,
    display_title: `${producer === "project-submission" ? "Project" : "Owner request"} #42: Request review PR force=false`,
    status: "completed",
    conclusion: "success",
    created_at: new Date(p.nowMs).toISOString(),
  };
  const env = {
    GITHUB_REPOSITORY: state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: String(state.publisherActorId),
    GITHUB_WORKFLOW_REF: `${state.repository}/${run.path}@refs/heads/main`,
    GITHUB_RUN_ID: String(run.id),
    GITHUB_RUN_ATTEMPT: "1",
    TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
    UTILITY_MODEL: "primary",
    TAVERNARY_ENRICHMENT_MODEL: "repair",
    TAVERNARY_PUBLICATION_SETTINGS_TOKEN: "fixture-read-token",
  };
  const validation = {
    id: 701,
    name: "Site: Validate changes",
    path: ".github/workflows/ci.yml",
    event: "workflow_dispatch",
    head_branch: p.pulls[0].head.ref,
    head_sha: p.pulls[0].head.sha,
    status: "completed",
    conclusion: "success",
    actor: { id: p.publisherActorId, type: "Bot" },
    head_repository: { full_name: state.repository },
    created_at: new Date(p.nowMs - 60000).toISOString(),
    updated_at: new Date(p.nowMs - 60000).toISOString(),
  };
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find(
      (arg) => arg.startsWith("repos/") || arg.startsWith("repositories/"),
    );
    if (path?.endsWith("/actions/runs/800")) return JSON.stringify(run);
    if (path?.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      return JSON.stringify({ value: "true" });
    if (path?.endsWith("/pulls/84")) return JSON.stringify(p.pulls[0]);
    if (path?.endsWith("/issues/42")) return JSON.stringify(p.issues[0]);
    if (path?.endsWith("/pulls/84/files"))
      return JSON.stringify([
        transaction.generated_paths.map((filename) => ({ filename })),
      ]);
    if (path?.endsWith("/actions/runs/701")) return JSON.stringify(validation);
    if (path === "repositories/42")
      return JSON.stringify({ id: 42, owner: { id: 1, type: "User" } });
    throw new Error(`Unexpected fixture request ${path}`);
  });
  const commit = vi.fn(
    async (input: {
      files: Array<{ content: string }>;
      expectedMainSha: string;
    }) => {
      state.local.modelBudget = JSON.parse(input.files[0].content);
      return { sha: input.expectedMainSha };
    },
  );
  const dispatch = vi.fn(async () => ({ runId: 900, workflow: run.path }));
  const writerInput = {
    requestRunId: run.id,
    env: {
      ...env,
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "850",
    },
    gh,
    load: async () => state,
    commit,
    dispatch,
    persistFailure: vi.fn(async () => {}),
  };
  return {
    p,
    state,
    transaction,
    writeTransaction,
    run,
    env,
    validation,
    commit,
    dispatch,
    writerInput,
  };
}

test.each([
  ["project-submission", "generated"],
  ["project-submission", "validated"],
  ["project-owner-request", "generated"],
  ["project-owner-request", "validated"],
] as const)(
  "native Bot %s regeneration preserves the %s transaction through request admission and reserved dispatch",
  async (producer, stage) => {
    const f = await fixture(producer, stage);
    const original = structuredClone(f.state.operations[0]);
    const write = vi.fn();
    expect(
      await runPreparationRequestCli({
        env: f.env,
        event: { inputs: { issue_number: "42", force_regeneration: "false" } },
        load: async () => f.state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      action: "dispatch",
      inputs: { operation_key: original.key, result_run_id: "800" },
    });
    const request = parseGenerationOwnerRequest(
      f.run,
      f.state.repository,
      f.state.publisherActorId,
    )!;
    expect(request.ownerAuthorized).toBe(false);
    expect(generationRequestOperation(f.state, request)).toEqual(original);
    if (stage === "generated") f.state.remote.runs.push(f.validation);
    expect(await runModelWriterPreparation(f.writerInput)).toMatchObject({
      status: "dispatched",
      runId: 900,
    });
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: original.key,
        requestRunId: 800,
        forceRegeneration: false,
      }),
    );
    expect(f.commit).toHaveBeenCalledTimes(2);
    expect(validateModelBudgetState(f.state.local.modelBudget)).toMatchObject({
      days: [{ requests: 4, tokens: 195000 }],
      tickets: [
        {
          operationKey: original.key,
          requestId: "generation-request-800:0",
          producer: { runId: 900 },
        },
        {
          operationKey: original.key,
          requestId: "generation-request-800:1",
          producer: { runId: 900 },
        },
      ],
    });
  },
);

test("a native Bot request for a currently publishable head spends no allowance", async () => {
  const f = await fixture();
  f.transaction.base_sha = String(f.state.local.revision);
  f.writeTransaction();
  expect(await runModelWriterPreparation(f.writerInput)).toEqual({
    status: "superseded",
  });
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(validateModelBudgetState(f.state.local.modelBudget).tickets).toEqual(
    [],
  );
});

async function publisherRecoveryFixture(
  stage: "generated" | "validated" = "validated",
) {
  const recovery = await fixture("project-submission", stage);
  const original = structuredClone(recovery.state.operations[0]);
  recovery.run.actor = { id: 2625904, type: "User" };
  recovery.run.display_title = "Project #42: Request review PR force=true";
  recovery.validation.conclusion = "failure";
  const refusal = {
    schema_version: 1 as const,
    operation: {
      ...original,
      nextEligibleAt: new Date(
        recovery.state.nowMs + 86400000,
      ).toISOString() as string | null,
      retry: {
        failure: {
          kind: "configuration" as const,
          reasonCode: "publisher-authentication-failed" as const,
        },
        transientAttempts: 2,
        immediateAttempts: 1,
      },
    },
    updatedAt: new Date(recovery.state.nowMs - 1000).toISOString(),
    completedAt: null,
  };
  recovery.state.receipts = [refusal];
  recovery.state.operations = discoverAutomationState(recovery.state);
  return { ...recovery, original, refusal };
}

async function failedCiPublisherRecoveryFixture() {
  const recovery = await publisherRecoveryFixture();
  const olderSuccess = {
    ...recovery.validation,
    conclusion: "success",
    actor: { id: 41898282, type: "Bot" },
    repository: { id: 1309605115, full_name: recovery.state.repository },
    head_repository: { id: 1309605115, full_name: recovery.state.repository },
  };
  const newerFailure: ProjectInventoryRun = {
    ...olderSuccess,
    id: 702,
    conclusion: "failure",
    actor: { id: 2625904, type: "User" },
    created_at: new Date(recovery.state.nowMs - 500).toISOString(),
    updated_at: new Date(recovery.state.nowMs - 100).toISOString(),
  };
  recovery.state.remote.runs = [olderSuccess, newerFailure];
  recovery.state.operations = discoverAutomationState(recovery.state);
  return { ...recovery, olderSuccess, newerFailure };
}

test("default owner preparation bridges actual newer failed CI and binds only its newly dispatched producer", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  expect(recovery.state.operations[0]).toMatchObject({
    stage: "generated",
    expectedSha: recovery.refusal.operation.expectedSha,
    retry: { failure: { kind: "unknown", reasonCode: "unclassified-failure" } },
  });
  const nativeRuns = structuredClone(recovery.state.remote.runs);
  const canonicalRefusal = structuredClone(recovery.refusal);
  const request = parseGenerationOwnerRequest(
    recovery.run,
    recovery.state.repository,
    recovery.state.publisherActorId,
  )!;
  expect(generationRequestPublisherRecovery(recovery.state, request)).toEqual(
    canonicalRefusal.operation,
  );
  expect(generationRequestOperation(recovery.state, request)).toEqual({
    ...canonicalRefusal.operation,
    nextEligibleAt: null,
  });
  recovery.dispatch.mockImplementation(async () => {
    recovery.state.remote.runs.push({
      ...recovery.run,
      id: 900,
      display_title: `Automation prepare ${recovery.original.key} request800`,
      actor: { id: recovery.state.publisherActorId, type: "Bot" },
      status: "in_progress",
      conclusion: null as never,
    });
    recovery.state.operations = discoverAutomationState(recovery.state);
    return { runId: 900, workflow: recovery.run.path };
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toMatchObject({
    status: "dispatched",
    runId: 900,
  });
  expect(recovery.commit).toHaveBeenCalledTimes(2);
  expect(
    validateModelBudgetState(recovery.state.local.modelBudget),
  ).toMatchObject({
    days: [{ requests: 4, tokens: 195000 }],
    tickets: [
      { producer: { runId: 900, workflow: recovery.run.path } },
      { producer: { runId: 900, workflow: recovery.run.path } },
    ],
  });
  expect(recovery.state.remote.runs.slice(0, 2)).toEqual(nativeRuns);
  expect(recovery.state.receipts).toEqual([canonicalRefusal]);
});

test("a bridged preflight failure preserves canonical history and blocks the older acknowledgement", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  expect(recovery.state.operations[0].stage).toBe("generated");
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      recovery.state.receipts = [receipt];
      recovery.state.operations = discoverAutomationState(recovery.state);
    });
  try {
    recovery.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN = "";
    await expect(
      runModelWriterPreparation({
        ...recovery.writerInput,
        persistFailure: undefined,
      }),
    ).rejects.toMatchObject({ code: "publisher-authentication-failed" });
    expect(recovery.state.receipts[0]).toMatchObject({
      operation: {
        stage: "validated",
        expectedSha: recovery.refusal.operation.expectedSha,
        retry: {
          failure: {
            kind: "configuration",
            reasonCode: "publisher-authentication-failed",
          },
          transientAttempts: 3,
          immediateAttempts: 1,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    });
    recovery.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN =
      "fixture-read-token";
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  } finally {
    persist.mockRestore();
  }
});

test("a bridged quota refusal preserves canonical history without reserving allowance", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      recovery.state.receipts = [receipt];
      recovery.state.operations = discoverAutomationState(recovery.state);
    });
  try {
    recovery.writerInput.env = {
      ...recovery.writerInput.env,
      TAVERNARY_MODEL_DAILY_TOKENS: "1",
    } as typeof recovery.writerInput.env;
    expect(
      await runModelWriterPreparation({
        ...recovery.writerInput,
        persistFailure: undefined,
      }),
    ).toEqual({ status: "waiting", reason: "daily-limit" });
    expect(recovery.state.receipts[0]).toMatchObject({
      operation: {
        stage: "validated",
        expectedSha: recovery.refusal.operation.expectedSha,
        retry: {
          failure: { kind: "configuration", reasonCode: "budget-exhausted" },
          transientAttempts: 3,
          immediateAttempts: 1,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    });
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
    expect(
      validateModelBudgetState(recovery.state.local.modelBudget).tickets,
    ).toEqual([]);
  } finally {
    persist.mockRestore();
  }
});

test.each([
  ["unknown", "unclassified-failure"],
  ["permanent", "validation-failed"],
  ["configuration", "provider-authentication-failed"],
] as const)(
  "fresh failure persistence cannot overwrite a newer %s refusal after CI history disappears",
  async (kind, reasonCode) => {
    const recovery = await failedCiPublisherRecoveryFixture();
    const newer = {
      ...structuredClone(recovery.refusal),
      operation: {
        ...recovery.refusal.operation,
        stage: "generated" as const,
        expectedSha: "e".repeat(40),
        retry: {
          failure: { kind, reasonCode },
          transientAttempts: 9,
          immediateAttempts: 3,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    };
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockImplementation(async () => {});
    let reads = 0;
    try {
      recovery.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN = "";
      await expect(
        runModelWriterPreparation({
          ...recovery.writerInput,
          persistFailure: undefined,
          load: async () => {
            reads += 1;
            if (reads === 3) {
              recovery.state.remote.runs = [];
              recovery.state.receipts = [newer];
              recovery.state.operations = discoverAutomationState(
                recovery.state,
              );
            }
            return recovery.state;
          },
        }),
      ).rejects.toMatchObject({ code: "publisher-authentication-failed" });
      expect(reads).toBe(3);
      expect(recovery.state.receipts).toEqual([newer]);
      expect(persist).not.toHaveBeenCalled();
      expect(recovery.commit).not.toHaveBeenCalled();
      expect(recovery.dispatch).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
    }
  },
);

test("failure persistence refuses a cross-stage canonical tuple when raw counters do not match discovery", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.state.operations[0].retry!.transientAttempts = 99;
  const request = parseGenerationOwnerRequest(
    recovery.run,
    recovery.state.repository,
    recovery.state.publisherActorId,
  )!;
  const persist = vi.fn();
  expect(
    await persistPreparedFailure({
      operationKey: recovery.original.key,
      generationRequest: request,
      isRequestAncestor: (ancestor, descendant) => ancestor === descendant,
      load: async () => recovery.state,
      persist,
      error: { code: "publisher-authentication-failed" },
    }),
  ).toEqual({ persisted: false, incident: false });
  expect(persist).not.toHaveBeenCalled();
});

test("a newer unknown receipt alone cannot fall through to owner-admitted preparation", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.state.receipts = [
    {
      ...structuredClone(recovery.refusal),
      operation: {
        ...recovery.refusal.operation,
        stage: "generated",
        retry: {
          failure: { kind: "unknown", reasonCode: "unclassified-failure" },
          transientAttempts: 7,
          immediateAttempts: 3,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    },
  ];
  recovery.state.operations = discoverAutomationState(recovery.state);
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test("a foreign canonical identity cannot authorize failed-CI owner preparation", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.refusal.operation.identity = {
    ...recovery.refusal.operation.identity,
    inputDigest: "e".repeat(64),
  };
  recovery.refusal.operation.key = operationKey(
    recovery.refusal.operation.identity,
  );
  recovery.state.operations = discoverAutomationState(recovery.state);
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test("a permanent CI diagnostic and sole permanent receipt never fall through to owner admission", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.newerFailure.failure = { diagnosticCode: "validation-failed" };
  recovery.state.receipts = [
    {
      ...structuredClone(recovery.refusal),
      operation: {
        ...recovery.refusal.operation,
        retry: {
          failure: { kind: "permanent", reasonCode: "validation-failed" },
          transientAttempts: 7,
          immediateAttempts: 3,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    },
  ];
  recovery.state.operations = discoverAutomationState(recovery.state);
  expect(recovery.state.operations[0]).toMatchObject({
    stage: "generated",
    retry: { failure: { kind: "permanent", reasonCode: "validation-failed" } },
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test("the preparation bridge preserves a diagnostic fact sharing a failed run identity", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.state.remote.runs.push({
    ...recovery.newerFailure,
    failure: { diagnosticCode: "validation-failed" },
  });
  recovery.state.operations = discoverAutomationState(recovery.state);
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test.each([
  "missing-success",
  "receipt-stage",
  "receipt-head",
  "receipt-created-time",
  "deadline-equal",
  "older-request",
  "future-request",
  "newer-refusal",
  "older-failure",
  "equal-failure-time",
  "future-failure",
  "noncanonical-failure-time",
  "reverse-failure-time",
  "active-ci",
  "foreign-ci-actor",
  "foreign-ci-repository",
  "foreign-ci-head-repository",
  "foreign-ci-repository-id",
  "permanent-diagnostic",
  "provider-diagnostic",
  "force-false",
  "bot-request",
  "active-producer",
  "active-worker",
  "active-writer",
  "different-raw-counters",
] as const)(
  "failed-CI owner preparation preserves the %s boundary",
  async (variant) => {
    const recovery = await failedCiPublisherRecoveryFixture();
    if (variant === "missing-success")
      recovery.state.remote.runs = [recovery.newerFailure];
    if (variant === "receipt-stage")
      recovery.refusal.operation.stage = "generated";
    if (variant === "receipt-head")
      recovery.refusal.operation.expectedSha = "e".repeat(40);
    if (variant === "receipt-created-time")
      recovery.refusal.operation.createdAt = new Date(
        recovery.state.nowMs - 2000,
      ).toISOString();
    if (variant === "deadline-equal")
      recovery.refusal.operation.nextEligibleAt = recovery.refusal.updatedAt;
    if (variant === "older-request")
      recovery.run.created_at = recovery.refusal.updatedAt;
    if (variant === "future-request")
      recovery.run.created_at = new Date(
        recovery.state.nowMs + 1000,
      ).toISOString();
    if (variant === "newer-refusal")
      recovery.refusal.updatedAt = new Date(recovery.state.nowMs).toISOString();
    if (variant === "older-failure") {
      recovery.newerFailure.created_at = new Date(
        recovery.state.nowMs - 2000,
      ).toISOString();
      recovery.newerFailure.updated_at = new Date(
        recovery.state.nowMs - 1500,
      ).toISOString();
    }
    if (variant === "equal-failure-time")
      recovery.newerFailure.created_at = recovery.refusal.updatedAt;
    if (variant === "future-failure") {
      recovery.newerFailure.created_at = new Date(
        recovery.state.nowMs + 1000,
      ).toISOString();
      recovery.newerFailure.updated_at = new Date(
        recovery.state.nowMs + 2000,
      ).toISOString();
    }
    if (variant === "noncanonical-failure-time")
      recovery.newerFailure.created_at = new Date(
        recovery.state.nowMs - 500,
      ).toUTCString();
    if (variant === "reverse-failure-time")
      recovery.newerFailure.updated_at = new Date(
        recovery.state.nowMs - 600,
      ).toISOString();
    if (variant === "active-ci") {
      recovery.newerFailure.status = "in_progress";
      recovery.newerFailure.conclusion = null;
    }
    if (variant === "foreign-ci-actor")
      recovery.newerFailure.actor = { id: 41898282, type: "Bot" };
    if (variant === "foreign-ci-repository")
      recovery.newerFailure.repository = {
        id: 1309605115,
        full_name: "Other/Tavernary",
      };
    if (variant === "foreign-ci-head-repository")
      recovery.newerFailure.head_repository = {
        id: 1309605115,
        full_name: "Other/Tavernary",
      };
    if (variant === "foreign-ci-repository-id")
      recovery.newerFailure.head_repository = {
        id: 7,
        full_name: recovery.state.repository,
      };
    if (variant === "permanent-diagnostic")
      recovery.newerFailure.failure = { diagnosticCode: "validation-failed" };
    if (variant === "provider-diagnostic")
      recovery.newerFailure.failure = {
        diagnosticCode: "provider-authentication-failed",
      };
    if (variant === "force-false" || variant === "bot-request")
      recovery.run.display_title = "Project #42: Request review PR force=false";
    if (variant === "bot-request")
      recovery.run.actor = { id: recovery.state.publisherActorId, type: "Bot" };
    if (
      ["active-producer", "active-worker", "active-writer"].includes(variant)
    ) {
      const workflow =
        variant === "active-worker"
          ? "automation-worker"
          : variant === "active-writer"
            ? "automation-writer"
            : "generate-project-submission";
      recovery.state.remote.runs.push({
        ...recovery.run,
        id: 901,
        path: `.github/workflows/${workflow}.yml`,
        display_title:
          variant === "active-worker"
            ? `Automation ${recovery.original.key}`
            : variant === "active-writer"
              ? `Automation write prepare ${recovery.original.key}`
              : `Automation prepare ${recovery.original.key} request799`,
        actor: { id: recovery.state.publisherActorId, type: "Bot" },
        status: "in_progress",
        conclusion: null,
      });
    }
    recovery.state.operations = discoverAutomationState(recovery.state);
    if (variant === "active-producer")
      expect(recovery.state.operations[0].workerRunId).toBeNull();
    if (variant === "different-raw-counters")
      recovery.state.operations[0].retry!.transientAttempts = 99;
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  },
);

test.each([
  ["unknown", "unclassified-failure"],
  ["permanent", "validation-failed"],
  ["configuration", "provider-authentication-failed"],
] as const)(
  "a newer sole %s receipt wins across stages and heads",
  async (kind, reasonCode) => {
    const recovery = await failedCiPublisherRecoveryFixture();
    recovery.newerFailure.failure = { diagnosticCode: reasonCode };
    recovery.state.receipts = [
      {
        ...structuredClone(recovery.refusal),
        operation: {
          ...recovery.refusal.operation,
          stage: "generated",
          expectedSha: "e".repeat(40),
          retry: {
            failure: { kind, reasonCode },
            transientAttempts: 9,
            immediateAttempts: 3,
          },
        },
        updatedAt: new Date(recovery.state.nowMs).toISOString(),
      },
    ];
    recovery.state.operations = discoverAutomationState(recovery.state);
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  },
);

test.each([
  ["unknown", "unclassified-failure"],
  ["permanent", "validation-failed"],
  ["configuration", "provider-authentication-failed"],
] as const)(
  "a newer canonical %s refusal remains authoritative without CI history",
  async (kind, reasonCode) => {
    const recovery = await failedCiPublisherRecoveryFixture();
    recovery.state.remote.runs = [];
    recovery.run.created_at = new Date(
      recovery.state.nowMs - 250,
    ).toISOString();
    recovery.state.receipts = [
      {
        ...structuredClone(recovery.refusal),
        operation: {
          ...recovery.refusal.operation,
          retry: {
            failure: { kind, reasonCode },
            transientAttempts: 9,
            immediateAttempts: 3,
          },
        },
        updatedAt: new Date(recovery.state.nowMs).toISOString(),
      },
    ];
    recovery.state.operations = discoverAutomationState(recovery.state);
    expect(recovery.state.operations[0]).toMatchObject({
      stage: "generated",
      retry: null,
    });
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  },
);

test("a failed-CI bridge cannot hide a foreign producer during its own binding", async () => {
  const recovery = await failedCiPublisherRecoveryFixture();
  recovery.dispatch.mockImplementation(async () => {
    recovery.state.remote.runs.push(
      ...[900, 901].map((runId) => ({
        ...recovery.run,
        id: runId,
        display_title: `Automation prepare ${recovery.original.key} request${runId === 900 ? 800 : 799}`,
        actor: { id: recovery.state.publisherActorId, type: "Bot" },
        status: "in_progress",
        conclusion: null,
      })),
    );
    recovery.state.operations = discoverAutomationState(recovery.state);
    expect(recovery.state.operations[0].workerRunId).toBeNull();
    return { runId: 900, workflow: recovery.run.path };
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).toHaveBeenCalledOnce();
  expect(
    validateModelBudgetState(recovery.state.local.modelBudget),
  ).toMatchObject({
    days: [{ requests: 4, tokens: 195000 }],
    tickets: [{ producer: null }, { producer: null }],
  });
});

test("same-stage generated Publisher refusal recovery retains its existing guarded path", async () => {
  const recovery = await publisherRecoveryFixture("generated");
  expect(recovery.state.operations[0]).toMatchObject({
    stage: "generated",
    retry: {
      failure: {
        kind: "configuration",
        reasonCode: "publisher-authentication-failed",
      },
    },
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toMatchObject({
    status: "dispatched",
    runId: 900,
  });
  expect(recovery.commit).toHaveBeenCalledTimes(2);
});

test.each(["counter-mismatch", "newer-unknown-refusal"] as const)(
  "expired same-stage Publisher recovery cannot bypass %s through ordinary merge eligibility",
  async (variant) => {
    const recovery = await publisherRecoveryFixture();
    recovery.validation.conclusion = "success";
    recovery.refusal.operation.nextEligibleAt = new Date(
      recovery.state.nowMs - 500,
    ).toISOString();
    if (variant === "newer-unknown-refusal") {
      recovery.state.receipts.push({
        ...structuredClone(recovery.refusal),
        operation: {
          ...recovery.refusal.operation,
          stage: "generated",
          retry: {
            failure: { kind: "unknown", reasonCode: "unclassified-failure" },
            transientAttempts: 9,
            immediateAttempts: 3,
          },
        },
        updatedAt: new Date(recovery.state.nowMs).toISOString(),
      });
    }
    recovery.state.operations = discoverAutomationState(recovery.state);
    if (variant === "counter-mismatch")
      recovery.state.operations[0].retry = {
        ...recovery.state.operations[0].retry!,
        transientAttempts: 99,
      };
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  },
);

test("a fresh owner Publisher recovery regenerates an unchanged head without requiring its failing old CI", async () => {
  const recovery = await publisherRecoveryFixture();
  const before = structuredClone(recovery.refusal);
  expect(await runModelWriterPreparation(recovery.writerInput)).toMatchObject({
    status: "dispatched",
    runId: 900,
  });
  expect(recovery.state.receipts).toEqual([before]);
  expect(
    validateModelBudgetState(recovery.state.local.modelBudget),
  ).toMatchObject({
    days: [{ requests: 4, tokens: 195000 }],
    tickets: [
      { operationKey: recovery.original.key },
      { operationKey: recovery.original.key },
    ],
  });
  expect(recovery.dispatch).toHaveBeenCalledWith(
    expect.objectContaining({
      operationKey: recovery.original.key,
      requestRunId: 800,
      forceRegeneration: true,
    }),
  );
});

test("owner recovery binds its reserved allowance when its own active producer becomes visible", async () => {
  const recovery = await publisherRecoveryFixture();
  recovery.dispatch.mockImplementation(async () => {
    recovery.state.remote.runs.push({
      ...recovery.run,
      id: 900,
      display_title: `Automation prepare ${recovery.original.key} request800`,
      actor: { id: recovery.state.publisherActorId, type: "Bot" },
      status: "in_progress",
      conclusion: null as never,
    });
    recovery.state.operations = discoverAutomationState(recovery.state);
    return { runId: 900, workflow: recovery.run.path };
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toMatchObject({
    status: "dispatched",
    runId: 900,
  });
  expect(recovery.commit).toHaveBeenCalledTimes(2);
  expect(
    validateModelBudgetState(recovery.state.local.modelBudget),
  ).toMatchObject({
    days: [{ requests: 4, tokens: 195000 }],
    tickets: [
      { producer: { runId: 900, workflow: recovery.run.path } },
      { producer: { runId: 900, workflow: recovery.run.path } },
    ],
  });
});

test("owner recovery never excludes a different active producer while binding its own allowance", async () => {
  const recovery = await publisherRecoveryFixture();
  recovery.dispatch.mockImplementation(async () => {
    recovery.state.remote.runs.push(
      ...[900, 901].map((runId) => ({
        ...recovery.run,
        id: runId,
        display_title: `Automation prepare ${recovery.original.key} request${runId === 900 ? 800 : 799}`,
        actor: { id: recovery.state.publisherActorId, type: "Bot" },
        status: "in_progress",
        conclusion: null,
      })),
    );
    recovery.state.operations = discoverAutomationState(recovery.state);
    return { runId: 900, workflow: recovery.run.path };
  });
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).toHaveBeenCalledOnce();
  expect(
    validateModelBudgetState(recovery.state.local.modelBudget),
  ).toMatchObject({
    days: [{ requests: 4, tokens: 195000 }],
    tickets: [{ producer: null }, { producer: null }],
  });
});

test("a Publisher refusal deadline preceding its receipt cannot authorize preparation", async () => {
  const recovery = await publisherRecoveryFixture();
  recovery.refusal.operation.nextEligibleAt = new Date(
    Date.parse(recovery.refusal.updatedAt) - 1000,
  ).toISOString();
  recovery.state.operations = discoverAutomationState(recovery.state);
  expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
    status: "superseded",
  });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test("owner recovery rechecks request ancestry before reserving model allowance", async () => {
  const recovery = await publisherRecoveryFixture();
  let reads = 0;
  expect(
    await runModelWriterPreparation({
      ...recovery.writerInput,
      isRequestAncestor: (_ancestor, descendant) =>
        descendant === recovery.run.head_sha,
      load: async () => {
        reads += 1;
        if (reads === 2) {
          recovery.state.local.revision = "e".repeat(40);
          recovery.state.remote.mainHeadSha = "e".repeat(40);
        }
        return recovery.state;
      },
    }),
  ).toEqual({ status: "superseded" });
  expect(recovery.commit).not.toHaveBeenCalled();
  expect(recovery.dispatch).not.toHaveBeenCalled();
});

test("a fresh owner can acknowledge a valid expired Publisher refusal without clearing its history", async () => {
  const recovery = await publisherRecoveryFixture();
  recovery.refusal.operation.nextEligibleAt = new Date(
    recovery.state.nowMs - 500,
  ).toISOString();
  recovery.state.operations = discoverAutomationState(recovery.state);
  const before = structuredClone(recovery.refusal);
  expect(await runModelWriterPreparation(recovery.writerInput)).toMatchObject({
    status: "dispatched",
    runId: 900,
  });
  expect(recovery.state.receipts).toEqual([before]);
});

test.each([
  "equal-deadline",
  "null-deadline",
  "older-request",
  "future-request",
  "newer-refusal",
  "different-counters",
  "different-stage",
  "different-head",
  "bot-request",
  "force-false",
  "provider-failure",
] as const)(
  "owner preparation preserves the %s refusal boundary",
  async (variant) => {
    const recovery = await publisherRecoveryFixture();
    if (variant === "equal-deadline")
      recovery.refusal.operation.nextEligibleAt = recovery.refusal.updatedAt;
    if (variant === "null-deadline")
      recovery.refusal.operation.nextEligibleAt = null;
    if (variant === "older-request")
      recovery.run.created_at = recovery.refusal.updatedAt;
    if (variant === "future-request")
      recovery.run.created_at = new Date(
        recovery.state.nowMs + 1000,
      ).toISOString();
    if (variant === "newer-refusal")
      recovery.refusal.updatedAt = new Date(recovery.state.nowMs).toISOString();
    if (variant === "different-stage")
      recovery.refusal.operation.stage = "generated";
    if (variant === "different-head")
      recovery.refusal.operation.expectedSha = "e".repeat(40);
    if (variant === "bot-request")
      recovery.run.actor = { id: recovery.state.publisherActorId, type: "Bot" };
    if (variant === "force-false" || variant === "bot-request")
      recovery.run.display_title = "Project #42: Request review PR force=false";
    if (variant === "provider-failure")
      recovery.refusal.operation.retry.failure.reasonCode =
        "provider-authentication-failed" as never;
    recovery.state.operations = discoverAutomationState(recovery.state);
    if (variant === "different-counters")
      recovery.state.operations[0].retry = {
        ...recovery.state.operations[0].retry!,
        transientAttempts: 99,
      };
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual(
      variant === "provider-failure"
        ? { status: "waiting", reason: "provider-circuit-open" }
        : { status: "superseded" },
    );
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
  },
);

test("a renewed Publisher refusal preserves the original head and counters and blocks the acknowledged request", async () => {
  const recovery = await publisherRecoveryFixture();
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      recovery.state.receipts = [receipt];
      recovery.state.operations = discoverAutomationState(recovery.state);
    });
  try {
    recovery.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN = "";
    await expect(
      runModelWriterPreparation({
        ...recovery.writerInput,
        persistFailure: undefined,
      }),
    ).rejects.toMatchObject({ code: "publisher-authentication-failed" });
    expect(recovery.state.receipts[0]).toMatchObject({
      operation: {
        key: recovery.original.key,
        stage: "validated",
        expectedSha: recovery.original.expectedSha,
        retry: {
          failure: {
            kind: "configuration",
            reasonCode: "publisher-authentication-failed",
          },
          transientAttempts: 3,
          immediateAttempts: 1,
        },
      },
      updatedAt: new Date(recovery.state.nowMs).toISOString(),
    });
    recovery.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN =
      "fixture-read-token";
    expect(await runModelWriterPreparation(recovery.writerInput)).toEqual({
      status: "superseded",
    });
    expect(recovery.commit).not.toHaveBeenCalled();
    expect(recovery.dispatch).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
  } finally {
    persist.mockRestore();
  }
});

test("missing publication-setting read custody rejects regeneration before any reservation", async () => {
  const f = await fixture();
  f.writerInput.env.TAVERNARY_PUBLICATION_SETTINGS_TOKEN = "";
  await expect(runModelWriterPreparation(f.writerInput)).rejects.toMatchObject({
    code: "publisher-authentication-failed",
  });
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(validateModelBudgetState(f.state.local.modelBudget).tickets).toEqual(
    [],
  );
  expect(
    f.writerInput.gh.mock.calls.every(
      ([args]) => !args.some((arg) => arg.includes("/actions/variables/")),
    ),
  ).toBe(true);
});

test.each([401, 403])(
  "publication read HTTP %s cannot reserve or dispatch model work",
  async (status) => {
    const f = await fixture();
    const original = f.writerInput.gh.getMockImplementation()!;
    f.writerInput.gh.mockImplementation((args) => {
      if (args.some((arg) => arg.includes("/actions/variables/")))
        throw Object.assign(
          new Error(`GitHub setting read failed (HTTP ${status})`),
          { status },
        );
      return original(args);
    });
    await expect(
      runModelWriterPreparation(f.writerInput),
    ).rejects.toMatchObject({
      code: "publisher-authentication-failed",
      status,
    });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(validateModelBudgetState(f.state.local.modelBudget).tickets).toEqual(
      [],
    );
    expect(f.writerInput.persistFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: "publisher-authentication-failed" }),
    );
  },
);

test.each([
  "manual",
  "foreign",
  "malformed",
  "closed",
  "merged",
  "active",
  "permanent",
] as const)(
  "a native Bot regeneration request preserves %s custody denial",
  async (variant) => {
    const f = await fixture();
    const operation = f.state.operations[0];
    if (variant === "manual") {
      f.transaction.publication_mode = "manual";
      f.writeTransaction();
    }
    if (variant === "foreign") f.p.pulls[0].user.id++;
    if (variant === "malformed") f.p.pulls[0].body = "No transaction";
    if (variant === "closed") f.p.issues[0].state = "closed";
    if (variant === "merged") {
      f.p.pulls[0].state = "closed";
      f.p.pulls[0].merged_at = new Date(f.state.nowMs - 1000).toISOString();
      f.p.pulls[0].merge_commit_sha = "e".repeat(40);
    }
    if (variant === "active")
      f.state.remote.runs.push({
        ...f.run,
        id: 900,
        display_title: `Automation prepare ${operation.key} request799`,
        status: "in_progress",
        conclusion: null,
      });
    if (variant === "permanent")
      f.state.receipts.push({
        schema_version: 1,
        operation: {
          ...operation,
          retry: {
            failure: { kind: "permanent", reasonCode: "authorization-lost" },
            transientAttempts: 0,
            immediateAttempts: 0,
          },
        },
        updatedAt: new Date(f.state.nowMs - 1000).toISOString(),
        completedAt: null,
      });
    const write = vi.fn();
    expect(
      await runPreparationRequestCli({
        env: f.env,
        event: { inputs: { issue_number: "42" } },
        load: async () => f.state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0])).toEqual({ action: "wait" });
    expect(await runModelWriterPreparation(f.writerInput)).toEqual({
      status: "superseded",
    });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(validateModelBudgetState(f.state.local.modelBudget).tickets).toEqual(
      [],
    );
  },
);

test.each(["paused", "retry", "authority", "fresh-head"] as const)(
  "a fresh %s publication plan prevents Bot regeneration allowance",
  async (variant) => {
    const f = await fixture();
    f.transaction.base_sha = String(f.state.local.revision);
    f.writeTransaction();
    const original = f.writerInput.gh.getMockImplementation()!;
    f.writerInput.gh.mockImplementation((args) => {
      if (
        variant === "paused" &&
        args.some((arg) => arg.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      )
        return Promise.resolve(JSON.stringify({ value: "false" }));
      if (
        variant === "authority" &&
        args.some((arg) => arg.endsWith("/issues/42"))
      )
        return Promise.resolve(
          JSON.stringify({
            ...f.p.issues[0],
            user: { ...f.p.issues[0].user, id: 123 },
          }),
        );
      if (args.some((arg) => arg.endsWith("/pulls/84"))) {
        if (variant === "retry")
          return Promise.resolve(
            JSON.stringify({ ...f.p.pulls[0], mergeable: null }),
          );
        if (variant === "fresh-head")
          return Promise.resolve(
            JSON.stringify({
              ...f.p.pulls[0],
              head: { ...f.p.pulls[0].head, sha: "e".repeat(40) },
            }),
          );
      }
      return original(args);
    });
    expect(await runModelWriterPreparation(f.writerInput)).toEqual({
      status: "superseded",
    });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(validateModelBudgetState(f.state.local.modelBudget).tickets).toEqual(
      [],
    );
  },
);

test.each(["merge", "reject"] as const)(
  "a publication plan becoming %s after dispatch prevents binding and retains its charge",
  async (action) => {
    const f = await fixture();
    f.dispatch.mockImplementation(async () => {
      if (action === "merge") {
        f.transaction.base_sha = String(f.state.local.revision);
        f.writeTransaction();
      } else f.p.issues[0].labels.push("submission-declined");
      return { runId: 900, workflow: f.run.path };
    });
    expect(await runModelWriterPreparation(f.writerInput)).toEqual({
      status: "superseded",
    });
    expect(f.dispatch).toHaveBeenCalledOnce();
    expect(f.commit).toHaveBeenCalledOnce();
    expect(validateModelBudgetState(f.state.local.modelBudget)).toMatchObject({
      days: [{ requests: 4, tokens: 195000 }],
      tickets: [{ producer: null }, { producer: null }],
    });
  },
);

test("a Bot request retains a matching budget refusal and cannot remove its existing branch", async () => {
  const f = await fixture();
  const operation = f.state.operations[0];
  f.state.receipts.push({
    schema_version: 1,
    operation: {
      ...operation,
      retry: {
        failure: { kind: "configuration", reasonCode: "budget-exhausted" },
        transientAttempts: 2,
        immediateAttempts: 0,
      },
      nextEligibleAt: new Date(f.state.nowMs + 86400000).toISOString(),
    },
    updatedAt: new Date(f.state.nowMs - 1000).toISOString(),
    completedAt: null,
  });
  const request = parseGenerationOwnerRequest(
    f.run,
    f.state.repository,
    f.state.publisherActorId,
  )!;
  const current = generationRequestOperation(f.state, request);
  expect(current).toMatchObject({
    stage: "validated",
    expectedSha: operation.expectedSha,
    retry: { transientAttempts: 2 },
    nextEligibleAt: f.state.receipts[0].operation.nextEligibleAt,
  });
  expect(await runModelWriterPreparation(f.writerInput)).toEqual({
    status: "superseded",
  });
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.state.remote.pulls).toHaveLength(1);
  f.run.display_title = "Project #42: Request review PR force=true";
  expect(
    parseGenerationOwnerRequest(
      f.run,
      f.state.repository,
      f.state.publisherActorId,
    ),
  ).toBeNull();
});
