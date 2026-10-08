import { expect, test, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import { planPreparationRequest } from "../../scripts/automation/preparation-request.mjs";
import {
  dispatchReservedModelPreparation,
  createProducerBudgetLoader,
} from "../../scripts/automation/model-budget-github.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
  bindModelBudgetTicket,
  validateModelBudgetState,
} from "../../scripts/automation/model-budget.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";
import {
  metadataMaintenanceFixture,
  operationFixture,
  projectInventoryFixture,
} from "../helpers/automation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import { preserveCatalogSummary } from "../../scripts/catalog/catalog-copy-preservation.mjs";
import { zipSync, strToU8 } from "fflate";
import { createHash } from "node:crypto";
import * as writer from "../../scripts/automation/writer-runtime.mjs";
import * as budgets from "../../scripts/automation/model-budget-github.mjs";
import * as requests from "../../scripts/automation/preparation-request.mjs";
import * as enrichmentAuthority from "../../scripts/automation/enrichment-owner-request.mjs";
import * as canonical from "../../scripts/automation/canonical-data.mjs";
import * as githubInventory from "../../scripts/automation/github-inventory.mjs";

test("native owner request history searches old open issues beyond GitHub's result cap without unbounded pagination", async () => {
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  const request = ownerGenerationRequest();
  const gh = vi.fn(async (args: string[]) => {
    expect(args).not.toContain("--paginate");
    const wide = args.some((arg) =>
      arg.includes("2026-09-01T00:00:00.000Z..2026-10-08T12:00:00.000Z"),
    );
    const relevant = args[3].includes("owner-request");
    return JSON.stringify([
      {
        total_count: relevant && wide ? 1001 : relevant ? 1 : 0,
        workflow_runs: relevant ? [request] : [],
      },
    ]);
  });
  const runs = await githubInventory.loadGenerationOwnerRequestRuns({
    gh,
    repository: "MentallyQuill/Tavernary",
    issues: [
      {
        number: 42,
        state: "open",
        labels: ["project-owner-request"],
        created_at: "2026-09-01T00:00:00Z",
      },
    ] as never,
    nowMs,
  });
  expect(runs.map((run) => run.id)).toEqual([400]);
  expect(gh).toHaveBeenCalledTimes(4);
});

test("native owner request history stops before following excessive pages and isolates closed issue history", async () => {
  const gh = vi.fn(async () => {
    throw new Error("Unexpected request");
  });
  expect(
    await githubInventory.loadGenerationOwnerRequestRuns({
      gh,
      repository: "MentallyQuill/Tavernary",
      issues: [
        {
          number: 42,
          state: "closed",
          labels: ["project-owner-request"],
          created_at: "2000-01-01T00:00:00Z",
        },
      ] as never,
      nowMs: Date.parse("2026-10-08T12:00:00Z"),
    }),
  ).toEqual([]);
  expect(gh).not.toHaveBeenCalled();
});

test("the actual scheduled writer reserves and binds a missed manual owner generation request", async () => {
  const p = projectInventoryFixture({
    producer: "project-owner-request",
    publicationMode: "manual",
    generatedPull: {},
    generationRun: null,
  });
  const f = await metadataMaintenanceFixture();
  Object.assign(f.state, {
    publisherActorId: p.publisherActorId,
    operations: [],
  });
  Object.assign(f.state.remote, { issues: p.issues, pulls: p.pulls, runs: [] });
  const run = ownerGenerationRequest();
  const commit = vi
    .spyOn(canonical, "commitCanonicalData")
    .mockImplementation(async (input) => {
      f.state.local.modelBudget = JSON.parse(input.files[0].content);
      return { sha: input.expectedMainSha };
    });
  const dispatch = vi
    .spyOn(budgets, "dispatchReservedModelPreparation")
    .mockResolvedValue({ runId: 700, workflow: run.path });
  const ancestor = vi
    .spyOn(enrichmentAuthority, "enrichmentRequestAncestor")
    .mockReturnValue(true);
  const gh = vi.fn(async (args: string[]) => {
    if (args[1]?.endsWith("actions/runs/400")) return JSON.stringify(run);
    const relevant = args.some((arg) =>
      arg.includes("generate-project-owner-request.yml/runs"),
    );
    const value = {
      total_count: relevant ? 1 : 0,
      workflow_runs: relevant ? [run] : [],
    };
    return JSON.stringify(args.includes("--jq") ? [value] : value);
  });
  try {
    const result = await writer.runAutomationWriterReconciliation({
      load: async () => f.state,
      gh,
      env: {
        GITHUB_REPOSITORY: f.state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        GITHUB_RUN_ID: "810",
        GITHUB_RUN_ATTEMPT: "1",
        TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
        UTILITY_MODEL: "primary",
      },
    });
    expect(result.generationRequests).toMatchObject({
      status: "dispatched",
      slots: 1,
    });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ requestRunId: 400, forceRegeneration: true }),
    );
    expect(
      validateModelBudgetState(f.state.local.modelBudget).tickets[0].producer
        ?.runId,
    ).toBe(700);
    expect(f.state.operations).toEqual([]);
  } finally {
    commit.mockRestore();
    dispatch.mockRestore();
    ancestor.mockRestore();
  }
});

function ownerGenerationRequest(
  workflow = ".github/workflows/generate-project-owner-request.yml",
) {
  return {
    id: 400,
    path: workflow,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "b".repeat(40),
    repository: { id: 1309605115, full_name: "MentallyQuill/Tavernary" },
    head_repository: { id: 1309605115, full_name: "MentallyQuill/Tavernary" },
    actor: { id: 2625904, type: "User" },
    run_attempt: 1,
    display_title: `${workflow.includes("owner-request") ? "Owner request" : "Project"} #42: Request review PR force=true`,
    status: "completed",
    conclusion: "success",
    created_at: "2026-10-01T12:00:00Z",
  };
}

test("scheduled recovery finds an owner request older than the recent run inventory and uses one slot", async () => {
  const p = projectInventoryFixture({
    producer: "project-owner-request",
    publicationMode: "manual",
    generatedPull: {},
    generationRun: null,
  });
  const f = await metadataMaintenanceFixture();
  Object.assign(f.state, {
    publisherActorId: p.publisherActorId,
    operations: [],
  });
  Object.assign(f.state.remote, { issues: p.issues, pulls: p.pulls, runs: [] });
  const run = ownerGenerationRequest();
  p.issues[0].created_at = "2026-09-01T00:00:00Z";
  const gh = vi.fn(async (args: string[]) =>
    JSON.stringify([
      {
        total_count: args.some((arg) => arg.includes("owner-request")) ? 2 : 0,
        workflow_runs: args.some((arg) => arg.includes("owner-request"))
          ? [run, { ...run, id: 399 }]
          : [],
      },
    ]),
  );
  const prepare = vi.fn(async () => ({ status: "dispatched", runId: 700 }));
  expect(
    await writer.reconcileGenerationOwnerRequests({
      state: f.state,
      gh,
      prepare,
      isAncestor: () => true,
      limit: 1,
    }),
  ).toMatchObject({
    slots: 1,
    consumedKeys: [expect.any(String)],
    status: "dispatched",
  });
  expect(prepare).toHaveBeenCalledOnce();
  expect(prepare).toHaveBeenCalledWith({ requestRunId: 400 });
  expect(
    gh.mock.calls.some(([args]) =>
      args.some((arg) => arg.startsWith("created=2026-09-01")),
    ),
  ).toBe(true);
});

test.each(["closed", "active", "backoff", "ancestor", "exhausted"])(
  "scheduled owner generation recovery preserves %s waits",
  async (variant) => {
    const p = projectInventoryFixture({
      producer: "project-owner-request",
      publicationMode: "manual",
      generatedPull: {},
      generationRun: null,
    });
    const f = await metadataMaintenanceFixture();
    Object.assign(f.state, {
      publisherActorId: p.publisherActorId,
      operations: [],
    });
    Object.assign(f.state.remote, {
      issues: p.issues,
      pulls: p.pulls,
      runs: [],
    });
    const run = ownerGenerationRequest();
    const request = requests.parseGenerationOwnerRequest(
      run,
      f.state.repository,
      f.state.publisherActorId,
    )!;
    const operation = requests.generationRequestOperation(f.state, request)!;
    if (variant === "closed") p.issues[0].state = "closed";
    if (variant === "active")
      f.state.remote.runs.push({
        ...run,
        id: 700,
        actor: { id: p.publisherActorId, type: "Bot" },
        display_title: `Automation prepare ${operation.key} request400`,
        status: "in_progress",
        conclusion: null,
      } as never);
    if (variant === "backoff")
      f.state.receipts.push({
        schema_version: 1,
        operation: {
          ...operation,
          nextEligibleAt: new Date(f.state.nowMs + 86400000).toISOString(),
          retry: {
            transientAttempts: 1,
            immediateAttempts: 0,
            failure: { kind: "transient", reasonCode: "provider-unavailable" },
          },
        },
        updatedAt: new Date(f.state.nowMs).toISOString(),
        completedAt: null,
      });
    const gh = vi.fn(async (args: string[]) =>
      JSON.stringify([
        {
          total_count: args.some((arg) => arg.includes("owner-request"))
            ? 1
            : 0,
          workflow_runs: args.some((arg) => arg.includes("owner-request"))
            ? [run]
            : [],
        },
      ]),
    );
    const prepare = vi.fn(async () => ({ status: "dispatched", runId: 700 }));
    expect(
      await writer.reconcileGenerationOwnerRequests({
        state: f.state,
        gh,
        prepare,
        isAncestor: () => variant !== "ancestor",
        limit: variant === "exhausted" ? 0 : 1,
      }),
    ).toMatchObject({ slots: 0, consumedKeys: [] });
    expect(prepare).not.toHaveBeenCalled();
  },
);

test.each([
  "generate-project-submission.yml",
  "generate-project-owner-request.yml",
])(
  "%s carries verified requests into pinned generation and retains a native completion link",
  (name) => {
    const workflow = parse(readFileSync(`.github/workflows/${name}`, "utf8"));
    expect(workflow.on.workflow_dispatch.inputs.request_run_id.type).toBe(
      "number",
    );
    expect(workflow["run-name"]).toContain("request{1}");
    expect(workflow["run-name"]).toContain("force={1}");
    expect(workflow.jobs.request.steps.at(-1).run).toContain(
      'result_run_id="$GITHUB_RUN_ID"',
    );
    expect(
      workflow.jobs.generate.steps.filter((step: { uses?: string }) =>
        step.uses?.startsWith("actions/checkout@"),
      )[0].with.ref,
    ).toBe("${{ github.sha }}");
    expect(JSON.stringify(workflow.jobs.generate.steps)).toContain(
      "tavernary-generation-request:",
    );
    expect(JSON.stringify(workflow.jobs.generate.steps)).toContain(
      "git diff --quiet",
    );
  },
);

test.each([
  "valid",
  "actor",
  "request",
  "failure",
  "origin",
  "key",
  "duplicate",
  "ancestor",
])(
  "owner generation completion requires actual native %s proof",
  async (variant) => {
    const p = projectInventoryFixture({
      producer: "project-owner-request",
      publicationMode: "manual",
      generatedPull: {},
    });
    const f = await metadataMaintenanceFixture();
    Object.assign(f.state, { publisherActorId: p.publisherActorId });
    Object.assign(f.state.remote, { issues: p.issues, pulls: p.pulls });
    const request = requests.parseGenerationOwnerRequest(
      ownerGenerationRequest(),
      f.state.repository,
      f.state.publisherActorId,
    )!;
    const key = "a".repeat(64),
      marker = `<!-- tavernary-generation-request:400:700:${key} -->`;
    p.pulls[0].body += "\n" + marker;
    const run = {
      ...ownerGenerationRequest(),
      id: 700,
      actor: { id: p.publisherActorId, type: "Bot" },
      display_title: `Automation prepare ${key} request400`,
    };
    if (variant === "actor") run.actor.id++;
    if (variant === "request")
      run.display_title = `Automation prepare ${key} request401`;
    if (variant === "failure") run.conclusion = "failure";
    if (variant === "origin") run.head_repository.id++;
    if (variant === "key")
      run.display_title = `Automation prepare ${"b".repeat(64)} request400`;
    if (variant === "duplicate") p.pulls[0].body += "\n" + marker;
    expect(
      await requests.generationRequestCompleted({
        state: f.state,
        request,
        gh: vi.fn(async () => JSON.stringify(run)),
        isAncestor: () => variant !== "ancestor",
      }),
    ).toBe(variant === "valid");
  },
);

test.each(["actor", "branch", "repository", "workflow", "attempt"])(
  "native generation request %s custody cannot grant force",
  (variant) => {
    const run = ownerGenerationRequest();
    if (variant === "actor") run.actor.id = 1;
    if (variant === "branch") run.head_branch = "other";
    if (variant === "repository") run.head_repository.id++;
    if (variant === "workflow") run.path = ".github/workflows/other.yml";
    if (variant === "attempt") run.run_attempt = 2;
    expect(
      requests.parseGenerationOwnerRequest(
        run,
        "MentallyQuill/Tavernary",
        41982982,
      ),
    ).toBeNull();
  },
);

test.each(["project-submission", "project-owner-request"] as const)(
  "an explicit owner can regenerate an existing manual %s PR with reserved allowance",
  async (producer) => {
    const p = projectInventoryFixture({
      producer,
      publicationMode: "manual",
      generatedPull: {},
      generationRun: null,
    });
    expect(discoverProjectOperations(p)).toEqual([]);
    const f = await metadataMaintenanceFixture();
    Object.assign(f.state, {
      publisherActorId: p.publisherActorId,
      operations: [],
    });
    Object.assign(f.state.remote, {
      issues: p.issues,
      pulls: p.pulls,
      runs: p.runs,
    });
    Object.assign(f.state.local, {
      projects: p.catalog.projects,
      sources: p.catalog.sources,
      modelBudget: createModelBudgetState(f.state.nowMs),
    });
    const run = ownerGenerationRequest(
      `.github/workflows/generate-${producer}.yml`,
    );
    const parsed = requests.parseGenerationOwnerRequest(
      run,
      f.state.repository,
      f.state.publisherActorId,
    );
    expect(parsed).toMatchObject({
      issueNumber: 42,
      forceRegeneration: true,
      ownerAuthorized: true,
    });
    const operation = requests.generationRequestOperation(f.state, parsed!);
    expect(operation?.stage).toBe("admitted");
    const commit = vi.fn(
      async (input: { files: Array<{ content: string }> }) => {
        f.state.local.modelBudget = JSON.parse(input.files[0].content);
        return { sha: String(f.state.local.revision) };
      },
    );
    const dispatch = vi.fn(async () => {
      p.runs.push({
        id: 700,
        path: run.path,
        event: "workflow_dispatch",
        head_branch: "main",
        display_title: `Automation prepare ${operation!.key} request400`,
        actor: { id: p.publisherActorId, type: "Bot" },
        status: "in_progress",
        conclusion: null,
        created_at: new Date(f.state.nowMs).toISOString(),
      });
      return { runId: 700, workflow: run.path };
    });
    const env = {
      GITHUB_REPOSITORY: f.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "810",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
      UTILITY_MODEL: "primary",
    };
    expect(
      await runModelWriterPreparation({
        operationKey: operation!.key,
        requestRunId: 400,
        env,
        gh: vi.fn(async () => JSON.stringify(run)),
        load: async () => f.state,
        commit,
        dispatch,
        isRequestAncestor: () => true,
        persistFailure: vi.fn(async () => {}),
      }),
    ).toMatchObject({ status: "dispatched", runId: 700 });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        forceRegeneration: true,
        requestRunId: 400,
        issueNumber: 42,
      }),
    );
    expect(
      validateModelBudgetState(f.state.local.modelBudget).tickets[0],
    ).toMatchObject({
      requestId: "generation-request-400:0",
      producer: { runId: 700, workflow: run.path },
    });
  },
);
import { loadOwnerGenerationCheckpoint } from "../../scripts/help/generate-project-owner-request.mjs";

test("an interrupted owner producer recovers its authenticated single-file checkpoint", async () => {
  const f = await generationSettlementFixture();
  const checkpoint = {
    schema_version: 1,
    entries: [
      {
        project_id: "owner-alpha",
        field: "automatic",
        input_digest: "e".repeat(64),
        output: { tags: [] },
      },
    ],
  };
  const archive = zipSync({
    "owner-generation-checkpoint.json": strToU8(JSON.stringify(checkpoint)),
  });
  const gh = async (args: string[]) => {
    const value = JSON.parse(await f.input.gh(args));
    if (Array.isArray(value))
      Object.assign(value[0].artifacts[0], {
        name: `automation-generation-checkpoint-${f.operation.key}-700`,
        digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
        size_in_bytes: archive.length,
      });
    return JSON.stringify(value);
  };
  expect(
    await loadOwnerGenerationCheckpoint({
      gh,
      download: async () => archive,
      repository: f.f.state.repository,
      operationKey: f.operation.key,
      publisherActorId: f.f.state.publisherActorId,
      runIds: [700],
    }),
  ).toEqual(checkpoint);
});

test("generation recovery reserves at most four of the twenty writer slots, including unavailable evidence", async () => {
  const f = await metadataMaintenanceFixture();
  let budget = createModelBudgetState(f.state.nowMs);
  f.state.operations = [];
  for (let issue = 1; issue <= 21; issue++) {
    const operation = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "project",
        subject: `issue:${issue}`,
      },
    });
    operation.key = operationKey(operation.identity);
    f.state.operations.push(operation);
    const reserved = reserveModelBudget(
      budget,
      {
        operationKey: operation.key,
        model: "primary",
        requestCount: 1,
        requestedTokens: 1000,
      },
      { nowMs: f.state.nowMs },
    );
    if (!reserved.allowed) throw new Error("Fixture quota unavailable");
    budget = bindModelBudgetTicket(reserved.state, reserved.ticket.id, {
      runId: issue,
      workflow: ".github/workflows/generate-project-submission.yml",
    });
  }
  f.state.local.modelBudget = budget;
  const settle = vi.fn(async () => ({ status: "waiting" as const }));
  expect(
    await writer.reconcileGenerationModelUsage({
      state: f.state,
      limit: 20,
      settle,
    }),
  ).toMatchObject({ slots: 4, consumedKeys: [], failures: 0 });
  expect(settle).toHaveBeenCalledTimes(4);
});

test("a generated manual-review PR can settle its ticket after leaving the automatic inventory, preserving later unrelated reservations", async () => {
  const f = await generationSettlementFixture();
  f.f.state.operations = [];
  const pending = vi.fn(async () => ({ status: "waiting" }));
  expect(
    await writer.reconcileGenerationModelUsage({
      state: f.f.state,
      settle: pending,
    }),
  ).toMatchObject({ slots: 1 });
  expect(pending).toHaveBeenCalledOnce();
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    const settled = JSON.parse(input.files[0].content);
    const later = reserveModelBudget(
      settled,
      {
        operationKey: "f".repeat(64),
        model: "primary",
        requestCount: 1,
        requestedTokens: 1000,
      },
      { nowMs: f.f.state.nowMs },
    );
    if (!later.allowed)
      throw new Error("Fixture later reservation unavailable");
    f.f.state.local.modelBudget = later.state;
    throw new Error("Commit response lost");
  });
  expect(
    await writer.runGenerationModelWriterSettlement({ ...f.input, commit }),
  ).toMatchObject({ status: "recovered" });
  expect(
    validateModelBudgetState(f.f.state.local.modelBudget).tickets,
  ).toHaveLength(2);
  const settle = vi.fn(async () => ({ status: "settled" }));
  expect(
    await writer.reconcileGenerationModelUsage({ state: f.f.state, settle }),
  ).toMatchObject({ slots: 0 });
  expect(settle).not.toHaveBeenCalled();
});

test("a failing generation retains only bounded ticket usage and preserves its original error", async () => {
  const usage = [
    { ticketId: "d".repeat(64), usage: { requests: 2, tokens: 15000 } },
  ];
  const load = vi.fn(async () => ({ beforeRequest: vi.fn() }));
  const write = vi.fn<
    (path: string, content: string, options: { flag: "wx" }) => Promise<void>
  >(async () => {});
  const failure = new Error("Generation interrupted");
  await expect(
    budgets.runGenerationWithBudgetEvidence({
      generate: async () => {
        throw failure;
      },
      loader: { load, usage: () => usage },
      env: {
        RUNNER_TEMP: "fixture-temp",
        GITHUB_RUN_ID: "700",
        GITHUB_SHA: "b".repeat(40),
        GITHUB_WORKFLOW_REF:
          "Owner/Repo/.github/workflows/generate-project-owner-request.yml@refs/heads/main",
        GITHUB_EVENT_PATH: "fixture-event",
      },
      read: async () =>
        JSON.stringify({ inputs: { operation_key: "a".repeat(64) } }),
      write,
    }),
  ).rejects.toBe(failure);
  expect(write).toHaveBeenCalledOnce();
  const value = JSON.parse(String(write.mock.calls[0][1]));
  expect(value).toEqual({
    schema_version: 1,
    operationKey: "a".repeat(64),
    producer: {
      runId: 700,
      sourceSha: "b".repeat(40),
      workflow: ".github/workflows/generate-project-owner-request.yml",
    },
    modelUsage: usage,
  });
  expect(write.mock.calls[0][2]).toEqual({ flag: "wx" });
});

async function generationSettlementFixture() {
  const f = await metadataMaintenanceFixture();
  const operation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "owner-request",
      subject: "issue:42",
    },
    stage: "generated",
    expectedSha: "c".repeat(40),
  });
  operation.key = operationKey(operation.identity);
  f.state.operations = [operation];
  const workflow = ".github/workflows/generate-project-owner-request.yml";
  const reserved = reserveModelBudget(
    createModelBudgetState(f.state.nowMs),
    {
      operationKey: operation.key,
      model: "primary",
      requestCount: 3,
      requestedTokens: 180000,
    },
    { nowMs: f.state.nowMs },
  );
  if (!reserved.allowed) throw new Error("Fixture allowance unavailable");
  f.state.local.modelBudget = bindModelBudgetTicket(
    reserved.state,
    reserved.ticket.id,
    { runId: 700, workflow },
  );
  const run = {
    id: 700,
    path: workflow,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "b".repeat(40),
    repository: { id: 42 },
    head_repository: { id: 42, full_name: f.state.repository },
    actor: { id: f.state.publisherActorId, type: "Bot" },
    run_attempt: 1,
    display_title: `Automation prepare ${operation.key}`,
    status: "completed",
    conclusion: "failure",
  };
  const value = {
    schema_version: 1,
    operationKey: operation.key,
    producer: { runId: run.id, workflow, sourceSha: run.head_sha },
    modelUsage: [
      { ticketId: reserved.ticket.id, usage: { requests: 2, tokens: 15000 } },
    ],
  };
  let archive: Uint8Array, artifact: Record<string, unknown>;
  const pack = () => {
    archive = zipSync({
      "automation-generation-model-usage.json": strToU8(JSON.stringify(value)),
    });
    artifact = {
      id: 501,
      name: `automation-generation-${operation.key}-${run.id}`,
      expired: false,
      size_in_bytes: archive.length,
      digest: `sha256:${createHash("sha256").update(archive).digest("hex")}`,
      workflow_run: {
        id: run.id,
        repository_id: 42,
        head_repository_id: 42,
        head_branch: "main",
        head_sha: run.head_sha,
      },
    };
  };
  pack();
  const env = {
    GITHUB_REPOSITORY: f.state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
  };
  const gh = vi.fn(async (args: string[]) =>
    args.some((value) => value.endsWith("/artifacts"))
      ? JSON.stringify([{ total_count: 1, artifacts: [artifact] }])
      : JSON.stringify(run),
  );
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    f.state.local.modelBudget = JSON.parse(input.files[0].content);
    throw new Error("Commit response lost");
  });
  return {
    f,
    operation,
    run,
    value,
    pack,
    commit,
    input: {
      operationKey: operation.key,
      env,
      gh,
      load: async () => f.state,
      download: async () => archive,
      commit,
    },
  };
}

test("native generation accounting reads a pinned budget snapshot without loading issue, pull or catalog history", async () => {
  const f = await generationSettlementFixture();
  const sha = String(f.f.state.local.revision);
  const gh = vi.fn(async (args: string[]) => {
    if (args.some((arg) => arg.endsWith("/git/ref/heads/main")))
      return JSON.stringify({ object: { sha } });
    if (
      args.some((arg) =>
        arg.includes(
          "/contents/data/maintenance/automation/model-budgets/global.json",
        ),
      )
    ) {
      expect(args).toContain(
        `repos/${f.f.state.repository}/contents/data/maintenance/automation/model-budgets/global.json?ref=${sha}`,
      );
      return JSON.stringify(f.f.state.local.modelBudget);
    }
    return f.input.gh(args);
  });
  expect(
    await writer.runGenerationModelWriterSettlement({
      operationKey: f.operation.key,
      env: f.input.env,
      gh,
      download: f.input.download,
      commit: f.commit,
    }),
  ).toMatchObject({ status: "recovered" });
  expect(gh.mock.calls.flat(2).join(" ")).not.toMatch(
    /\/issues|\/pulls|workflow_runs|git fetch/u,
  );
});

test("an interrupted native generator settles completed calls once despite a lost commit response, without refunding unused allowance", async () => {
  const f = await generationSettlementFixture();
  expect(
    await writer.runGenerationModelWriterSettlement(f.input),
  ).toMatchObject({ status: "recovered" });
  expect(
    await writer.runGenerationModelWriterSettlement(f.input),
  ).toMatchObject({ status: "idle" });
  expect(f.commit).toHaveBeenCalledOnce();
  expect(validateModelBudgetState(f.f.state.local.modelBudget)).toMatchObject({
    tickets: [{ settled: true, usage: { requests: 2, tokens: 15000 } }],
    days: [{ requests: 3, tokens: 180000 }],
  });
});

test.each(["actor", "attempt", "sha", "ticket", "extra"])(
  "generation usage with changed %s cannot settle a reservation",
  async (variant) => {
    const f = await generationSettlementFixture();
    if (variant === "actor") f.run.actor.id++;
    if (variant === "attempt") f.run.run_attempt = 2;
    if (variant === "sha") f.value.producer.sourceSha = "e".repeat(40);
    if (variant === "ticket") f.value.modelUsage[0].ticketId = "f".repeat(64);
    if (variant === "extra")
      Object.assign(f.value, { rawText: "Untrusted provider data" });
    f.pack();
    await expect(
      writer.runGenerationModelWriterSettlement(f.input),
    ).rejects.toThrow();
    expect(f.commit).not.toHaveBeenCalled();
  },
);

test.each(["generated", "validated"] as const)(
  "%s regeneration reserves allowance only while the fresh publication plan permits regeneration",
  async (stage) => {
    const f = await metadataMaintenanceFixture();
    const operation = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "project",
        subject: "issue:42",
      },
      stage,
      expectedSha: "c".repeat(40),
    });
    operation.key = operationKey(operation.identity);
    f.state.operations = [operation];
    f.state.local.modelBudget = createModelBudgetState(f.state.nowMs);
    const commit = vi.fn(
      async (input: { files: Array<{ content: string }> }) => {
        f.state.local.modelBudget = JSON.parse(input.files[0].content);
        return { sha: String(f.state.local.revision) };
      },
    );
    const dispatch = vi.fn(async () => ({
      runId: 700,
      workflow: ".github/workflows/generate-project-submission.yml",
    }));
    const gh = vi.fn(async () => {
      throw new Error("Unexpected remote fixture transport");
    });
    const env = {
      GITHUB_REPOSITORY: f.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "810",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
      UTILITY_MODEL: "primary",
    };
    const input = {
      operationKey: operation.key,
      env,
      load: async () => f.state,
      commit,
      dispatch,
      gh,
      persistFailure: vi.fn(async () => {}),
    };
    expect(
      await runModelWriterPreparation({
        ...input,
        projectGenerationEligible: async () => false,
      }),
    ).toEqual({ status: "superseded" });
    expect(commit).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
    expect(
      await runModelWriterPreparation({
        ...input,
        projectGenerationEligible: async () => true,
      }),
    ).toMatchObject({ status: "dispatched", runId: 700 });
    expect(dispatch).toHaveBeenCalledOnce();
  },
);

test.each([false, true])(
  "manual copy review cannot call the provider without available verified allowance (%s)",
  async (denied) => {
    vi.stubEnv(
      "UTILITY_API_ENDPOINT",
      "https://model.invalid/v1/chat/completions",
    );
    vi.stubEnv("UTILITY_API_KEY", "fixture-key");
    vi.stubEnv("UTILITY_MODEL", "fixture-model");
    for (const name of [
      "TAVERNARY_ENRICHMENT_API_URL",
      "TAVERNARY_ENRICHMENT_API_KEY",
      "TAVERNARY_ENRICHMENT_MODEL",
    ])
      vi.stubEnv(name, "");
    const fetch = vi.fn(async () => {
      throw new Error("Provider HTTP must not be attempted");
    });
    const beforeRequest = vi.fn(() => {
      throw Object.assign(new Error("No allowance"), {
        code: "budget-exhausted",
      });
    });
    vi.stubGlobal("fetch", fetch);
    try {
      const summary = "An owner supplied factual summary.";
      expect(
        await preserveCatalogSummary({
          authorityType: "repository-owner",
          submittedSummary: summary,
          ...(denied
            ? { loadBudgetGuard: async () => ({ beforeRequest }) }
            : {}),
        }),
      ).toMatchObject({
        reviewStatus: "unavailable",
        publishedSummary: summary,
      });
      expect(fetch).not.toHaveBeenCalled();
      if (denied) expect(beforeRequest).toHaveBeenCalled();
    } finally {
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  },
);

test.each(["project-submission", "project-owner-request"])(
  "%s workflow routes empty owner requests to the writer and requires tickets for bounded generation",
  (producer) => {
    const workflow = parse(
      readFileSync(`.github/workflows/generate-${producer}.yml`, "utf8"),
    );
    expect(workflow.jobs.request["timeout-minutes"]).toBe(5);
    expect(workflow.jobs.request.if).toContain("inputs.operation_key == ''");
    expect(workflow.jobs.generate.if).toContain("inputs.operation_key != ''");
    expect(workflow.jobs.generate.if).toContain(
      "github.actor_id == vars.TAVERNARY_PUBLISHER_BOT_ID",
    );
    expect(workflow.jobs.generate["timeout-minutes"]).toBe(45);
    expect(workflow.jobs.generate.env.TAVERNARY_REQUIRE_MODEL_BUDGET).toBe(
      "true",
    );
    expect(workflow.on.workflow_dispatch.inputs).toHaveProperty(
      "budget_ticket",
    );
    expect(JSON.stringify(workflow.jobs.request)).not.toMatch(
      /UTILITY_API_KEY|TAVERNARY_ENRICHMENT_API_KEY|permission-contents/u,
    );
    expect(JSON.stringify(workflow.jobs.request)).toContain(
      "automation-writer.yml",
    );
    expect(JSON.stringify(workflow.jobs.generate)).toContain(
      "automation-generation-model-usage.json",
    );
  },
);

test.each(["project", "owner-request"] as const)(
  "%s generation reserves shared allowance before one authenticated dispatch",
  async (kind) => {
    const f = await metadataMaintenanceFixture();
    const operation = operationFixture({
      identity: { ...operationFixture().identity, kind, subject: "issue:42" },
      stage: "admitted",
      expectedSha: null,
    });
    operation.key = operationKey(operation.identity);
    f.state.operations = [operation];
    f.state.local.modelBudget = createModelBudgetState(f.state.nowMs);
    const workflow = `.github/workflows/generate-${kind === "project" ? "project-submission" : "project-owner-request"}.yml`;
    const commit = vi.fn(
      async (input: { files: Array<{ content: string }> }) => {
        f.state.local.modelBudget = JSON.parse(input.files[0].content);
        return { sha: String(f.state.local.revision) };
      },
    );
    const dispatch = vi.fn(async () => {
      operation.workerRunId = 700;
      return { runId: 700, workflow };
    });
    const gh = vi.fn(async () => {
      throw new Error("Unexpected remote transport in fixture");
    });
    const persistFailure = vi.fn(async () => {});
    const env = {
      GITHUB_REPOSITORY: f.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${f.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(f.state.publisherActorId),
      UTILITY_MODEL: "primary",
      TAVERNARY_ENRICHMENT_MODEL: "repair",
    };
    expect(
      await runModelWriterPreparation({
        operationKey: operation.key,
        env,
        load: async () => f.state,
        commit,
        dispatch,
        gh,
        persistFailure,
      }),
    ).toMatchObject({ status: "dispatched", runId: 700 });
    expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
      dispatch.mock.invocationCallOrder[0],
    );
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        operationKey: operation.key,
        workflow,
        issueNumber: 42,
      }),
    );
    expect(
      validateModelBudgetState(f.state.local.modelBudget).tickets.every(
        (ticket) =>
          ticket.producer?.runId === 700 &&
          ticket.producer.workflow === workflow,
      ),
    ).toBe(true);
    operation.workerRunId = null;
    const plan = planPreparationRequest({
      state: f.state,
      workflow: workflow.split("/").at(-1)!,
      issueNumber: 42,
    });
    expect(plan).toEqual({
      action: "dispatch",
      workflow: "automation-writer.yml",
      inputs: { mode: "prepare", operation_key: operation.key },
    });
    operation.workerRunId = 700;
    expect(
      await runModelWriterPreparation({
        operationKey: operation.key,
        env,
        load: async () => f.state,
        commit,
        dispatch,
        gh,
        persistFailure,
      }),
    ).toEqual({ status: "superseded" });
    expect(dispatch).toHaveBeenCalledOnce();
    operation.workerRunId = null;
    const exhausted = reserveModelBudget(
      createModelBudgetState(f.state.nowMs),
      {
        operationKey: "f".repeat(64),
        model: "primary",
        requestCount: 40,
        requestedTokens: 200000,
      },
      { nowMs: f.state.nowMs },
    );
    if (!exhausted.allowed) throw new Error("Invalid fixture allowance");
    f.state.local.modelBudget = exhausted.state;
    const refusal = vi.fn(async () => {});
    expect(
      await runModelWriterPreparation({
        operationKey: operation.key,
        env,
        load: async () => f.state,
        commit,
        dispatch,
        gh,
        persistFailure: refusal,
      }),
    ).toMatchObject({ status: "waiting" });
    expect(dispatch).toHaveBeenCalledOnce();
    expect(refusal).toHaveBeenCalledWith(
      expect.objectContaining({ code: "budget-exhausted" }),
    );
  },
);

test.each(["project-submission", "project-owner-request"] as const)(
  "native inventory binds the actual %s generation operation and ignores request jobs",
  (producer) => {
    const input = projectInventoryFixture({
      producer,
      generatedPull: null,
      generationRun: null,
    });
    const operation = discoverProjectOperations(input)[0];
    const run = {
      id: 900,
      path: `.github/workflows/generate-${producer}.yml`,
      event: "workflow_dispatch",
      head_branch: "main",
      display_title: `Automation prepare ${operation.key}`,
      actor: { id: input.publisherActorId, type: "Bot" },
      status: "in_progress",
      conclusion: null,
      created_at: new Date(input.nowMs).toISOString(),
    };
    input.runs.push(run);
    expect(discoverProjectOperations(input)[0].workerRunId).toBe(900);
    run.display_title = `Automation prepare ${"f".repeat(64)}`;
    expect(discoverProjectOperations(input)[0].workerRunId).toBeNull();
    run.display_title = `${producer === "project-submission" ? "Project" : "Owner request"} #${input.issues[0].number}: Request review PR`;
    expect(discoverProjectOperations(input)[0].workerRunId).toBeNull();
  },
);

test("the actual generation dispatch includes the frozen issue, operation and tickets", async () => {
  const workflow = ".github/workflows/generate-project-submission.yml",
    key = "a".repeat(64),
    sourceSha = "b".repeat(40),
    nowMs = Date.parse("2026-10-08T12:00:00Z");
  const run = {
    id: 700,
    path: workflow,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sourceSha,
    head_repository: { full_name: "Owner/Repo" },
    actor: { id: 41, type: "Bot" },
    run_attempt: 1,
    display_title: `Automation prepare ${key}`,
    created_at: new Date(nowMs).toISOString(),
  };
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "workflow"
      ? ""
      : JSON.stringify({ total_count: 1, workflow_runs: [run] }),
  );
  await dispatchReservedModelPreparation({
    gh,
    repository: "Owner/Repo",
    publisherActorId: 41,
    operationKey: key,
    workflow,
    sourceSha,
    ticketIds: ["c".repeat(64)],
    nowMs,
    issueNumber: 42,
  });
  expect(gh.mock.calls[0][0]).toEqual(
    expect.arrayContaining([
      "issue_number=42",
      "force_regeneration=false",
      `operation_key=${key}`,
      `budget_ticket=${"c".repeat(64)}`,
    ]),
  );
});

test("one generation process reuses one verified guard across every card and reports only completed calls", async () => {
  const nowMs = Date.parse("2026-10-08T12:00:00Z"),
    key = "a".repeat(64),
    workflow = ".github/workflows/generate-project-owner-request.yml",
    sourceSha = "b".repeat(40);
  const reserved = reserveModelBudget(
    createModelBudgetState(nowMs),
    {
      operationKey: key,
      model: "primary",
      requestCount: 2,
      requestedTokens: 20000,
    },
    { nowMs },
  );
  if (!reserved.allowed) throw new Error("Invalid fixture reservation");
  const budget = bindModelBudgetTicket(reserved.state, reserved.ticket.id, {
    runId: 700,
    workflow,
  });
  const run = {
    id: 700,
    path: workflow,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: sourceSha,
    head_repository: { full_name: "Owner/Repo" },
    actor: { id: 41, type: "Bot" },
    run_attempt: 1,
    display_title: `Automation prepare ${key}`,
  };
  const gh = vi.fn(async (args: string[]) =>
    JSON.stringify(args[1].includes("actions/runs/") ? run : budget),
  );
  const env = {
    GITHUB_REPOSITORY: "Owner/Repo",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_SHA: sourceSha,
    GITHUB_ACTOR_ID: "41",
    GITHUB_WORKFLOW_REF: `Owner/Repo/${workflow}@refs/heads/main`,
    GITHUB_RUN_ID: "700",
    GITHUB_RUN_ATTEMPT: "1",
    TAVERNARY_PUBLISHER_BOT_ID: "41",
    RUNNER_TEMP: "fixture-temp",
  };
  const persistEvidence = vi.fn<
    (path: string, content: string, options: { flag: "wx" | "w" }) => void
  >(() => {});
  const loader = createProducerBudgetLoader({
    env,
    persistEvidence,
    gh,
    event: {
      inputs: { operation_key: key, budget_ticket: reserved.ticket.id },
    },
    nowMs: () => nowMs,
  });
  const guard = await loader.load(),
    reused = await loader.load();
  expect(reused).toBe(guard);
  expect(gh).toHaveBeenCalledTimes(2);
  const first = guard.beforeRequest({
    model: "primary",
    body: { messages: [] },
    maxOutputTokens: 100,
  });
  guard.completeRequest!(first as string);
  reused.beforeRequest({
    model: "primary",
    body: { messages: [] },
    maxOutputTokens: 100,
  });
  expect(() =>
    reused.beforeRequest({
      model: "primary",
      body: { messages: [] },
      maxOutputTokens: 100,
    }),
  ).toThrow();
  expect(loader.usage()).toMatchObject([
    { ticketId: reserved.ticket.id, usage: { requests: 1 } },
  ]);
  expect(persistEvidence).toHaveBeenCalledTimes(2);
  expect(JSON.parse(persistEvidence.mock.calls[1][1]).modelUsage).toMatchObject(
    [{ ticketId: reserved.ticket.id, usage: { requests: 1 } }],
  );
  expect(loader.evidenceSaved()).toBe(true);
});
