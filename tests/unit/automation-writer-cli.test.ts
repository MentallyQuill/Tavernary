import { expect, test } from "vitest";
import { runAutomationWriterCli } from "../../scripts/automation/writer-cli.mjs";

const env = {
  GITHUB_REF: "refs/heads/main",
  GITHUB_REPOSITORY: "MentallyQuill/Tavernary",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_ACTOR_ID: "2625904",
  GITHUB_WORKFLOW_REF:
    "MentallyQuill/Tavernary/.github/workflows/automation-writer.yml@refs/heads/main",
};
test("only the trusted serialized workflow may invoke privileged reconciliation", async () => {
  let reconciled = 0;
  expect(
    await runAutomationWriterCli({
      env,
      event: { inputs: { mode: "reconcile" } },
      handlers: {
        reconcile: async () => {
          reconciled++;
          return { dispatched: 1 };
        },
      },
      write: () => {},
    }),
  ).toBe(0);
  expect(reconciled).toBe(1);
  expect(
    await runAutomationWriterCli({
      env: {
        ...env,
        GITHUB_WORKFLOW_REF:
          "MentallyQuill/Tavernary/.github/workflows/ci.yml@refs/heads/main",
      },
      event: { inputs: { mode: "reconcile" } },
      handlers: {
        reconcile: async () => {
          reconciled++;
          return {};
        },
      },
      write: () => {},
    }),
  ).toBe(1);
  expect(reconciled).toBe(1);
});
test("unknown writer modes fail without effects or raw diagnostics", async () => {
  const output: string[] = [];
  expect(
    await runAutomationWriterCli({
      env,
      event: { inputs: { mode: "arbitrary-command" } },
      handlers: {},
      write: (value) => output.push(value),
    }),
  ).toBe(1);
  expect(output.join("\n")).not.toContain("arbitrary-command");
});
