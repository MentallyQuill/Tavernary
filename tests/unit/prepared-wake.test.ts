import { expect, test, vi } from "vitest";
import {
  planPreparedWake,
  selectPreparedWakes,
  runPreparedWakeCli,
} from "../../scripts/automation/prepared-wake.mjs";
import { preparedResultContextFixture } from "../helpers/automation-fixtures";
test("an authenticated completed owner request wakes only its shared writer admission", async () => {
  const repository = "MentallyQuill/Tavernary";
  const run = {
    id: 987,
    path: ".github/workflows/request-catalog-enrichment.yml",
    display_title: "Enrichment request all-automatic batch20 concurrency2",
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "a".repeat(40),
    actor: { id: 2625904, type: "User" },
    repository: { id: 1309605115, full_name: repository },
    head_repository: { id: 1309605115, full_name: repository },
    status: "completed",
    conclusion: "success",
  };
  const gh = vi.fn(async () => JSON.stringify(run));
  const write = vi.fn();
  expect(
    await runPreparedWakeCli({
      env: {
        GITHUB_REPOSITORY: repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_run",
        GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/automation-prepared.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: "900",
      },
      runId: 987,
      gh,
      write,
    }),
  ).toBe(0);
  expect(gh).toHaveBeenCalledWith([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    "mode=enrichment-request",
    "-f",
    "result_run_id=987",
  ]);
  expect(write).toHaveBeenCalledWith(
    JSON.stringify({
      status: "dispatched",
      mode: "enrichment-request",
      runId: 987,
    }),
  );
});
function fixture() {
  const context = preparedResultContextFixture();
  return {
    repository: context.currentState.repository,
    publisherActorId: context.publisherActorId,
    run: {
      ...context.run,
      display_title: `Automation prepare ${context.operation.key}`,
      created_at: "2026-10-08T12:00:00Z",
    },
    operation: context.operation,
  };
}
test("a completed trusted producer wakes the serialized writer with only its bound operation and run", () => {
  const input = fixture();
  expect(planPreparedWake(input)).toEqual({
    operationKey: input.operation.key,
    runId: input.run.id,
  });
});
test.each([
  "actor",
  "fork",
  "workflow",
  "branch",
  "title",
  "active",
  "failure",
])(
  "a foreign or incomplete %s wake cannot dispatch privileged work",
  (variant) => {
    const input = fixture();
    if (variant === "actor") input.run.actor.id++;
    if (variant === "fork")
      input.run.head_repository.full_name = "Foreign/Repo";
    if (variant === "workflow") input.run.path = ".github/workflows/ci.yml";
    if (variant === "branch") input.run.head_branch = "foreign";
    if (variant === "title")
      input.run.display_title = "Automation prepare command-injection";
    if (variant === "active") input.run.status = "in_progress";
    if (variant === "failure") input.run.conclusion = "failure";
    expect(planPreparedWake(input)).toBeNull();
  },
);
test("missed preparation wakes can be reconstructed from current operations and completed runs", () => {
  const input = fixture();
  const selected = selectPreparedWakes({
    ...input,
    operations: [input.operation],
    runs: [input.run, { ...input.run, id: input.run.id + 1 }],
    limit: 20,
  });
  expect(selected).toEqual([
    { operationKey: input.operation.key, runId: input.run.id + 1 },
  ]);
  expect(
    selectPreparedWakes({
      ...input,
      operations: [],
      runs: [input.run],
      limit: 20,
    }),
  ).toEqual([]);
});

test("completed handoffs cannot bypass persisted backoff or an active worker", () => {
  const input = fixture();
  const nowMs = Date.now();
  for (const operation of [
    {
      ...input.operation,
      nextEligibleAt: new Date(nowMs + 86_400_000).toISOString(),
    },
    { ...input.operation, workerRunId: 701 },
  ])
    expect(
      selectPreparedWakes({
        ...input,
        operations: [operation],
        runs: [input.run],
        nowMs,
      }),
    ).toEqual([]);
});
test("the completion CLI fetches authoritative run metadata and dispatches only the shared writer", async () => {
  const input = fixture();
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "api" ? JSON.stringify(input.run) : "",
  );
  const env = {
    GITHUB_REPOSITORY: input.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_run",
    TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
  };
  expect(
    await runPreparedWakeCli({ env, runId: input.run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh).toHaveBeenLastCalledWith([
    "workflow",
    "run",
    "automation-writer.yml",
    "--repo",
    input.repository,
    "--ref",
    "main",
    "-f",
    "mode=publish",
    "-f",
    `operation_key=${input.operation.key}`,
    "-f",
    `result_run_id=${input.run.id}`,
  ]);
});

test("a trusted failed completion wakes reconciliation for diagnostics without dispatching publication", async () => {
  const input = fixture();
  input.run.conclusion = "failure";
  const gh = vi.fn(async (args: string[]) =>
    args[0] === "api" ? JSON.stringify(input.run) : "",
  );
  const env = {
    GITHUB_REPOSITORY: input.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_run",
    TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
  };
  expect(
    await runPreparedWakeCli({ env, runId: input.run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh.mock.calls[1][0]).toContain("mode=reconcile");
  expect(gh.mock.calls[1][0]).not.toContain("mode=publish");
});
