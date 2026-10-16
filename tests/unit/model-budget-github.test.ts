import { expect, test, vi } from "vitest";
import { maximumModelBudgetFixture } from "../helpers/model-budget-fixtures";
import {
  createModelBudgetState,
  reserveModelBudget,
  bindModelBudgetTicket,
} from "../../scripts/automation/model-budget.mjs";
import {
  createProducerBudgetLoader,
  dispatchReservedModelPreparation,
  loadProducerBudgetGuard,
} from "../../scripts/automation/model-budget-github.mjs";
const nowMs = Date.parse("2026-10-08T12:00:00Z");
const repository = "Owner/Repo";
const operationKey = "a".repeat(64);
const sourceSha = "b".repeat(40);
const workflow = ".github/workflows/enrich-catalog.yml";
const publisherActorId = 41;
const run = {
  id: 700,
  path: workflow,
  head_sha: sourceSha,
  head_branch: "main",
  head_repository: { full_name: repository },
  event: "workflow_dispatch",
  display_title: `Automation prepare ${operationKey}`,
  actor: { id: publisherActorId, type: "Bot" },
  created_at: new Date(nowMs).toISOString(),
  status: "in_progress",
  run_attempt: 1,
};
test("the live dispatch adapter binds only a uniquely authenticated run at its reserved source SHA", async () => {
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "workflow"
      ? ""
      : JSON.stringify({ total_count: 1, workflow_runs: [run] }),
  );
  expect(
    await dispatchReservedModelPreparation({
      gh,
      repository,
      publisherActorId,
      operationKey,
      workflow,
      sourceSha,
      ticketIds: ["c".repeat(64)],
      nowMs,
      sleep: async () => {},
    }),
  ).toEqual({ runId: 700, workflow });
  expect(gh.mock.calls[0][0]).toContain(`budget_ticket=${"c".repeat(64)}`);
  expect(gh.mock.calls[1][0]).toContain(`head_sha=${sourceSha}`);
  const foreign = vi.fn(async (args: string[]) =>
    args[0] === "workflow"
      ? ""
      : JSON.stringify({
          total_count: 1,
          workflow_runs: [{ ...run, actor: { id: 42, type: "Bot" } }],
        }),
  );
  await expect(
    dispatchReservedModelPreparation({
      gh: foreign,
      repository,
      publisherActorId,
      operationKey,
      workflow,
      sourceSha,
      ticketIds: ["c".repeat(64)],
      nowMs,
      sleep: async () => {},
    }),
  ).rejects.toThrow();
});

test.each([
  ".github/workflows/generate-project-submission.yml",
  ".github/workflows/generate-project-owner-request.yml",
])(
  "%s dispatches zero and native request IDs with their exact authenticated titles",
  async (generationWorkflow) => {
    for (const request of [
      {
        requestRunId: undefined,
        dispatchInput: "request_run_id=0",
        displayTitle: `Automation prepare ${operationKey}`,
      },
      {
        requestRunId: 0,
        dispatchInput: "request_run_id=0",
        displayTitle: `Automation prepare ${operationKey}`,
      },
      {
        requestRunId: 812,
        dispatchInput: "request_run_id=812",
        displayTitle: `Automation prepare ${operationKey} request812`,
      },
    ]) {
      const gh = vi.fn(async (args: string[]) =>
        args[0] === "workflow"
          ? ""
          : JSON.stringify({
              total_count: 1,
              workflow_runs: [
                {
                  ...run,
                  path: generationWorkflow,
                  display_title: request.displayTitle,
                },
              ],
            }),
      );
      await expect(
        dispatchReservedModelPreparation({
          gh,
          repository,
          publisherActorId,
          operationKey,
          workflow: generationWorkflow,
          sourceSha,
          ticketIds: ["c".repeat(64)],
          issueNumber: 123,
          requestRunId: request.requestRunId,
          nowMs,
          sleep: async () => {},
        }),
      ).resolves.toEqual({ runId: 700, workflow: generationWorkflow });
      expect(gh.mock.calls[0][0]).toContain(request.dispatchInput);
      expect(gh.mock.calls[0][0]).toContain("issue_number=123");
      expect(gh.mock.calls[0][0]).toContain("force_regeneration=false");
    }
  },
);

test.each([
  ".github/workflows/generate-project-submission.yml",
  ".github/workflows/generate-project-owner-request.yml",
])(
  "%s rejects untrusted, ambiguous, or out-of-window automatic producers",
  async (generationWorkflow) => {
    const producer = { ...run, path: generationWorkflow };
    for (const workflowRuns of [
      [{ ...producer, display_title: `${run.display_title} request0` }],
      [{ ...producer, path: workflow }],
      [{ ...producer, head_sha: "d".repeat(40) }],
      [{ ...producer, head_branch: "foreign" }],
      [{ ...producer, head_repository: { full_name: "Foreign/Repo" } }],
      [{ ...producer, actor: { id: 42, type: "Bot" } }],
      [{ ...producer, actor: { id: publisherActorId, type: "User" } }],
      [{ ...producer, event: "push" }],
      [{ ...producer, run_attempt: 2 }],
      [
        {
          ...producer,
          created_at: new Date(nowMs - 1001).toISOString(),
        },
      ],
      [
        {
          ...producer,
          created_at: new Date(nowMs + 60001).toISOString(),
        },
      ],
      [producer, { ...producer, id: 701 }],
    ]) {
      const gh = vi.fn(async (args: string[]) =>
        args[0] === "workflow"
          ? ""
          : JSON.stringify({
              total_count: workflowRuns.length,
              workflow_runs: workflowRuns,
            }),
      );
      await expect(
        dispatchReservedModelPreparation({
          gh,
          repository,
          publisherActorId,
          operationKey,
          workflow: generationWorkflow,
          sourceSha,
          ticketIds: ["c".repeat(64)],
          issueNumber: 123,
          requestRunId: 0,
          nowMs,
          sleep: async () => {},
        }),
      ).rejects.toThrow("Verified model preparation allowance is unavailable.");
    }
  },
);

test.each([
  ".github/workflows/generate-project-submission.yml",
  ".github/workflows/generate-project-owner-request.yml",
])(
  "%s normalizes producer request IDs and rejects noncanonical titles before reading the ledger",
  async (generationWorkflow) => {
    const reservation = reserveModelBudget(
      createModelBudgetState(nowMs),
      {
        operationKey,
        requestId: "generation-request-812:primary",
        model: "primary",
        requestCount: 1,
        requestedTokens: 10000,
      },
      { nowMs },
    );
    if (!reservation.allowed) throw new Error("Fixture reservation failed");
    const state = bindModelBudgetTicket(
      reservation.state,
      reservation.ticket.id,
      { runId: 700, workflow: generationWorkflow },
    );
    const env = {
      GITHUB_REPOSITORY: repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_SHA: sourceSha,
      GITHUB_ACTOR_ID: "41",
      TAVERNARY_PUBLISHER_BOT_ID: "41",
      GITHUB_WORKFLOW_REF: `${repository}/${generationWorkflow}@refs/heads/main`,
      GITHUB_RUN_ID: "700",
      GITHUB_RUN_ATTEMPT: "1",
    };
    for (const request of [
      { input: undefined, displayTitle: `Automation prepare ${operationKey}` },
      { input: "0", displayTitle: `Automation prepare ${operationKey}` },
      {
        input: "812",
        displayTitle: `Automation prepare ${operationKey} request812`,
      },
    ]) {
      const inputs: Record<string, string> = {
        operation_key: operationKey,
        budget_ticket: reservation.ticket.id,
      };
      if (request.input !== undefined) inputs.request_run_id = request.input;
      const event = {
        inputs,
      };
      const producer = {
        ...run,
        path: generationWorkflow,
        display_title: request.displayTitle,
      };
      const gh = vi.fn(async (args: string[]) =>
        JSON.stringify(args[1].includes("actions/runs") ? producer : state),
      );
      const guard = await createProducerBudgetLoader({
        env,
        event,
        gh,
        nowMs: () => nowMs,
        sleep: async () => {},
      }).load();
      expect(() =>
        guard.beforeRequest({
          model: "primary",
          body: { messages: [] },
          maxOutputTokens: 4096,
        }),
      ).not.toThrow();
      for (const displayTitle of [
        `Automation prepare ${operationKey}`,
        `Automation prepare ${operationKey} request0`,
        `Automation prepare ${operationKey} request812`,
        `Automation prepare ${operationKey} request813`,
      ].filter((title) => title !== request.displayTitle)) {
        const invalid = vi.fn(async () =>
          JSON.stringify({ ...producer, display_title: displayTitle }),
        );
        await expect(
          createProducerBudgetLoader({
            env,
            event,
            gh: invalid,
            nowMs: () => nowMs,
            sleep: async () => {},
          }).load(),
        ).rejects.toThrow(
          "Verified model preparation allowance is unavailable.",
        );
        expect(invalid).toHaveBeenCalledTimes(1);
      }
    }
  },
);

test("budgeted advisory dispatch preserves the required published-evidence inputs", async () => {
  const advisory = ".github/workflows/review-catalog-policy.yml";
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "workflow"
      ? ""
      : JSON.stringify({
          total_count: 1,
          workflow_runs: [{ ...run, path: advisory }],
        }),
  );
  await dispatchReservedModelPreparation({
    gh,
    repository,
    publisherActorId,
    operationKey,
    workflow: advisory,
    sourceSha,
    ticketIds: ["c".repeat(64)],
    projectId: "verified-project",
    nowMs,
  });
  expect(gh.mock.calls[0][0]).toContain("project_id=verified-project");
  expect(gh.mock.calls[0][0]).toContain(`merge_sha=${sourceSha}`);
  expect(gh.mock.calls[0][0]).toContain("transaction_issue_number=0");
  expect(gh.mock.calls[0][0]).toContain("transaction_pull_number=0");
});
test.each([false, true])(
  "read-only preparation loads current writer-owned tickets and rejects a rerun before model HTTP (full ledger=%s)",
  async (fullLedger) => {
    const reservation = reserveModelBudget(
      createModelBudgetState(nowMs),
      {
        operationKey,
        model: "primary",
        requestCount: 1,
        requestedTokens: 10000,
      },
      { nowMs },
    );
    if (!reservation.allowed) throw new Error("Fixture reservation failed");
    const bound = bindModelBudgetTicket(
      reservation.state,
      reservation.ticket.id,
      { runId: 700, workflow },
    );
    const state = fullLedger ? maximumModelBudgetFixture() : bound;
    if (fullLedger) {
      state.updatedAt = bound.updatedAt;
      state.days.pop();
      state.days.push(...bound.days);
      state.months.shift();
      state.months.push(...bound.months);
      state.tickets.pop();
      state.tickets.push(...bound.tickets);
    }
    const gh = vi.fn(async (args: string[]) =>
      args[1].includes("actions/runs")
        ? JSON.stringify(run)
        : JSON.stringify(state),
    );
    const env = {
      GITHUB_REPOSITORY: repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_SHA: sourceSha,
      GITHUB_ACTOR_ID: "41",
      TAVERNARY_PUBLISHER_BOT_ID: "41",
      GITHUB_WORKFLOW_REF: `${repository}/${workflow}@refs/heads/main`,
      GITHUB_RUN_ID: "700",
      GITHUB_RUN_ATTEMPT: "1",
    };
    const guard = await loadProducerBudgetGuard({
      env,
      operationKey,
      ticketIds: [reservation.ticket.id],
      gh,
      nowMs: () => nowMs,
      sleep: async () => {},
    });
    expect(() =>
      guard.beforeRequest({
        model: "primary",
        body: { messages: [] },
        maxOutputTokens: 4096,
      }),
    ).not.toThrow();
    await expect(
      loadProducerBudgetGuard({
        env: { ...env, GITHUB_RUN_ATTEMPT: "2" },
        operationKey,
        ticketIds: [reservation.ticket.id],
        gh,
        nowMs: () => nowMs,
        sleep: async () => {},
      }),
    ).rejects.toThrow();
    if (!fullLedger) {
      for (const response of ["run", "budget"]) {
        await expect(
          loadProducerBudgetGuard({
            env,
            operationKey,
            ticketIds: [reservation.ticket.id],
            gh: async (args) => {
              const isRun = args[1].includes("actions/runs");
              const content = JSON.stringify(isRun ? run : state);
              return (response === "run") === isRun
                ? content.padEnd(isRun ? 8_388_609 : 25_165_825, " ")
                : content;
            },
            nowMs: () => nowMs,
            sleep: async () => {},
          }),
        ).rejects.toThrow(
          "Verified model preparation allowance is unavailable.",
        );
      }
    }
  },
);
