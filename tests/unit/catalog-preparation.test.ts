import { expect, test, vi } from "vitest";
import {
  prepareCatalogOperation,
  assertCatalogPreparationContext,
} from "../../scripts/automation/catalog-preparation.mjs";
import { preparedResultContextFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture() {
  const context = preparedResultContextFixture();
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: context.currentState.repository,
    publisherActorId: context.publisherActorId,
    nowMs: Date.now(),
    operations: [context.operation],
    receipts: [],
    local: { revision: context.run.head_sha },
    remote: {
      mainHeadSha: context.run.head_sha,
      issues: [],
      pulls: [],
      runs: [],
    },
  };
  const producer = {
    workflow: context.run.path,
    runId: context.run.id,
    sourceSha: context.run.head_sha,
  };
  const acquire = vi.fn(async () => ({
    [context.currentState.allowedPaths[0]]:
      '{"source_id":"github-42","repository_id":42}',
  }));
  return {
    state,
    operation: context.operation,
    producer,
    acquire,
    context: async () => context.currentState,
  };
}
test("the preparation adapter emits only changed validated data from its pinned base", async () => {
  const input = fixture();
  const result = await prepareCatalogOperation(input);
  expect(result?.operationKey).toBe(input.operation.key);
  expect(result?.producer).toEqual(input.producer);
  expect(input.acquire).toHaveBeenCalledTimes(1);
});
test("a superseded operation cannot consume acquisition resources", async () => {
  const input = fixture();
  input.state.operations = [];
  await expect(prepareCatalogOperation(input)).rejects.toThrow();
  expect(input.acquire).not.toHaveBeenCalled();
});
test("an acquisition attempt cannot add executable or unrelated data to its envelope", async () => {
  const input = fixture();
  input.acquire.mockResolvedValue({
    ".github/workflows/ci.yml": "evil",
    "data/snapshots/github/github-42.json":
      '{"source_id":"github-42","repository_id":42}',
  });
  await expect(prepareCatalogOperation(input)).rejects.toThrow();
});
test.each(["owner", "branch", "checkout", "workflow"])(
  "untrusted preparation %s is denied before acquisition",
  (variant) => {
    const input = fixture();
    const env = {
      GITHUB_REPOSITORY: input.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: String(input.state.publisherActorId),
      GITHUB_SHA: input.producer.sourceSha,
      GITHUB_RUN_ID: String(input.producer.runId),
      GITHUB_WORKFLOW_REF: `${input.state.repository}/${input.producer.workflow}@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
    };
    if (variant === "owner") env.GITHUB_ACTOR_ID = "2625904";
    if (variant === "branch") env.GITHUB_REF = "refs/heads/foreign";
    if (variant === "checkout") env.GITHUB_SHA = "d".repeat(40);
    if (variant === "workflow")
      env.GITHUB_WORKFLOW_REF = `${input.state.repository}/.github/workflows/ci.yml@refs/heads/main`;
    expect(() =>
      assertCatalogPreparationContext({
        state: input.state,
        operation: input.operation,
        env,
      }),
    ).toThrow();
  },
);
