import { execFileSync } from "node:child_process";
import { expect, test, vi } from "vitest";
import {
  metadataMaintenanceFixture,
  projectInventoryFixture,
} from "../helpers/automation-fixtures";
import { discoverAutomationState } from "../../scripts/automation/inventory.mjs";
import {
  generationRequestOperation,
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
