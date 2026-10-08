import { expect, test } from "vitest";
import { runReconcileAutomationCli } from "../../scripts/automation/reconcile-cli.mjs";
import { operationFixture } from "../helpers/automation-fixtures";

test("the CLI defaults to a mutation-free dry run with reviewable selected keys", async () => {
  let writes = 0;
  let dispatches = 0;
  const output: string[] = [];
  const code = await runReconcileAutomationCli({
    args: [],
    inventory: async () => [operationFixture()],
    receipts: [],
    dispatch: async () => {
      dispatches++;
      return {};
    },
    persist: async () => {
      writes++;
    },
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(writes).toBe(0);
  expect(dispatches).toBe(0);
  expect(JSON.parse(output[0]).selectedKeys).toHaveLength(1);
});

test("the CLI rejects untrusted apply before loading or mutating inventory", async () => {
  let loaded = 0;
  const code = await runReconcileAutomationCli({
    args: ["--apply"],
    env: {
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_REF: "refs/heads/feature",
    },
    inventory: async () => {
      loaded++;
      return [];
    },
    write: () => {},
  });
  expect(code).toBe(1);
  expect(loaded).toBe(0);
});

test("authorized apply executes the production controller and keeps unsafe errors out of output", async () => {
  const output: string[] = [];
  let dispatched = 0;
  const code = await runReconcileAutomationCli({
    args: ["--apply"],
    env: {
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
    },
    inventory: async () => [operationFixture()],
    receipts: [],
    revalidate: async (operation) => operation,
    dispatch: async () => {
      dispatched++;
      throw Object.assign(new Error("private credentials"), { status: 403 });
    },
    persist: async () => {},
    write: (value) => output.push(value),
  });
  expect(code).toBe(0);
  expect(dispatched).toBe(1);
  expect(JSON.parse(output[0]).incidents).toBe(1);
  expect(output.join("\n")).not.toContain("private credentials");
});

test("the CLI rejects unknown arguments and limits above twenty", async () => {
  for (const args of [["--unknown"], ["--limit", "21"]])
    expect(await runReconcileAutomationCli({ args, write: () => {} })).toBe(1);
});

test("privileged controller execution cannot bypass the serialized writer", async () => {
  let loaded = false;
  const code = await runReconcileAutomationCli({
    args: ["--apply"],
    env: {
      GITHUB_REF: "refs/heads/main",
      GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF:
        "MentallyQuill/Tavernary/.github/workflows/reconcile-automation.yml@refs/heads/main",
    },
    inventory: async () => {
      loaded = true;
      return [];
    },
    write: () => {},
  });
  expect(code).toBe(1);
  expect(loaded).toBe(false);
});
