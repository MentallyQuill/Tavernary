import { expect, test, vi } from "vitest";
import {
  planPreparedWake,
  selectPreparedWakes,
  runPreparedWakeCli,
} from "../../scripts/automation/prepared-wake.mjs";
import { preparedResultContextFixture } from "../helpers/automation-fixtures";
function generationWakeFixture(owner: boolean, project = false) {
  const repository = "MentallyQuill/Tavernary";
  return {
    id: 987,
    path: `.github/workflows/generate-${project ? "project-submission" : "project-owner-request"}.yml`,
    display_title: owner
      ? `${project ? "Project" : "Owner request"} #42: Request review PR force=true`
      : `Automation prepare ${"a".repeat(64)} request500`,
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: "b".repeat(40),
    actor: { id: owner ? 2625904 : 900, type: owner ? "User" : "Bot" },
    repository: { id: 1309605115, full_name: repository },
    head_repository: { id: 1309605115, full_name: repository },
    status: "completed",
    conclusion: "success",
    run_attempt: 1,
  };
}
const generationWakeEnv = {
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_REF: "refs/heads/main",
  GITHUB_EVENT_NAME: "workflow_run",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-prepared.yml@refs/heads/main",
  TAVERNARY_PUBLISHER_BOT_ID: "900",
};
test.each([true, false])(
  "a completed explicit generation request survives a lost direct handoff (project=%s)",
  async (project) => {
    const run = generationWakeFixture(true, project);
    const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
      JSON.stringify(run),
    );
    expect(
      await runPreparedWakeCli({
        env: generationWakeEnv,
        runId: run.id,
        gh,
        write: () => {},
      }),
    ).toBe(0);
    expect(gh.mock.calls[1][0]).toEqual(
      expect.arrayContaining(["mode=prepare", "result_run_id=987"]),
    );
    expect(
      gh.mock.calls[1][0].some((value: string) =>
        value.startsWith("operation_key="),
      ),
    ).toBe(false);
  },
);
test.each(["success", "failure", "cancelled"])(
  "a %s generation completion reconciles accounting without publishing an artifact",
  async (conclusion) => {
    const run = { ...generationWakeFixture(false), conclusion };
    const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
      JSON.stringify(run),
    );
    expect(
      await runPreparedWakeCli({
        env: generationWakeEnv,
        runId: run.id,
        gh,
        write: () => {},
      }),
    ).toBe(0);
    expect(gh.mock.calls[1][0]).toContain("mode=reconcile");
    expect(gh.mock.calls[1][0]).not.toContain("mode=publish");
    expect(
      planPreparedWake({
        run,
        repository: generationWakeEnv.GITHUB_REPOSITORY,
        publisherActorId: 900,
      }),
    ).toBeNull();
  },
);
test.each([
  "actor",
  "origin",
  "attempt",
  "active",
  "title",
  "handler",
  "request-failed",
])("a forged or incomplete generation %s wake is ignored", async (variant) => {
  const run = generationWakeFixture(variant === "request-failed");
  const env = { ...generationWakeEnv };
  if (variant === "actor") run.actor.id++;
  if (variant === "origin") run.head_repository.id++;
  if (variant === "attempt") run.run_attempt++;
  if (variant === "active") run.status = "in_progress";
  if (variant === "title") run.display_title += " arbitrary";
  if (variant === "handler") env.GITHUB_WORKFLOW_REF = "other";
  if (variant === "request-failed") run.conclusion = "failure";
  const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
    JSON.stringify(run),
  );
  expect(
    await runPreparedWakeCli({ env, runId: run.id, gh, write: () => {} }),
  ).toBe(0);
  expect(gh).toHaveBeenCalledOnce();
});
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
  const gh = vi.fn<(args: string[]) => Promise<string>>(async () =>
    JSON.stringify(run),
  );
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
