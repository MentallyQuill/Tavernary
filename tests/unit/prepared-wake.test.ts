import { expect, test, vi } from "vitest";
import {
  planPreparedWake,
  selectPreparedWakes,
  runPreparedWakeCli,
} from "../../scripts/automation/prepared-wake.mjs";
import { preparedResultContextFixture } from "../helpers/automation-fixtures";
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
