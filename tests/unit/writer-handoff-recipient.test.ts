import { expect, test } from "vitest";
import { discoverAutomationState } from "../../scripts/automation/inventory.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { runModelWriterPreparation } from "../../scripts/automation/writer-runtime.mjs";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";

async function recipient(otherWriter = false) {
  const fixture = await metadataMaintenanceFixture();
  const state: AutomationInventoryState = {
    ...fixture.state,
    local: {
      ...fixture.state.local,
      deployments: [],
      kits: [],
      blockedUsers: { blocked: [] },
    },
    executingWriterRunId: 800,
  };
  const run = {
    id: 800,
    run_attempt: 1,
    path: ".github/workflows/automation-writer.yml",
    event: "workflow_dispatch",
    display_title: `Automation write prepare ${fixture.operation.key}`,
    actor: { id: state.publisherActorId, type: "Bot" },
    head_branch: "main",
    head_sha: state.local.revision as string,
    head_repository: { full_name: state.repository },
    status: "in_progress",
    conclusion: null,
    created_at: fixture.operation.createdAt,
    updated_at: new Date(state.nowMs).toISOString(),
  };
  state.remote.runs = [
    run,
    ...(otherWriter ? [{ ...run, id: 801, status: "queued" }] : []),
  ];
  let dispatches = 0;
  const result = await runModelWriterPreparation({
    operationKey: fixture.operation.key,
    load: async () => ({
      ...state,
      operations: discoverAutomationState(state),
    }),
    metadataCached: async () => true,
    dispatchCached: async () => {
      dispatches++;
      return { runId: 900, workflow: ".github/workflows/enrich-catalog.yml" };
    },
    env: {
      GITHUB_REPOSITORY: state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
    },
  });
  return { result, dispatches };
}

test("the canonical prepare recipient executes after excluding only its own running handoff", async () => {
  const { result, dispatches } = await recipient();
  expect(result.status).toBe("cache-dispatched");
  expect(dispatches).toBe(1);
});

test("another same-key active writer still blocks the canonical prepare recipient", async () => {
  const { result, dispatches } = await recipient(true);
  expect(result.status).toBe("superseded");
  expect(dispatches).toBe(0);
});
