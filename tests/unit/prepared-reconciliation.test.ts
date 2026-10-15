import { expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import { reconcilePreparedOperations } from "../../scripts/automation/prepared-reconciliation.mjs";
import {
  preparedResultContextFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
import {
  preparedReplayFixture,
  auditedRefreshReplayFixtures,
  diagnosticReplayFixture,
} from "../helpers/prepared-replay-fixtures";
import { loadPreparedGithubDiagnosticEvidence } from "../../scripts/automation/prepared-github.mjs";
import {
  isPreparedDiagnosticObsolete,
  persistPreparedFailure,
} from "../../scripts/automation/prepared-failure.mjs";
import {
  selectDueOperations,
  operationKey,
} from "../../scripts/automation/operation.mjs";

test.each([-1, 0, 1])(
  "all five audited producers preserve counters and deadlines at saved deadline %+ims",
  async (offset) => {
    for (const input of [
      preparedReplayFixture(),
      ...auditedRefreshReplayFixtures(),
    ]) {
      input.state.nowMs += offset;
      const before = JSON.stringify(input.state.receipts);
      const readDiagnosticEvidence = vi.fn(async () =>
        loadPreparedGithubDiagnosticEvidence(input.reader),
      );
      const onFailure = vi.fn(async () => {});
      const result = await reconcilePreparedOperations({
        state: input.state,
        hasResult: async () => false,
        publish: async () => {
          throw new Error("No publication expected");
        },
        readDiagnosticEvidence,
        isDiagnosticObsolete: async ({ evidence }) =>
          isPreparedDiagnosticObsolete({
            state: structuredClone(input.state),
            evidence,
          }),
        onFailure,
      });
      expect(result).toMatchObject({ failures: 0, consumedKeys: [] });
      expect(readDiagnosticEvidence).toHaveBeenCalledTimes(offset < 0 ? 0 : 1);
      expect(onFailure).not.toHaveBeenCalled();
      expect(JSON.stringify(input.state.receipts)).toBe(before);
      expect(
        selectDueOperations(input.state.operations, {
          nowMs: input.state.nowMs,
        }).map((operation) => operation.key),
      ).toEqual(offset < 0 ? [] : [input.receipt.operation.key]);
    }
  },
);

test("a verified obsolete diagnostic requests fresh inventory without consuming its due key or effect slot", async () => {
  const input = preparedReplayFixture();
  const onFailure = vi.fn(async () => {});
  const result = await reconcilePreparedOperations({
    state: input.state,
    hasResult: async () => false,
    publish: async () => {
      throw new Error("No publication expected");
    },
    readDiagnosticEvidence: async () =>
      loadPreparedGithubDiagnosticEvidence(input.reader),
    isDiagnosticObsolete: async ({ evidence }) =>
      isPreparedDiagnosticObsolete({
        state: structuredClone(input.state),
        evidence,
      }),
    onFailure,
  });
  expect(onFailure).not.toHaveBeenCalled();
  expect(result).toEqual({
    published: 0,
    recovered: 0,
    failures: 0,
    consumedKeys: [],
    reloadRequired: true,
  });
});

test("an unavailable fresh comparison escapes without fabricating a producer failure or continuing publication", async () => {
  const input = preparedReplayFixture();
  const onFailure = vi.fn(async () => {});
  const publish = vi.fn(async () => ({
    published: 0,
    recovered: 0,
    waiting: 0,
    regenerated: 0,
    rejected: 0,
  }));
  await expect(
    reconcilePreparedOperations({
      state: input.state,
      hasResult: async () => true,
      publish,
      readDiagnosticEvidence: async () =>
        loadPreparedGithubDiagnosticEvidence(input.reader),
      isDiagnosticObsolete: async () => {
        throw new Error("Fresh canonical load unavailable");
      },
      onFailure,
    }),
  ).rejects.toThrow("Fresh canonical load unavailable");
  expect(onFailure).not.toHaveBeenCalled();
  expect(publish).not.toHaveBeenCalled();
});

test.each([0, 20])(
  "twenty obsolete diagnostics use no effect slots under quota %i",
  async (limit) => {
    const base = auditedRefreshReplayFixtures()[0];
    const fixtures = Array.from({ length: 20 }, (_, index) => {
      const identity = {
        ...base.receipt.operation.identity,
        subject: `source:github-${index + 1}`,
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
        base.run.id + index,
        base.run.updated_at,
      );
    });
    const state = {
      ...base.state,
      operations: fixtures.map((input) => input.state.operations[0]),
      receipts: fixtures.map((input) => input.state.receipts[0]),
      remote: {
        ...base.state.remote,
        runs: fixtures.map((input) => input.run),
      },
    };
    const readDiagnosticEvidence = vi.fn(async (wake: { runId: number }) => {
      const input = fixtures.find(
        (candidate) => candidate.run.id === wake.runId,
      )!;
      return loadPreparedGithubDiagnosticEvidence(input.reader);
    });
    const onFailure = vi.fn(async () => {});
    const result = await reconcilePreparedOperations({
      state,
      limit,
      hasResult: async () => false,
      publish: async () => {
        throw new Error("No publication expected");
      },
      readDiagnosticEvidence,
      isDiagnosticObsolete: async ({ evidence }) =>
        isPreparedDiagnosticObsolete({ state, evidence }),
      onFailure,
    });
    expect(readDiagnosticEvidence).toHaveBeenCalledTimes(limit);
    expect(result).toMatchObject({ failures: 0, consumedKeys: [] });
    expect(onFailure).not.toHaveBeenCalled();
    expect(
      selectDueOperations(state.operations, { nowMs: state.nowMs }),
    ).toHaveLength(20);
  },
);

test.each([
  "equal-clock",
  "missing-archive",
  "late-controlled",
  "rerun",
  "corrupt-receipt",
  "unresolved-worker",
])(
  "unproven %s diagnostics retain ordinary failure persistence",
  async (variant) => {
    const input = preparedReplayFixture();
    let reader = input.reader;
    if (variant === "equal-clock")
      input.state.receipts[0].updatedAt = input.run.updated_at;
    if (variant === "missing-archive") {
      const original = reader.gh;
      reader.gh = async (args) =>
        args.some((argument) => /\/artifacts(?:\?|$)/u.test(argument))
          ? JSON.stringify([{ total_count: 0, artifacts: [] }])
          : original(args);
    }
    if (variant === "late-controlled")
      reader = diagnosticReplayFixture(
        {
          ...input.receipt,
          operation: {
            ...input.receipt.operation,
            retry: {
              ...input.receipt.operation.retry!,
              failure: {
                kind: "configuration",
                reasonCode: "provider-authentication-failed",
              },
            },
          },
        },
        input.run.id,
        input.run.updated_at,
      ).reader;
    if (variant === "rerun") input.run.run_attempt = 2;
    if (variant === "corrupt-receipt")
      Object.assign(input.state.receipts[0], { schema_version: 2 });
    if (variant === "unresolved-worker")
      input.state.remote.runs.push({
        ...input.run,
        id: 777,
        path: ".github/workflows/automation-worker.yml",
        display_title: `Automation ${input.receipt.operation.key}`,
        conclusion: "success",
        updated_at: "2026-10-15T00:25:24.000Z",
      });
    const persist = vi.fn(async () => {});
    const onFailure = vi.fn(
      async (failure: { operationKey: string; error: unknown }) => {
        await persistPreparedFailure({
          ...failure,
          load: async () => input.state,
          persist,
        });
      },
    );
    const result = await reconcilePreparedOperations({
      state: input.state,
      hasResult: async () => false,
      publish: async () => {
        throw new Error("No publication expected");
      },
      readDiagnosticEvidence: async () =>
        loadPreparedGithubDiagnosticEvidence(reader),
      isDiagnosticObsolete: async ({ evidence }) =>
        isPreparedDiagnosticObsolete({ state: input.state, evidence }),
      onFailure,
    });
    expect(result).toMatchObject({
      failures: 1,
      consumedKeys: [input.receipt.operation.key],
    });
    expect(result.reloadRequired).toBeUndefined();
    expect(onFailure).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledOnce();
  },
);

test.each(["expired", "digest", "schema"])(
  "invalid %s archives retain visible failure handling without obsolete comparison",
  async (variant) => {
    const input = preparedReplayFixture();
    if (variant === "expired") input.artifact.expired = true;
    if (variant === "digest")
      input.artifact.digest = `sha256:${"c".repeat(64)}`;
    if (variant === "schema") {
      const archive = zipSync({
        "diagnostic.json": strToU8(
          JSON.stringify({
            ...input.diagnostic,
            operation_key: "c".repeat(64),
          }),
        ),
      });
      input.artifact.digest = `sha256:${createHash("sha256").update(archive).digest("hex")}`;
      input.artifact.size_in_bytes = archive.length;
      input.reader.download = async () => archive;
    }
    const isDiagnosticObsolete = vi.fn(async () => true);
    const persist = vi.fn(async () => {});
    const result = await reconcilePreparedOperations({
      state: input.state,
      hasResult: async () => false,
      publish: async () => {
        throw new Error("No publication expected");
      },
      readDiagnosticEvidence: async () =>
        loadPreparedGithubDiagnosticEvidence(input.reader),
      isDiagnosticObsolete,
      onFailure: async (failure) => {
        await persistPreparedFailure({
          ...failure,
          load: async () => input.state,
          persist,
        });
      },
    });
    expect(result).toMatchObject({
      failures: 1,
      consumedKeys: [input.receipt.operation.key],
    });
    expect(isDiagnosticObsolete).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
  },
);
function fixture() {
  const context = preparedResultContextFixture();
  const state = {
    repository: context.currentState.repository,
    publisherActorId: context.publisherActorId,
    operations: [context.operation],
    remote: {
      runs: [
        {
          ...context.run,
          display_title: `Automation prepare ${context.operation.key}`,
        },
      ],
    },
  } as unknown as AutomationInventoryState;
  return {
    state,
    hasResult: vi.fn(async () => true),
    publish: vi.fn(
      async (_wakes: { operationKey: string; runId: number }[]) => ({
        published: 1,
        recovered: 0,
        waiting: 0,
        regenerated: 0,
        rejected: 0,
      }),
    ),
  };
}
test("scheduled reconciliation recovers a missed completion notification through the same publisher", async () => {
  const input = fixture();
  const result = await reconcilePreparedOperations(input);
  expect(result.consumedKeys).toEqual([input.state.operations[0].key]);
  expect(result.published).toBe(1);
  expect(input.publish).toHaveBeenCalledTimes(1);
  expect(input.publish).toHaveBeenCalledWith([
    { operationKey: input.state.operations[0].key, runId: 700 },
  ]);
});

test("scheduled recovery submits compatible handoffs as one bounded publication batch", async () => {
  const input = fixture();
  const second = operationFixture({
    identity: {
      ...input.state.operations[0].identity,
      subject: "source:github-43",
    },
  });
  input.state.operations.push(second);
  input.state.remote.runs.push({
    ...input.state.remote.runs[0],
    id: 701,
    display_title: `Automation prepare ${second.key}`,
  });
  await reconcilePreparedOperations(input);
  expect(input.publish).toHaveBeenCalledTimes(1);
  expect(input.publish.mock.calls[0][0]).toHaveLength(2);
});
test("a completed preparation with no artifact cannot count as publication or block ordinary due work", async () => {
  const input = fixture();
  input.hasResult.mockResolvedValue(false);
  const result = await reconcilePreparedOperations(input);
  expect(result.consumedKeys).toEqual([]);
  expect(input.publish).not.toHaveBeenCalled();
});
test("a failed handoff consumes its bounded attempt while preserving other reconciliation work", async () => {
  const input = fixture();
  input.publish.mockRejectedValue(new Error("Artifact unavailable."));
  const result = await reconcilePreparedOperations(input);
  expect(result.failures).toBe(1);
  expect(result.consumedKeys).toEqual([input.state.operations[0].key]);
});
test("a zero quota performs no artifact reads or publication", async () => {
  const input = fixture();
  expect(
    (await reconcilePreparedOperations({ ...input, limit: 0 })).consumedKeys,
  ).toEqual([]);
  expect(input.hasResult).not.toHaveBeenCalled();
});

test("a failed preparation transfers its sanitized diagnostic to retry persistence without publication", async () => {
  const input = fixture();
  input.state.remote.runs[0].conclusion = "failure";
  const failure = {
    kind: "configuration" as const,
    reasonCode: "provider-authentication-failed",
  };
  const readDiagnostic = vi.fn(async () => failure);
  const onFailure = vi.fn(async () => {});
  const result = await reconcilePreparedOperations({
    ...input,
    readDiagnostic,
    onFailure,
  });
  expect(result.failures).toBe(1);
  expect(onFailure).toHaveBeenCalledWith({
    operationKey: input.state.operations[0].key,
    error: { failure },
  });
  expect(input.hasResult).not.toHaveBeenCalled();
  expect(input.publish).not.toHaveBeenCalled();
});
