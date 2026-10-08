import { execFileSync } from "node:child_process";
import { expect, test, vi } from "vitest";
import {
  loadProjectMergePlan,
  publishProjectOperation,
  mergeExactProjectHead,
} from "../../scripts/automation/project-merge.mjs";
import { projectInventoryFixture } from "../helpers/automation-fixtures";
import { discoverProjectOperations } from "../../scripts/automation/project-operations.mjs";
import {
  parseProjectPublicationTransaction,
  PROJECT_PUBLICATION_TRANSACTION_MARKER,
} from "../../scripts/publication/project-publication-transaction.mjs";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import { runProjectWriterReconciliation } from "../../scripts/automation/writer-runtime.mjs";

function fixture() {
  const input = projectInventoryFixture({
    generatedPull: { mergeable: true } as never,
    validationRun: {},
  });
  input.issues[0].labels.push("submission-pr-open");
  const revision = execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const transaction = parseProjectPublicationTransaction(input.pulls[0].body)!;
  transaction.base_sha = revision;
  input.pulls[0].body = `${PROJECT_PUBLICATION_TRANSACTION_MARKER}\n${JSON.stringify(transaction)}\n-->`;
  const operation = discoverProjectOperations(input)[0];
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: input.publisherActorId,
    nowMs: input.nowMs,
    operations: [operation],
    receipts: [],
    remote: {
      mainHeadSha: revision,
      pulls: input.pulls,
      issues: input.issues,
      runs: input.runs,
    },
    local: {
      ...input.catalog,
      revision,
      trustedEditors: { schema_version: 1, editors: [] },
    },
  };
  const gh = vi.fn(async (args: string[]) => {
    const path = args.find(
      (arg) => arg.startsWith("repos/") || arg.startsWith("repositories/"),
    )!;
    if (path.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      return JSON.stringify({ value: "true" });
    if (path.endsWith("/pulls/84")) return JSON.stringify(input.pulls[0]);
    if (path.endsWith("/issues/42")) return JSON.stringify(input.issues[0]);
    if (path.endsWith("/pulls/84/files"))
      return JSON.stringify([
        transaction.generated_paths.map((filename) => ({ filename })),
      ]);
    if (path.endsWith("/runs/701"))
      return JSON.stringify({
        ...input.runs[0],
        id: 701,
        name: "Site: Validate changes",
        path: ".github/workflows/ci.yml",
        event: "workflow_dispatch",
        head_branch: input.pulls[0].head.ref,
        head_sha: input.pulls[0].head.sha,
        status: "completed",
        conclusion: "success",
        head_repository: { full_name: state.repository },
        actor: { id: state.publisherActorId, type: "Bot" },
      });
    if (path === "repositories/42")
      return JSON.stringify({ id: 42, owner: { id: 1, type: "User" } });
    throw new Error(`Unexpected request ${path}`);
  });
  return { state, operation, gh, input };
}

function writerEnv(state: AutomationInventoryState) {
  return {
    GITHUB_REPOSITORY: state.repository,
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: String(state.publisherActorId),
    TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
    GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    GITHUB_TOKEN: "test-status-token",
    GH_TOKEN: "test-publisher-token",
  };
}

test("the actual writer handler pauses a validated project without any write when the emergency switch is off", async () => {
  const input = fixture();
  const original = input.gh.getMockImplementation()!;
  input.gh.mockImplementation((args) =>
    args.some((arg) => arg.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      ? Promise.resolve(JSON.stringify({ value: "false" }))
      : original(args),
  );
  const result = await runProjectWriterReconciliation({
    operationKey: input.operation.key,
    env: writerEnv(input.state),
    load: async () => input.state,
    gh: input.gh,
  });
  expect(result).toMatchObject({ published: 0, waiting: 1 });
  expect(
    input.gh.mock.calls.some(
      ([args]) =>
        args.includes("PUT") || args.includes("POST") || args.includes("PATCH"),
    ),
  ).toBe(false);
});

test("the real writer rechecks the emergency switch immediately before its exact-head merge", async () => {
  const input = fixture();
  const original = input.gh.getMockImplementation()!;
  let switchReads = 0;
  input.gh.mockImplementation((args) =>
    args.some((arg) => arg.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      ? Promise.resolve(
          JSON.stringify({ value: ++switchReads < 3 ? "true" : "false" }),
        )
      : original(args),
  );
  await expect(
    runProjectWriterReconciliation({
      operationKey: input.operation.key,
      env: writerEnv(input.state),
      load: async () => input.state,
      gh: input.gh,
    }),
  ).rejects.toMatchObject({ code: "input-superseded" });
  expect(switchReads).toBe(3);
  expect(
    input.gh.mock.calls.some(
      ([args]) =>
        args.includes("PUT") || args.includes("POST") || args.includes("PATCH"),
    ),
  ).toBe(false);
});

test("the production merge adapter requires exact CI, numeric Publisher custody, paths, and fresh mutable input", async () => {
  const input = fixture();
  expect((await loadProjectMergePlan(input)).action).toBe("merge");
  input.input.issues[0].labels.push("submission-declined");
  expect((await loadProjectMergePlan(input)).action).toBe("reject");
  input.input.issues[0].labels.pop();
  input.input.pulls[0].user.id = 99;
  expect((await loadProjectMergePlan(input)).action).toBe("reject");
});

test("an emergency switch read at publication time pauses an otherwise valid generated head", async () => {
  const input = fixture();
  const original = input.gh.getMockImplementation()!;
  input.gh.mockImplementation((args) =>
    args.some((arg) => arg.endsWith("PROJECT_AUTO_PUBLICATION_ENABLED"))
      ? Promise.resolve(JSON.stringify({ value: "false" }))
      : original(args),
  );
  expect((await loadProjectMergePlan(input)).action).toBe("paused");
});

test("project publication uses the common publisher and recovers merged canonical proof without a second merge", async () => {
  const input = fixture();
  const published = {
    ...input.operation,
    stage: "published" as const,
    expectedSha: "d".repeat(40),
  };
  input.state.operations = [published];
  const merge = vi.fn();
  const persist = vi.fn(async () => {});
  const result = await publishProjectOperation({
    operationKey: published.key,
    load: async () => input.state,
    plan: vi.fn(async () => {
      throw new Error("No planner needed for canonical recovery");
    }),
    merge,
    persist,
  });
  expect(result.recovered).toBe(1);
  expect(merge).not.toHaveBeenCalled();
  expect(persist).toHaveBeenCalledOnce();
});

test("the actual merge request binds the validated head and rejects unconfirmed API responses", async () => {
  const input = fixture();
  const decision = await loadProjectMergePlan(input);
  if (decision.action !== "merge") throw new Error("Fixture must be mergeable");
  const action = {
    ...decision,
    operationKeys: [input.operation.key],
    expectedMainSha: input.state.remote.mainHeadSha,
  };
  const gh = vi.fn(async (_args: string[], _body?: string) =>
    JSON.stringify({ merged: true, sha: "d".repeat(40) }),
  );
  expect(
    await mergeExactProjectHead({
      repository: input.state.repository,
      gh,
      action,
    }),
  ).toEqual({ sha: "d".repeat(40) });
  expect(JSON.parse(gh.mock.calls[0][1]!)).toMatchObject({
    sha: action.expectedHeadSha,
    merge_method: "squash",
  });
  gh.mockResolvedValue(JSON.stringify({ merged: false, sha: "d".repeat(40) }));
  await expect(
    mergeExactProjectHead({ repository: input.state.repository, gh, action }),
  ).rejects.toThrow(/unconfirmed/);
});
