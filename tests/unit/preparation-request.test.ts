import { expect, test, vi } from "vitest";
import {
  planPreparationRequest,
  runPreparationRequestCli,
} from "../../scripts/automation/preparation-request.mjs";
import { discoverKitOperations } from "../../scripts/automation/kit-operations.mjs";
import { discoverAutomationState } from "../../scripts/automation/inventory.mjs";
import { kitInventoryFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture() {
  const input = kitInventoryFixture();
  return {
    state: {
      repository: "MentallyQuill/Tavernary",
      operations: discoverKitOperations(input),
    } as AutomationInventoryState,
    workflow: "apply-kit-submission.yml",
    issueNumber: 42,
  };
}
test.each([false, true])(
  "a current request excludes only its own run and preserves another active producer (%s)",
  async (peer) => {
    const input = kitInventoryFixture();
    const revision = "d".repeat(40);
    const own = {
      id: 700,
      path: ".github/workflows/apply-kit-submission.yml",
      event: "workflow_dispatch",
      display_title: "Kit #42: Publish approved Kit",
      head_branch: "main",
      head_sha: revision,
      status: "in_progress",
      conclusion: null,
      created_at: new Date(input.nowMs).toISOString(),
      actor: { id: input.publisherActorId, type: "Bot" },
    };
    const state = {
      root: process.cwd(),
      repository: "MentallyQuill/Tavernary",
      publisherActorId: input.publisherActorId,
      nowMs: input.nowMs,
      receipts: [],
      remote: {
        issues: input.issues,
        pulls: [],
        runs: [...(peer ? [{ ...own, id: 699 }] : []), own],
        mainHeadSha: revision,
      },
      local: {
        projects: input.projects,
        sources: Object.values(input.sourcesById),
        snapshots: [],
        kits: [],
        blockedUsers: input.blockedUsers,
        deployments: [],
        revision,
        advisoryState: [],
        metadataState: [],
      },
      operations: [],
    } as unknown as AutomationInventoryState;
    state.operations = discoverAutomationState(state);
    const write = vi.fn();
    expect(
      await runPreparationRequestCli({
        env: {
          GITHUB_REPOSITORY: state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_ACTOR_ID: String(input.publisherActorId),
          TAVERNARY_PUBLISHER_BOT_ID: String(input.publisherActorId),
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_RUN_ID: "700",
          GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/apply-kit-submission.yml@refs/heads/main`,
        },
        event: { inputs: { issue_number: "42" } },
        load: async () => state,
        write,
      }),
    ).toBe(0);
    expect(JSON.parse(write.mock.calls[0][0]).action).toBe(
      peer ? "wait" : "dispatch",
    );
  },
);
test("an existing approved Kit entrypoint dispatches only its immutable current operation", () => {
  const input = fixture();
  expect(planPreparationRequest(input)).toEqual({
    action: "dispatch",
    workflow: input.workflow,
    inputs: {
      issue_number: "42",
      operation_key: input.state.operations[0].key,
    },
  });
});
test("manual, declined, superseded, or already published operations cannot trigger another preparation", () => {
  for (const stage of ["admitted", "published", "finalized"] as const) {
    const input = fixture();
    input.state.operations[0].stage = stage;
    expect(planPreparationRequest(input).action).toBe("wait");
  }
  const input = fixture();
  input.state.operations = [];
  expect(planPreparationRequest(input).action).toBe("wait");
});
test("a withdrawal entrypoint cannot substitute a different kind of operation", () => {
  const input = fixture();
  input.workflow = "apply-kit-withdrawal.yml";
  expect(planPreparationRequest(input).action).toBe("wait");
});
test.each([
  ".github/workflows/ci.yml",
  "../apply-kit-submission.yml",
  "arbitrary.yml",
])("request dispatch denies unknown workflow %s", (workflow) => {
  expect(() => planPreparationRequest({ ...fixture(), workflow })).toThrow();
});
test("invalid issue identities and permanently rejected input cannot bypass the request gate", () => {
  expect(() =>
    planPreparationRequest({ ...fixture(), issueNumber: 0 }),
  ).toThrow();
  const input = fixture();
  input.state.operations[0].retry = {
    failure: { kind: "permanent", reasonCode: "authorization-lost" },
    transientAttempts: 0,
    immediateAttempts: 0,
  };
  expect(planPreparationRequest(input).action).toBe("wait");
});

test("the real request CLI denies untrusted origin before reading privileged inventory", async () => {
  const load = vi.fn(async () => fixture().state);
  const env = {
    GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
    GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF:
      "MentallyQuill/Tavernary/.github/workflows/ci.yml@refs/heads/main",
  };
  expect(
    await runPreparationRequestCli({
      env,
      event: { inputs: { issue_number: "42" } },
      load,
      write: vi.fn(),
    }),
  ).toBe(1);
  expect(load).not.toHaveBeenCalled();
});

test("the actual withdrawal request adapter retains correction feedback without dispatching invalid input", async () => {
  const state = fixture().state;
  state.operations = [];
  const feedback = vi.fn(async () => {});
  const env = {
    GITHUB_REPOSITORY: state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/apply-kit-withdrawal.yml@refs/heads/main`,
  };
  const write = vi.fn();
  expect(
    await runPreparationRequestCli({
      env,
      event: { inputs: { issue_number: "42" } },
      load: async () => state,
      feedback,
      write,
    }),
  ).toBe(0);
  expect(feedback).toHaveBeenCalledWith({ state, issueNumber: 42 });
  expect(write).toHaveBeenCalledWith(JSON.stringify({ action: "wait" }));
});
