import { expect, test, vi } from "vitest";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
} from "../../scripts/automation/model-budget.mjs";
import {
  dispatchReservedModelPreparation,
  dispatchUnbudgetedPreparation,
  loadProducerBudgetGuard,
} from "../../scripts/automation/model-budget-github.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { operationFixture } from "../helpers/automation-fixtures";

function delayedPreparationFixture() {
  const repository = "Owner/Repo";
  const workflow = ".github/workflows/enrich-catalog.yml";
  const operation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:github-42:example-project",
    },
    stage: "admitted",
    expectedSha: null,
  });
  let clock = Date.parse("2026-10-08T12:00:00Z");
  let budget = createModelBudgetState(clock);
  let revision = "b".repeat(40);
  let commits = 0;
  let dispatchedAt = 0;
  let dispatchedSha = "";
  const calls: string[] = [];
  const env = {
    GITHUB_REPOSITORY: repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    GITHUB_RUN_ID: "800",
    GITHUB_RUN_ATTEMPT: "1",
    TAVERNARY_PUBLISHER_BOT_ID: "41",
    UTILITY_MODEL: "primary",
    TAVERNARY_ENRICHMENT_MODEL: "repair",
  };
  const run = () => ({
    id: 700,
    path: workflow,
    head_sha: dispatchedSha,
    head_branch: "main",
    head_repository: { full_name: repository },
    event: "workflow_dispatch",
    display_title: `Automation prepare ${operation.key}`,
    actor: { id: 41, type: "Bot" },
    created_at: new Date(dispatchedAt).toISOString(),
    status: "in_progress",
    run_attempt: 1,
  });
  const gh = async (args: string[]) => {
    if (args[0] === "workflow") {
      calls.push("dispatch");
      dispatchedAt = Date.now();
      dispatchedSha = revision;
      return "";
    }
    if (
      args.includes(
        `repos/${repository}/actions/workflows/enrich-catalog.yml/runs`,
      )
    ) {
      calls.push("discover");
      return JSON.stringify({ total_count: 1, workflow_runs: [run()] });
    }
    if (args[1] === `repos/${repository}/actions/runs/700`) {
      calls.push("producer");
      return JSON.stringify(run());
    }
    if (
      args[1] ===
      `repos/${repository}/contents/data/maintenance/automation/model-budgets/global.json?ref=main`
    ) {
      calls.push("budget");
      return JSON.stringify(budget);
    }
    throw new Error("Unexpected GitHub request.");
  };
  const load = async (): Promise<AutomationInventoryState> => {
    const snapshot = {
      root: process.cwd(),
      repository,
      publisherActorId: 41,
      nowMs: Date.now(),
      remote: { mainHeadSha: revision, issues: [], pulls: [], runs: [] },
      local: { revision, modelBudget: budget },
      receipts: [],
      operations: [operation],
    };
    // Inventory timestamps precede the slow GitHub reads they describe.
    clock += 120_000;
    return structuredClone(snapshot);
  };
  const commit: NonNullable<
    Parameters<typeof runModelWriterPreparation>[0]["commit"]
  > = async (input) => {
    if (input.expectedMainSha !== revision || input.files.length !== 1)
      throw new Error("Unexpected model allowance write.");
    budget = JSON.parse(input.files[0].content);
    revision = (++commits === 1 ? "c" : "d").repeat(40);
    clock += 20_000;
    return { sha: revision };
  };
  return {
    operation,
    env,
    workflow,
    gh,
    load,
    commit,
    calls,
    nowMs: () => clock,
    budget: () => budget,
    sourceSha: () => dispatchedSha,
  };
}

test("delayed inventory and reservation writes still bind usable producer tickets", async () => {
  const fixture = delayedPreparationFixture();
  const clock = vi.spyOn(Date, "now").mockImplementation(fixture.nowMs);
  try {
    const outcome = await runModelWriterPreparation({
      operationKey: fixture.operation.key,
      env: fixture.env,
      gh: fixture.gh,
      load: fixture.load,
      commit: fixture.commit,
      metadataCached: async () => false,
      dispatch: (input) =>
        dispatchReservedModelPreparation({
          ...input,
          gh: fixture.gh,
          sleep: async () => {},
        }),
      persistFailure: async () => {},
    });
    expect(outcome).toMatchObject({ status: "dispatched", runId: 700 });
    expect(fixture.budget().days[0]).toMatchObject({
      requests: 4,
      tokens: 195000,
    });
    expect(fixture.budget().tickets.map((ticket) => ticket.producer)).toEqual([
      { runId: 700, workflow: fixture.workflow },
      { runId: 700, workflow: fixture.workflow },
    ]);
    const guard = await loadProducerBudgetGuard({
      env: {
        ...fixture.env,
        GITHUB_SHA: fixture.sourceSha(),
        GITHUB_ACTOR_ID: "41",
        GITHUB_RUN_ID: "700",
        GITHUB_WORKFLOW_REF: `${fixture.env.GITHUB_REPOSITORY}/${fixture.workflow}@refs/heads/main`,
      },
      operationKey: fixture.operation.key,
      ticketIds: fixture.budget().tickets.map((ticket) => ticket.id),
      gh: fixture.gh,
      nowMs: fixture.nowMs,
      sleep: async () => {},
    });
    expect(() =>
      guard.beforeRequest({
        model: "primary",
        body: { messages: [] },
        maxOutputTokens: 4096,
      }),
    ).not.toThrow();
    expect(fixture.calls).toEqual([
      "dispatch",
      "discover",
      "producer",
      "budget",
    ]);
  } finally {
    clock.mockRestore();
  }
});

test("delayed cache revalidation still discovers its authenticated preparation run", async () => {
  const fixture = delayedPreparationFixture();
  const clock = vi.spyOn(Date, "now").mockImplementation(fixture.nowMs);
  try {
    const outcome = await runModelWriterPreparation({
      operationKey: fixture.operation.key,
      env: fixture.env,
      gh: fixture.gh,
      load: fixture.load,
      commit: fixture.commit,
      metadataCached: async () => true,
      dispatchCached: (input) =>
        dispatchUnbudgetedPreparation({
          ...input,
          gh: fixture.gh,
          sleep: async () => {},
        }),
      persistFailure: async () => {},
    });
    expect(outcome).toMatchObject({ status: "cache-dispatched", runId: 700 });
    expect(fixture.budget().tickets).toEqual([]);
    expect(fixture.budget().days).toEqual([]);
    expect(fixture.calls).toEqual(["dispatch", "discover"]);
  } finally {
    clock.mockRestore();
  }
});

test("the producer waits for trusted ticket binding during slow post-dispatch inventory", async () => {
  const fixture = delayedPreparationFixture();
  vi.useFakeTimers();
  const clock = vi.spyOn(Date, "now").mockImplementation(fixture.nowMs);
  let producer: ReturnType<typeof loadProducerBudgetGuard> | undefined;
  let loads = 0;
  const gh = async (args: string[]) => {
    const response = await fixture.gh(args);
    if (args[0] === "workflow") {
      const dispatchedAt = fixture.nowMs();
      const startedTimer = new Date().getTime();
      producer = loadProducerBudgetGuard({
        env: {
          ...fixture.env,
          GITHUB_SHA: fixture.sourceSha(),
          GITHUB_ACTOR_ID: "41",
          GITHUB_RUN_ID: "700",
          GITHUB_WORKFLOW_REF: `${fixture.env.GITHUB_REPOSITORY}/${fixture.workflow}@refs/heads/main`,
        },
        operationKey: fixture.operation.key,
        ticketIds: fixture.budget().tickets.map((ticket) => ticket.id),
        gh: fixture.gh,
        nowMs: () => dispatchedAt + new Date().getTime() - startedTimer,
      });
      // Observe rejection below after both processes finish, without an unhandled promise.
      void producer.catch(() => {});
    }
    return response;
  };
  try {
    const writer = runModelWriterPreparation({
      operationKey: fixture.operation.key,
      env: fixture.env,
      gh,
      load: async () => {
        if (++loads === 3)
          await new Promise<void>((resolve) => setTimeout(resolve, 120_000));
        return fixture.load();
      },
      commit: fixture.commit,
      metadataCached: async () => false,
      dispatch: (input) => dispatchReservedModelPreparation({ ...input, gh }),
      persistFailure: async () => {},
    });
    await vi.runAllTimersAsync();
    expect(await writer).toMatchObject({ status: "dispatched", runId: 700 });
    expect(
      fixture
        .budget()
        .tickets.every((ticket) => ticket.producer?.runId === 700),
    ).toBe(true);
    await expect(producer).resolves.toBeDefined();
    const guard = await producer!;
    expect(() =>
      guard.beforeRequest({
        model: "primary",
        body: { messages: [] },
        maxOutputTokens: 4096,
      }),
    ).not.toThrow();
    expect(fixture.calls.filter((call) => call === "dispatch")).toHaveLength(1);
    expect(fixture.calls.filter((call) => call === "discover")).toHaveLength(1);
    expect(
      fixture.calls.filter((call) => call === "budget").length,
    ).toBeLessThanOrEqual(26);
  } finally {
    clock.mockRestore();
    vi.useRealTimers();
  }
});

test("the binding deadline rejects a late snapshot and clamps its final sleep", async () => {
  const fixture = delayedPreparationFixture();
  vi.useFakeTimers();
  const clock = vi.spyOn(Date, "now").mockImplementation(fixture.nowMs);
  try {
    await runModelWriterPreparation({
      operationKey: fixture.operation.key,
      env: fixture.env,
      gh: fixture.gh,
      load: fixture.load,
      commit: fixture.commit,
      metadataCached: async () => false,
      dispatch: (input) =>
        dispatchReservedModelPreparation({ ...input, gh: fixture.gh }),
      persistFailure: async () => {},
    });
    const startedAt = fixture.nowMs();
    const startedTimer = new Date().getTime();
    let snapshots = 0;
    const producer = loadProducerBudgetGuard({
      env: {
        ...fixture.env,
        GITHUB_SHA: fixture.sourceSha(),
        GITHUB_ACTOR_ID: "41",
        GITHUB_RUN_ID: "700",
        GITHUB_WORKFLOW_REF: `${fixture.env.GITHUB_REPOSITORY}/${fixture.workflow}@refs/heads/main`,
      },
      operationKey: fixture.operation.key,
      ticketIds: fixture.budget().tickets.map((ticket) => ticket.id),
      gh: async (args) => {
        if (args[1].includes("/contents/")) {
          await new Promise<void>((resolve) =>
            setTimeout(resolve, ++snapshots === 1 ? 290_000 : 1_000),
          );
          const state = JSON.parse(await fixture.gh(args));
          if (snapshots === 1)
            for (const ticket of state.tickets) ticket.producer = null;
          return JSON.stringify(state);
        }
        return fixture.gh(args);
      },
      nowMs: () => startedAt + new Date().getTime() - startedTimer,
    });
    void producer.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(producer).rejects.toMatchObject({ code: "budget-exhausted" });
    expect(new Date().getTime() - startedTimer).toBe(301_000);
    expect(snapshots).toBe(2);
    expect(fixture.budget().days[0]).toMatchObject({
      requests: 4,
      tokens: 195000,
    });
  } finally {
    clock.mockRestore();
    vi.useRealTimers();
  }
});

test("an unbound producer stops after bounded snapshots even when its clock does not advance", async () => {
  const fixture = delayedPreparationFixture();
  const reservation = reserveModelBudget(
    createModelBudgetState(fixture.nowMs()),
    {
      operationKey: fixture.operation.key,
      model: "primary",
      requestCount: 1,
      requestedTokens: 10000,
    },
    { nowMs: fixture.nowMs() },
  );
  if (!reservation.allowed) throw new Error("Fixture reservation failed.");
  vi.useFakeTimers();
  try {
    await fixture.gh(["workflow", "run", "enrich-catalog.yml"]);
    const startedTimer = Date.now();
    let snapshots = 0;
    const producer = loadProducerBudgetGuard({
      env: {
        ...fixture.env,
        GITHUB_SHA: fixture.sourceSha(),
        GITHUB_ACTOR_ID: "41",
        GITHUB_RUN_ID: "700",
        GITHUB_WORKFLOW_REF: `${fixture.env.GITHUB_REPOSITORY}/${fixture.workflow}@refs/heads/main`,
      },
      operationKey: fixture.operation.key,
      ticketIds: [reservation.ticket.id],
      gh: async (args) => {
        if (args[1].includes("/contents/")) {
          snapshots++;
          return JSON.stringify(reservation.state);
        }
        return fixture.gh(args);
      },
      nowMs: fixture.nowMs,
    });
    void producer.catch(() => {});
    await vi.runAllTimersAsync();
    await expect(producer).rejects.toMatchObject({ code: "budget-exhausted" });
    expect(snapshots).toBe(26);
    expect(Date.now() - startedTimer).toBe(300_000);
    expect(reservation.state.days[0]).toMatchObject({
      requests: 1,
      tokens: 10000,
    });
    expect(reservation.state.tickets[0].producer).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
