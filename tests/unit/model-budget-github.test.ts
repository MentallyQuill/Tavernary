import { expect, test, vi } from "vitest";
import {
  createModelBudgetState,
  reserveModelBudget,
  bindModelBudgetTicket,
} from "../../scripts/automation/model-budget.mjs";
import {
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
test("read-only preparation loads current writer-owned tickets and rejects a rerun before model HTTP", async () => {
  const reservation = reserveModelBudget(
    createModelBudgetState(nowMs),
    { operationKey, model: "primary", requestCount: 1, requestedTokens: 10000 },
    { nowMs },
  );
  if (!reservation.allowed) throw new Error("Fixture reservation failed");
  const state = bindModelBudgetTicket(
    reservation.state,
    reservation.ticket.id,
    { runId: 700, workflow },
  );
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
});
