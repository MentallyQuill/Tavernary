import { expect, test, vi } from "vitest";
import {
  createModelBudgetState,
  reserveModelBudget,
  validateModelBudgetState,
} from "../../scripts/automation/model-budget.mjs";
import {
  runModelWriterPreparation,
  runAutomationWriterReconciliation,
} from "../../scripts/automation/writer-runtime.mjs";
import { operationKey } from "../../scripts/automation/operation.mjs";
import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";
import { planAutomationRetry } from "../../scripts/automation/retry.mjs";
import {
  metadataMaintenanceFixture,
  operationFixture,
} from "../helpers/automation-fixtures";

async function fixture() {
  const f = await metadataMaintenanceFixture();
  f.state.operations = Array.from({ length: 7 }, (_, index) => {
    const operation = operationFixture({
      identity: {
        ...operationFixture().identity,
        kind: "project",
        subject: `issue:${42 + index}`,
      },
      stage: "admitted",
      expectedSha: null,
    });
    operation.key = operationKey(operation.identity);
    return operation;
  });
  const previous = reserveModelBudget(
    createModelBudgetState(f.state.nowMs),
    {
      operationKey: "f".repeat(64),
      model: "primary",
      requestCount: 4,
      requestedTokens: 195000,
    },
    { nowMs: f.state.nowMs },
  );
  if (!previous.allowed) throw new Error("Previous reservation failed");
  f.state.local.modelBudget = previous.state;
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
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
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    f.state.local.modelBudget = JSON.parse(input.files[0].content);
    return { sha: String(f.state.local.revision) };
  });
  let nextRun = 900;
  const dispatch = vi.fn(async () => ({
    runId: nextRun++,
    workflow: ".github/workflows/generate-project-submission.yml",
  }));
  const input = {
    env,
    load: vi.fn(async () => f.state),
    gh: vi.fn(async () => {
      throw new Error("Unexpected remote transport");
    }),
    commit,
    dispatch,
    dispatchCached: vi.fn(async () => ({
      runId: 999,
      workflow: ".github/workflows/enrich-catalog.yml",
    })),
    persistFailure: vi.fn(async () => {}),
    projectGenerationEligible: async () => true,
  };
  return { state: f.state, input, env, commit, dispatch };
}

test("the reviewed two-million cap reserves seven submissions after today's charged preparation", async () => {
  const f = await fixture();
  f.env.TAVERNARY_MODEL_DAILY_TOKENS = "2000000";
  for (const operation of f.state.operations) {
    expect(
      await runModelWriterPreparation({
        ...f.input,
        operationKey: operation.key,
      }),
    ).toMatchObject({ status: "dispatched" });
  }
  const budget = validateModelBudgetState(f.state.local.modelBudget);
  expect(budget.days).toEqual([
    { day: "2026-10-08", requests: 32, tokens: 1560000 },
  ]);
  expect(budget.tickets).toHaveLength(15);
  expect(budget.tickets.slice(1).every((ticket) => ticket.producer)).toBe(true);
  expect(f.dispatch).toHaveBeenCalledTimes(7);
});

test("scheduled health uses the configured cap before proposing an exhausted-budget incident", async () => {
  const f = await fixture();
  f.state.operations = [];
  validateModelBudgetState(f.state.local.modelBudget).days[0].tokens = 200000;
  f.env.TAVERNARY_MODEL_DAILY_TOKENS = "2000000";
  const result = await runAutomationWriterReconciliation({
    env: f.env,
    load: f.input.load,
    gh: f.input.gh,
  });
  expect(result.controller).toMatchObject({ dispatched: 0 });
  expect(result.health).toMatchObject({ status: "idle" });
});

test("invalid optional model configuration still dispatches a verified metadata cache hit", async () => {
  const f = await fixture();
  const cached = await metadataMaintenanceFixture({ unchanged: true });
  f.env.TAVERNARY_MODEL_DAILY_TOKENS = "private-value";
  expect(
    await runModelWriterPreparation({
      ...f.input,
      operationKey: cached.operation.key,
      load: async () => cached.state,
      metadataCached: async (input) => {
        const { metadataObservationIsCached } =
          await import("../../scripts/automation/metadata-preparation.mjs");
        return metadataObservationIsCached({
          ...input,
          observation: await cached.observe(),
        });
      },
    }),
  ).toEqual({ status: "cache-dispatched", runId: 999 });
  expect(f.input.dispatchCached).toHaveBeenCalledOnce();
  expect(f.commit).not.toHaveBeenCalled();
  expect(f.dispatch).not.toHaveBeenCalled();
  expect(f.input.persistFailure).not.toHaveBeenCalled();
  expect(cached.state.local.modelBudget).toBeUndefined();
});

test.each([undefined, "", "200000"])(
  "the writer preserves its two-hundred-thousand default (%s)",
  async (dailyTokens) => {
    const f = await fixture();
    f.env.TAVERNARY_MODEL_DAILY_TOKENS = dailyTokens;
    expect(
      await runModelWriterPreparation({
        ...f.input,
        operationKey: f.state.operations[0].key,
      }),
    ).toEqual({ status: "waiting", reason: "daily-limit" });
    expect(f.input.persistFailure).toHaveBeenCalledWith(
      expect.objectContaining({ code: "budget-exhausted" }),
    );
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(
      validateModelBudgetState(f.state.local.modelBudget).days[0].tokens,
    ).toBe(195000);
  },
);

test.each(["0", "-1", "1.5", "2e6", "2000001", "NaN", "private-value"])(
  "invalid daily configuration refuses model-requiring preparation before reservations (%s)",
  async (dailyTokens) => {
    const f = await fixture();
    const previousBudget = structuredClone(f.state.local.modelBudget);
    f.env.TAVERNARY_MODEL_DAILY_TOKENS = dailyTokens;
    await expect(
      runModelWriterPreparation({
        ...f.input,
        operationKey: f.state.operations[0].key,
      }),
    ).rejects.toMatchObject({
      code: "provider-configuration-invalid",
      message: "Model daily token limit is invalid.",
    });
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
    expect(f.input.dispatchCached).not.toHaveBeenCalled();
    expect(f.state.local.modelBudget).toEqual(previousBudget);
    expect(f.input.persistFailure).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "provider-configuration-invalid",
        message: "Model daily token limit is invalid.",
      }),
    );
  },
);

test("invalid optional model configuration leaves canonical reconciliation available", async () => {
  const f = await fixture();
  f.state.operations = [];
  f.env.TAVERNARY_MODEL_DAILY_TOKENS = "private-value";
  const result = await runAutomationWriterReconciliation({
    env: f.env,
    load: f.input.load,
    gh: f.input.gh,
  });
  expect(result.controller).toMatchObject({ dispatched: 0 });
  expect(result.health).toMatchObject({ status: "idle" });
  expect(JSON.stringify(result)).not.toContain("private-value");
});

test.each(["binding-unavailable", "ticket-expired"])(
  "a %s reservation stays charged without a false daily-budget cooldown",
  async (reason) => {
    const f = await fixture();
    f.env.TAVERNARY_MODEL_DAILY_TOKENS = "2000000";
    const operation = f.state.operations[0];
    for (const [index, request] of [
      { model: "primary", requestCount: 3, requestedTokens: 180000 },
      { model: "repair", requestCount: 1, requestedTokens: 15000 },
    ].entries()) {
      const decision = reserveModelBudget(
        validateModelBudgetState(f.state.local.modelBudget),
        {
          ...request,
          operationKey: operation.key,
          requestId: `writer-800:${index}`,
        },
        { nowMs: f.state.nowMs, tokensPerDay: 2000000 },
      );
      if (!decision.allowed) throw new Error("Fixture reservation failed");
      f.state.local.modelBudget = decision.state;
    }
    const chargedBudget = structuredClone(f.state.local.modelBudget);
    if (reason === "ticket-expired") {
      const reserved = validateModelBudgetState(chargedBudget).tickets.find(
        (ticket) => ticket.requestId === "writer-800:0",
      );
      if (!reserved) throw new Error("Fixture ticket missing");
      f.state.nowMs = Date.parse(reserved.expiresAt) + 1;
    }
    let failure: (Error & { code?: string }) | undefined;
    expect(
      await runModelWriterPreparation({
        ...f.input,
        operationKey: operation.key,
        persistFailure: async (error) => {
          failure = error as Error & { code?: string };
        },
      }),
    ).toEqual({ status: "waiting", reason });
    expect(failure).toMatchObject({ code: "workflow-result-unavailable" });
    const classified = classifyAutomationFailure({
      diagnosticCode: failure?.code,
    });
    expect(classified).toEqual({
      kind: "transient",
      reasonCode: "workflow-result-unavailable",
    });
    expect(
      planAutomationRetry({
        failure: classified,
        transientAttempts: 0,
        immediateAttempts: 0,
        nowMs: f.state.nowMs,
        jitterSeed: "",
      }),
    ).toMatchObject({
      action: "retry",
      nextEligibleAt: new Date(f.state.nowMs + 300000).toISOString(),
    });
    expect(f.state.local.modelBudget).toEqual(chargedBudget);
    expect(f.commit).not.toHaveBeenCalled();
    expect(f.dispatch).not.toHaveBeenCalled();
  },
);
