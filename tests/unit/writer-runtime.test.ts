import { mkdtemp, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
  runModelWriterPreparation,
} from "../../scripts/automation/writer-runtime.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
} from "../../scripts/automation/model-budget.mjs";
import { persistPreparedFailure } from "../../scripts/automation/prepared-failure.mjs";
import { operationFixture } from "../helpers/automation-fixtures";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";

test("the writer checks normalized cache before reserving any allowance", async () => {
  const fixture = await metadataMaintenanceFixture({ unchanged: true });
  const commit = vi.fn(async () => ({ sha: "c".repeat(40) }));
  const dispatchCached = vi.fn(async () => ({
    runId: 701,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const result = await runModelWriterPreparation({
    operationKey: fixture.operation.key,
    load: async () => fixture.state,
    commit,
    dispatchCached,
    metadataCached: async (input) => {
      const { metadataObservationIsCached } =
        await import("../../scripts/automation/metadata-preparation.mjs");
      return metadataObservationIsCached({
        ...input,
        observation: await fixture.observe(),
      });
    },
    env: {
      GITHUB_REPOSITORY: fixture.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${fixture.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(fixture.state.publisherActorId),
    },
  });
  expect(result.status).toBe("cache-dispatched");
  expect(commit).not.toHaveBeenCalled();
  expect(dispatchCached).toHaveBeenCalledOnce();
});

test("writer budget refusal records a durable daily retry without dispatch or budget mutation", async () => {
  const fixture = await metadataMaintenanceFixture();
  const reservation = reserveModelBudget(
    createModelBudgetState(fixture.state.nowMs),
    {
      operationKey: "c".repeat(64),
      model: "primary",
      requestCount: 40,
      requestedTokens: 200000,
    },
    { nowMs: fixture.state.nowMs },
  );
  if (!reservation.allowed) throw new Error("Fixture reservation failed");
  fixture.state.local.modelBudget = reservation.state;
  const commit = vi.fn(async () => ({ sha: "c".repeat(40) }));
  const dispatch = vi.fn(async () => ({
    runId: 701,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const receipt = vi.fn(
    async (value: { operation: typeof fixture.operation }) => {
      fixture.state.operations = [value.operation];
    },
  );
  const outcome = await runModelWriterPreparation({
    operationKey: fixture.operation.key,
    load: async () => fixture.state,
    commit,
    dispatch,
    metadataCached: async () => false,
    persistFailure: async (error) => {
      await persistPreparedFailure({
        operationKey: fixture.operation.key,
        load: async () => fixture.state,
        persist: receipt,
        error,
      });
    },
    env: {
      GITHUB_REPOSITORY: fixture.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${fixture.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      GITHUB_RUN_ID: "800",
      GITHUB_RUN_ATTEMPT: "1",
      TAVERNARY_PUBLISHER_BOT_ID: String(fixture.state.publisherActorId),
      UTILITY_MODEL: "primary",
    },
  });
  expect(outcome.status).toBe("waiting");
  expect(commit).not.toHaveBeenCalled();
  expect(dispatch).not.toHaveBeenCalled();
  expect(receipt).toHaveBeenCalledOnce();
  expect(fixture.state.operations[0].retry?.failure.reasonCode).toBe(
    "budget-exhausted",
  );
  expect(
    Date.parse(fixture.state.operations[0].nextEligibleAt!) -
      fixture.state.nowMs,
  ).toBe(86400000);
});

test("the actual writer mode commits primary and repair reservations before authenticated dispatch", async () => {
  const operation = operationFixture({
    identity: {
      ...operationFixture().identity,
      kind: "metadata",
      subject: "source:github-42:example-project",
    },
    stage: "admitted",
    expectedSha: null,
  });
  const env = {
    GITHUB_REPOSITORY: "Owner/Repo",
    GITHUB_REF: "refs/heads/main",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_ACTOR_ID: "2625904",
    GITHUB_WORKFLOW_REF:
      "Owner/Repo/.github/workflows/automation-writer.yml@refs/heads/main",
    GITHUB_RUN_ID: "800",
    GITHUB_RUN_ATTEMPT: "1",
    TAVERNARY_PUBLISHER_BOT_ID: "41",
    UTILITY_MODEL: "primary",
    TAVERNARY_ENRICHMENT_MODEL: "repair",
  };
  const nowMs = Date.parse("2026-10-08T12:00:00Z");
  let budget = createModelBudgetState(nowMs);
  const commit = vi.fn(async (input: { files: Array<{ content: string }> }) => {
    budget = JSON.parse(input.files[0].content);
    return { sha: "c".repeat(40) };
  });
  const dispatch = vi.fn(async () => ({
    runId: 700,
    workflow: ".github/workflows/enrich-catalog.yml",
  }));
  const load = async () => ({
    root: process.cwd(),
    repository: "Owner/Repo",
    publisherActorId: 41,
    nowMs,
    remote: { mainHeadSha: "b".repeat(40), issues: [], pulls: [], runs: [] },
    local: { revision: "b".repeat(40), modelBudget: budget },
    receipts: [],
    operations: [operation],
  });
  expect(
    (
      await runModelWriterPreparation({
        operationKey: operation.key,
        env,
        load,
        commit,
        dispatch,
        metadataCached: async () => false,
      })
    ).status,
  ).toBe("dispatched");
  expect(commit).toHaveBeenCalledTimes(2);
  expect(dispatch).toHaveBeenCalledOnce();
  expect(budget.days[0]).toMatchObject({ requests: 4, tokens: 195000 });
  expect(commit.mock.invocationCallOrder[0]).toBeLessThan(
    dispatch.mock.invocationCallOrder[0],
  );
});
test("writer synchronization fetches trusted main without exposing or persisting its scoped token", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-writer-"));
  const calls: Array<{ args: string[]; askpass?: string }> = [];
  const run = vi.fn(
    async (
      _command: string,
      args: string[],
      options: { env: NodeJS.ProcessEnv },
    ) => {
      calls.push({ args, askpass: options.env.GIT_ASKPASS });
      if (args[0] === "fetch") await access(options.env.GIT_ASKPASS!);
      return "";
    },
  );
  try {
    await synchronizeWriterCheckout({
      root,
      env: {
        GITHUB_REPOSITORY: "Owner/Repo",
        GH_TOKEN: "private-scoped-token",
        RUNNER_TEMP: root,
      },
      run,
    });
    expect(calls.map((call) => call.args)).toContainEqual([
      "fetch",
      "--no-tags",
      "https://github.com/Owner/Repo.git",
      "main",
    ]);
    expect(JSON.stringify(calls)).not.toContain("private-scoped-token");
    await expect(
      access(calls.find((call) => call.askpass)?.askpass!),
    ).rejects.toThrow();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("writer synchronization refuses to replace a checkout with tracked local changes", async () => {
  const run = vi.fn(async () => " M data/registry/projects/example.json\n");
  await expect(
    synchronizeWriterCheckout({
      root: process.cwd(),
      env: { GITHUB_REPOSITORY: "Owner/Repo", GH_TOKEN: "secret" },
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});

test("writer defers when trusted code, schemas or policy changed after its process started", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavernary-writer-policy-"));
  const run = vi.fn(async (_command: string, args: string[]) =>
    args[0] === "diff"
      ? "data/vocabularies/tags.json\nscripts/catalog/enrichment-provider.mjs\n"
      : "",
  );
  try {
    await expect(
      synchronizeWriterCheckout({
        root,
        env: {
          GITHUB_REPOSITORY: "Owner/Repo",
          GH_TOKEN: "secret",
          RUNNER_TEMP: root,
        },
        run,
      }),
    ).rejects.toMatchObject({ code: "input-superseded" });
    expect(run.mock.calls.some((call) => call[1][0] === "checkout")).toBe(
      false,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test("artifact download is bounded, binary, and restricted to the known GitHub artifact API", async () => {
  const run = vi.fn(async () => Buffer.from([1, 2, 3]));
  const args = ["api", "repos/Owner/Repo/actions/artifacts/42/zip"];
  expect(await downloadPreparedArtifact(args, { run })).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  expect(run).toHaveBeenCalledWith(
    "gh",
    args,
    expect.objectContaining({
      encoding: "buffer",
      maxBuffer: 33_554_432,
      timeout: 120_000,
    }),
  );
  await expect(
    downloadPreparedArtifact(["api", "https://foreign.invalid/artifact"], {
      run,
    }),
  ).rejects.toThrow();
  expect(run).toHaveBeenCalledTimes(1);
});
