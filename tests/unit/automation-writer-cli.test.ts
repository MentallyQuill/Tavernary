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
test.each([
  "retain",
  "confirm-restore",
  "backfill-identities",
  "verify-publisher",
])("the shared writer permits the trusted %s recovery mode", async (mode) => {
  let invoked = false;
  expect(
    await runAutomationWriterCli({
      env,
      event: { inputs: { mode, result_run_id: "88" } },
      handlers: {
        [mode]: async () => {
          invoked = true;
          return {};
        },
      },
      write: () => {},
    }),
  ).toBe(0);
  expect(invoked).toBe(true);
});
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

test.each([false, true])(
  "writer HTTP failures expose bounded status and rate-limit evidence without secrets (%s)",
  async (rateLimited) => {
    const output: string[] = [];
    const message = `gh api repos/MentallyQuill/Tavernary/actions/runs?token=secret failed: ${rateLimited ? "API rate limit exceeded" : "Resource not accessible by integration"} (HTTP 403); sensitive-provider-response`;
    expect(
      await runAutomationWriterCli({
        env,
        event: { inputs: { mode: "reconcile" } },
        handlers: {
          reconcile: async () => {
            throw new Error(message);
          },
        },
        write: (value) => output.push(value),
      }),
    ).toBe(1);
    expect(JSON.parse(output[0])).toMatchObject({
      status: "unavailable",
      diagnostic: {
        httpStatus: 403,
        githubRateLimited: rateLimited,
        githubRequestPath: "repos/MentallyQuill/Tavernary/actions/runs",
      },
    });
    expect(output.join("\n")).not.toContain("secret");
    expect(output.join("\n")).not.toContain("sensitive-provider-response");
  },
);

test.each([
  ["reconcile", 0, "superseded"],
  ["prepare", 1, "unavailable"],
  ["finalize", 1, "unavailable"],
  ["backfill-identities", 1, "unavailable"],
  ["verify-publisher", 1, "unavailable"],
] as const)(
  "a superseded %s writer wake preserves its recovery contract",
  async (mode, exitCode, status) => {
    const output: string[] = [];
    expect(
      await runAutomationWriterCli({
        env,
        event: { inputs: { mode } },
        handlers: {
          [mode]: async () => {
            throw Object.assign(new Error("private stale input detail"), {
              code: "input-superseded",
            });
          },
        },
        write: (value) => output.push(value),
      }),
    ).toBe(exitCode);
    expect(JSON.parse(output[0])).toEqual({
      status,
      failure: { kind: "superseded", reasonCode: "input-superseded" },
    });
    expect(output.join("\n")).not.toContain("private stale input detail");
  },
);

test.each(["provider-authentication-failed", "unexpected-failure"])(
  "writer errors other than supersession remain failed (%s)",
  async (code) => {
    const output: string[] = [];
    expect(
      await runAutomationWriterCli({
        env,
        event: { inputs: { mode: "reconcile" } },
        handlers: {
          reconcile: async () => {
            throw Object.assign(new Error("private failure detail"), { code });
          },
        },
        write: (value) => output.push(value),
      }),
    ).toBe(1);
    expect(JSON.parse(output[0]).status).toBe("unavailable");
    expect(output.join("\n")).not.toContain("private failure detail");
  },
);
