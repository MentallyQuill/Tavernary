import { mkdtemp, access, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { expect, test, vi } from "vitest";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
  runModelWriterPreparation,
  runReconciledFinalization,
  runAutomationWriterReconciliation,
} from "../../scripts/automation/writer-runtime.mjs";
import {
  createModelBudgetState,
  reserveModelBudget,
} from "../../scripts/automation/model-budget.mjs";
import { persistPreparedFailure } from "../../scripts/automation/prepared-failure.mjs";
import { operationFixture } from "../helpers/automation-fixtures";
import { metadataMaintenanceFixture } from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import type { AutomationReceipt } from "../../scripts/automation/receipts.mjs";
import {
  preparedReplayFixture,
  diagnosticReplayFixture,
} from "../helpers/prepared-replay-fixtures";
import { operationKey } from "../../scripts/automation/operation.mjs";
import * as inventory from "../../scripts/automation/inventory.mjs";
import * as githubInventory from "../../scripts/automation/github-inventory.mjs";
import { recoverInventoryWorker } from "../../scripts/automation/inventory-worker.mjs";

test("twenty obsolete diagnostics use independent scoped reads and retain the parent full reload", async () => {
  const base = preparedReplayFixture();
  base.receipt.operation.retry = {
    failure: { kind: "transient", reasonCode: "provider-rate-limited" },
    transientAttempts: 1,
    immediateAttempts: 0,
  };
  const fixtures = Array.from({ length: 20 }, (_, index) => {
    const identity = {
      ...base.receipt.operation.identity,
      subject: `source:github-${index + 1}:project-${index + 1}`,
    };
    return diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
        },
      },
      base.run.id + index * 2,
      base.run.updated_at,
    );
  });
  const state = {
    ...base.state,
    operations: fixtures.map((value) => value.state.operations[0]),
    receipts: fixtures.map((value) => value.receipt),
    remote: { ...base.state.remote, runs: fixtures.map((value) => value.run) },
  };
  const load = vi.fn(async () => structuredClone(state));
  const loadDiagnostic = vi.fn(async () => structuredClone(state));
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockResolvedValue(undefined);
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    async (args: string[]) => {
      const runId = Number(
        /\/actions\/runs\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
      );
      const fixture = fixtures.find((value) => value.run.id === runId);
      if (!fixture) throw new Error("No other remote effects expected");
      return fixture.reader.gh(args);
    },
    {
      download: async (args: string[]) => {
        const artifactId = Number(
          /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
        );
        return fixtures
          .find((value) => value.artifact.id === artifactId)!
          .reader.download();
      },
    },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load,
      loadDiagnostic,
      gh,
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      },
    } as Parameters<typeof runAutomationWriterReconciliation>[0]);
    expect(result.prepared).toMatchObject({
      failures: 0,
      consumedKeys: [],
      reloadRequired: true,
    });
    expect(loadDiagnostic).toHaveBeenCalledTimes(20);
    expect(load).toHaveBeenCalledTimes(2);
    expect(persist).not.toHaveBeenCalled();
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test("twenty equal-clock diagnostics each reread failure authority and retain exact new counters and deadlines", async () => {
  const base = preparedReplayFixture();
  base.receipt.updatedAt = base.run.updated_at;
  base.receipt.operation.retry!.transientAttempts = 1;
  base.receipt.operation.retry!.immediateAttempts = 2;
  const fixtures = Array.from({ length: 20 }, (_, index) => {
    const identity = {
      ...base.receipt.operation.identity,
      subject: `source:github-${index + 1}:project-${index + 1}`,
    };
    return diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
        },
      },
      base.run.id + index * 2,
      base.run.updated_at,
    );
  });
  const state = {
    ...base.state,
    operations: fixtures.map((value) => value.state.operations[0]),
    receipts: fixtures.map((value) => value.receipt),
    remote: { ...base.state.remote, runs: fixtures.map((value) => value.run) },
  };
  const load = vi.fn(async () => structuredClone(state));
  const loadDiagnostic = vi.fn(async () => structuredClone(state));
  const writes: AutomationReceipt[] = [];
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      writes.push(receipt);
      state.receipts = state.receipts.map((value) =>
        value.operation.key === receipt.operation.key ? receipt : value,
      );
      state.operations = state.operations.map((value) =>
        value.key === receipt.operation.key ? receipt.operation : value,
      );
    });
  const gh = Object.assign(
    async (args: string[]) => {
      const runId = Number(
        /\/actions\/runs\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
      );
      const fixture = fixtures.find((value) => value.run.id === runId);
      if (!fixture) throw new Error("No other remote effects expected");
      return fixture.reader.gh(args);
    },
    {
      download: async (args: string[]) => {
        const artifactId = Number(
          /\/actions\/artifacts\/([1-9]\d*)/u.exec(args.join(" "))?.[1],
        );
        return fixtures
          .find((value) => value.artifact.id === artifactId)!
          .reader.download();
      },
    },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load,
      loadDiagnostic,
      gh,
      env: {
        GITHUB_REPOSITORY: state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(state.publisherActorId),
      },
    });
    expect(result.prepared).toMatchObject({
      failures: 20,
      consumedKeys: fixtures.map((value) => value.receipt.operation.key).sort(),
    });
    expect(loadDiagnostic).toHaveBeenCalledTimes(40);
    expect(writes).toHaveLength(20);
    for (const receipt of writes)
      expect(receipt).toMatchObject({
        updatedAt: new Date(state.nowMs).toISOString(),
        operation: {
          retry: {
            failure: { kind: "unknown", reasonCode: "unclassified-failure" },
            transientAttempts: 2,
            immediateAttempts: 3,
          },
          nextEligibleAt: "2026-10-17T00:25:23.917Z",
        },
      });
  } finally {
    persist.mockRestore();
  }
});

test.each(["missing", "corrupt"])(
  "an unverifiable %s diagnostic artifact keeps both comparison and ordinary failure on full authority",
  async (variant) => {
    const input = preparedReplayFixture();
    input.state.operations[0].retry!.immediateAttempts = 1;
    input.state.receipts[0].operation.retry!.immediateAttempts = 1;
    const load = vi.fn(async () => structuredClone(input.state));
    const loadDiagnostic = vi.fn(async () => structuredClone(input.state));
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) =>
            value.includes(`/actions/runs/${input.run.id}/artifacts`),
          )
        )
          return variant === "missing"
            ? JSON.stringify([{ total_count: 0, artifacts: [] }])
            : input.reader.gh(args);
        if (
          args.some((value) => value.endsWith(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      {
        download:
          variant === "corrupt"
            ? async () => new Uint8Array([0, 1])
            : input.reader.download,
      },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        loadDiagnostic,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toMatchObject({
        failures: 1,
        consumedKeys: [input.receipt.operation.key],
      });
      expect(loadDiagnostic).not.toHaveBeenCalled();
      expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(persist).toHaveBeenCalledOnce();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test.each(["comparison", "persistence"])(
  "a scoped %s outage stays visible without fabricating a producer failure",
  async (phase) => {
    const input = preparedReplayFixture();
    input.state.receipts[0].updatedAt = input.run.updated_at;
    let observations = 0;
    const loadDiagnostic = vi.fn(async () => {
      observations++;
      if (phase === "comparison" || observations === 2)
        throw new Error("Fresh scoped inspection unavailable");
      return structuredClone(input.state);
    });
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) => value.includes(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      { download: input.reader.download },
    );
    try {
      await expect(
        runAutomationWriterReconciliation({
          load: async () => structuredClone(input.state),
          loadDiagnostic,
          gh,
          env: {
            GITHUB_REPOSITORY: input.state.repository,
            GITHUB_REF: "refs/heads/main",
            GITHUB_EVENT_NAME: "workflow_dispatch",
            GITHUB_ACTOR_ID: "2625904",
            GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
            TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
          },
        }),
      ).rejects.toThrow("Fresh scoped inspection unavailable");
      expect(observations).toBe(phase === "comparison" ? 1 : 2);
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
    }
  },
);

test.each(["kit", "withdrawal", "enrichment", "report-import"] as const)(
  "the unsupported %s collector family keeps full runtime comparison authority",
  async (kind) => {
    const base = preparedReplayFixture();
    const identity = { ...base.receipt.operation.identity, kind };
    const input = diagnosticReplayFixture(
      {
        ...base.receipt,
        operation: {
          ...base.receipt.operation,
          identity,
          key: operationKey(identity),
          retry: {
            failure: { kind: "transient", reasonCode: "provider-rate-limited" },
            transientAttempts: 1,
            immediateAttempts: 0,
          },
        },
      },
      base.run.id,
      base.run.updated_at,
    );
    input.run.path = `.github/workflows/${{ kit: "apply-kit-submission", withdrawal: "apply-kit-withdrawal", enrichment: "enrich-catalog", "report-import": "import-tavernkeeper-reports" }[kind]}.yml`;
    const load = vi.fn(async () => structuredClone(input.state));
    const loadDiagnostic = vi.fn(async () => structuredClone(input.state));
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      async (args: string[]) => {
        if (
          args.some((value) => value.includes(`/actions/runs/${input.run.id}`))
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      },
      { download: input.reader.download },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        loadDiagnostic,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toMatchObject({
        failures: 0,
        consumedKeys: [],
        reloadRequired: true,
      });
      expect(loadDiagnostic).not.toHaveBeenCalled();
      expect(load.mock.calls.length).toBeGreaterThanOrEqual(3);
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test("a lost successful failure-write response can later be superseded by its newer canonical decision", async () => {
  const input = preparedReplayFixture();
  input.receipt.updatedAt = "2026-10-14T16:19:00.000Z";
  input.receipt.operation.retry!.immediateAttempts = 2;
  input.receipt.operation.retry!.transientAttempts = 1;
  input.state.receipts = [structuredClone(input.receipt)];
  input.state.operations = [structuredClone(input.receipt.operation)];
  recoverInventoryWorker(
    input.state.operations[0],
    { ...input.state, runs: [input.run] },
    [],
  );
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      input.state.receipts = [structuredClone(receipt)];
      input.state.operations = [structuredClone(receipt.operation)];
      throw new Error("Successful write response lost");
    });
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    vi.fn(async (args: string[]) => {
      if (
        args.some((argument) =>
          argument.includes(`/actions/runs/${input.run.id}`),
        )
      )
        return input.reader.gh(args);
      throw new Error("No dispatch expected");
    }),
    { download: input.reader.download },
  );
  const options = {
    load: async () => structuredClone(input.state),
    gh,
    env: {
      GITHUB_REPOSITORY: input.state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
      TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
    },
  };
  try {
    await expect(runAutomationWriterReconciliation(options)).rejects.toThrow(
      "Successful write response lost",
    );
    expect(input.state.receipts[0].operation.retry).toMatchObject({
      immediateAttempts: 3,
      transientAttempts: 2,
    });
    input.state.nowMs = Date.parse(input.state.operations[0].nextEligibleAt!);
    recoverInventoryWorker(
      input.state.operations[0],
      { ...input.state, runs: [input.run] },
      [],
    );
    const before = JSON.stringify(input.state.receipts);
    const result = await runAutomationWriterReconciliation(options);
    expect(result.prepared).toMatchObject({
      failures: 0,
      consumedKeys: [],
      reloadRequired: true,
    });
    expect(result.controller).toMatchObject({
      selectedKeys: [input.receipt.operation.key],
      dispatched: 0,
    });
    expect(JSON.stringify(input.state.receipts)).toBe(before);
    expect(persist).toHaveBeenCalledOnce();
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test("a new unknown producer after its prior receipt still reaches the daily incident threshold in the actual writer", async () => {
  const input = preparedReplayFixture();
  input.receipt.operation.retry!.immediateAttempts = 2;
  input.receipt.operation.retry!.transientAttempts = 1;
  input.state.receipts = [structuredClone(input.receipt)];
  input.state.operations = [structuredClone(input.receipt.operation)];
  input.state.receipts[0].updatedAt = "2026-10-16T09:45:00.000Z";
  input.state.receipts[0].operation.nextEligibleAt = "2026-10-16T10:00:26.370Z";
  input.state.operations = [structuredClone(input.state.receipts[0].operation)];
  input.run.updated_at = "2026-10-16T10:06:00.000Z";
  input.run.created_at = "2026-10-16T10:05:00.000Z";
  input.state.nowMs = Date.parse("2026-10-16T12:00:00.000Z");
  recoverInventoryWorker(
    input.state.operations[0],
    { ...input.state, runs: [input.run] },
    [],
  );
  expect(input.state.operations[0].nextEligibleAt).toBeNull();
  const persist = vi
    .spyOn(githubInventory, "persistGithubAutomationReceipt")
    .mockImplementation(async ({ receipt }) => {
      input.state.receipts = [structuredClone(receipt)];
      input.state.operations = [structuredClone(receipt.operation)];
    });
  const revalidate = vi
    .spyOn(inventory, "revalidateAutomationOperation")
    .mockResolvedValue(null);
  const gh = Object.assign(
    vi.fn(async (args: string[]) => {
      if (
        args.some((argument) =>
          argument.includes(`/actions/runs/${input.run.id}`),
        )
      )
        return input.reader.gh(args);
      throw new Error("No dispatch expected");
    }),
    { download: input.reader.download },
  );
  try {
    const result = await runAutomationWriterReconciliation({
      load: async () => structuredClone(input.state),
      gh,
      env: {
        GITHUB_REPOSITORY: input.state.repository,
        GITHUB_REF: "refs/heads/main",
        GITHUB_EVENT_NAME: "workflow_dispatch",
        GITHUB_ACTOR_ID: "2625904",
        GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
        TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
      },
    });
    expect(result.prepared).toMatchObject({
      failures: 1,
      consumedKeys: [input.receipt.operation.key],
    });
    expect(input.state.receipts[0]).toMatchObject({
      operation: {
        retry: {
          failure: { kind: "unknown", reasonCode: "unclassified-failure" },
          immediateAttempts: 3,
          transientAttempts: 2,
        },
        nextEligibleAt: "2026-10-17T12:00:00.000Z",
      },
    });
    expect(persist).toHaveBeenCalledOnce();
    expect(revalidate).not.toHaveBeenCalled();
    expect(result.controller).toMatchObject({
      dispatched: 0,
      selectedKeys: [],
    });
  } finally {
    persist.mockRestore();
    revalidate.mockRestore();
  }
});

test.each(["due", "future", "permanent", "head"])(
  "the actual writer reloads an obsolete no-effect result before guarded %s selection",
  async (freshDecision) => {
    const input = preparedReplayFixture();
    let loads = 0;
    const load = vi.fn(async () => {
      const state = structuredClone(input.state);
      loads++;
      if (loads >= 3) {
        if (freshDecision === "future")
          state.operations[0].nextEligibleAt = "2026-10-17T00:25:23.917Z";
        if (freshDecision === "permanent") {
          state.operations[0].retry!.failure = {
            kind: "permanent",
            reasonCode: "authorization-lost",
          };
          state.operations[0].nextEligibleAt = null;
        }
        if (freshDecision === "head")
          state.operations[0].expectedSha = "c".repeat(40);
        state.receipts[0].operation = structuredClone(state.operations[0]);
      }
      state.local.observedLoad = loads;
      return state;
    });
    const persist = vi
      .spyOn(githubInventory, "persistGithubAutomationReceipt")
      .mockResolvedValue(undefined);
    const revalidate = vi
      .spyOn(inventory, "revalidateAutomationOperation")
      .mockResolvedValue(null);
    const gh = Object.assign(
      vi.fn(async (args: string[]) => {
        if (
          args.some((argument) =>
            argument.includes(`/actions/runs/${input.run.id}`),
          )
        )
          return input.reader.gh(args);
        throw new Error("No other remote effects expected");
      }),
      { download: input.reader.download },
    );
    try {
      const result = await runAutomationWriterReconciliation({
        load,
        gh,
        env: {
          GITHUB_REPOSITORY: input.state.repository,
          GITHUB_REF: "refs/heads/main",
          GITHUB_EVENT_NAME: "workflow_dispatch",
          GITHUB_ACTOR_ID: "2625904",
          GITHUB_WORKFLOW_REF: `${input.state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
          TAVERNARY_PUBLISHER_BOT_ID: String(input.state.publisherActorId),
        },
      });
      expect(result.prepared).toEqual({
        published: 0,
        recovered: 0,
        failures: 0,
        consumedKeys: [],
        reloadRequired: true,
      });
      expect(result.controller).toMatchObject({
        selectedKeys: ["due", "head"].includes(freshDecision)
          ? [input.receipt.operation.key]
          : [],
        dispatched: 0,
      });
      if (["due", "head"].includes(freshDecision))
        expect(revalidate).toHaveBeenCalledWith(
          expect.objectContaining({
            state: expect.objectContaining({
              local: expect.objectContaining({ observedLoad: 3 }),
            }),
            operation: expect.objectContaining({
              expectedSha: freshDecision === "head" ? "c".repeat(40) : null,
            }),
          }),
        );
      else expect(revalidate).not.toHaveBeenCalled();
      expect(persist).not.toHaveBeenCalled();
    } finally {
      persist.mockRestore();
      revalidate.mockRestore();
    }
  },
);

test("inline finalization recovers the actual terminal receipt after its successful write loses the response", async () => {
  const operation = operationFixture({
    identity: { ...operationFixture().identity, kind: "metadata" },
    stage: "deployment-confirmed",
  });
  const state: AutomationInventoryState = {
    root: process.cwd(),
    repository: "MentallyQuill/Tavernary",
    publisherActorId: 317929880,
    nowMs: Date.parse("2026-10-08T12:00:00Z"),
    receipts: [],
    operations: [operation],
    local: { revision: "b".repeat(40) },
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: "b".repeat(40) },
  };
  const persist = vi.fn(async (receipt: AutomationReceipt) => {
    state.operations = [receipt.operation];
    state.receipts = [receipt];
    throw Object.assign(new Error("Terminal write response lost."), {
      status: 503,
    });
  });
  const gh = vi.fn(async () => {
    throw new Error("No external metadata lifecycle mutation required.");
  });
  const result = await runReconciledFinalization({
    operationKey: operation.key,
    load: async () => structuredClone(state),
    persist,
    gh,
    env: {
      GITHUB_REPOSITORY: state.repository,
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR_ID: "2625904",
      GITHUB_WORKFLOW_REF: `${state.repository}/.github/workflows/automation-writer.yml@refs/heads/main`,
    },
  });
  expect(result).toMatchObject({
    operation: { key: operation.key, stage: "finalized", retry: null },
    waiting: false,
  });
  expect(persist).toHaveBeenCalledOnce();
  expect(gh).not.toHaveBeenCalled();
});

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
