import { expect, test, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  publishPreparedOperation,
  publishPreparedOperations,
} from "../../scripts/automation/prepared-publication.mjs";
import { createCanonicalPublicationRecord } from "../../scripts/automation/publication-record.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
  operationFixture,
} from "../helpers/automation-fixtures";
import type { AutomationInventoryState } from "../../scripts/automation/inventory.mjs";
function fixture() {
  const context = preparedResultContextFixture();
  const result = preparedResultFixture();
  let state: AutomationInventoryState = {
    root: process.cwd(),
    repository: result.repository,
    publisherActorId: context.publisherActorId,
    nowMs: Date.now(),
    remote: { issues: [], pulls: [], runs: [], mainHeadSha: result.baseSha },
    local: {
      revision: result.baseSha,
      publications: [],
      publicationFileDigests: {},
    },
    receipts: [],
    operations: [context.operation],
  };
  const commit = vi.fn(async () => {
    state = {
      ...state,
      remote: { ...state.remote, mainHeadSha: "d".repeat(40) },
      local: {
        revision: "d".repeat(40),
        publications: [
          {
            record: createCanonicalPublicationRecord({
              result,
              operation: context.operation,
            }),
            revision: "d".repeat(40),
          },
        ],
        publicationFileDigests: Object.fromEntries(
          result.files.map((file) => [
            `${"d".repeat(40)}:${file.path}`,
            file.sha256,
          ]),
        ),
      },
    };
    return { sha: "d".repeat(40) };
  });
  const input = {
    operationKey: context.operation.key,
    runId: context.run.id,
    load: async () => state,
    context: async () => ({
      ...context.currentState,
      mainSha: state.remote.mainHeadSha,
    }),
    loadResult: vi.fn(async () => ({ result, run: context.run })),
    build: vi.fn(
      async (action: { files: typeof result.files }) => action.files,
    ),
    commit,
    persist: vi.fn(async () => {}),
  };
  return {
    input,
    setState: (next: AutomationInventoryState) => {
      state = next;
    },
    getState: () => state,
  };
}
test("the production handoff publishes once, verifies co-committed evidence, and recovers a missed receipt", async () => {
  const input = fixture();
  input.input.persist.mockRejectedValueOnce(
    new Error("Receipt service unavailable."),
  );
  await expect(publishPreparedOperation(input.input)).rejects.toThrow(
    "Receipt service unavailable",
  );
  expect((await publishPreparedOperation(input.input)).recovered).toBe(1);
  expect(input.input.commit).toHaveBeenCalledTimes(1);
  expect(input.input.loadResult).toHaveBeenCalledTimes(1);
});
test("a deleted source or late authority change prevents the production commit", async () => {
  const input = fixture();
  let reads = 0;
  input.input.context = async () => {
    if (++reads > 1)
      throw Object.assign(new Error("Source removed."), {
        code: "authorization-lost",
      });
    return preparedResultContextFixture().currentState;
  };
  expect((await publishPreparedOperation(input.input)).rejected).toBe(1);
  expect(input.input.commit).not.toHaveBeenCalled();
});
test("a full catalog validation failure blocks the commit even when the artifact passed its file schema", async () => {
  const input = fixture();
  input.input.build.mockRejectedValue(
    new Error("Catalog cross-reference invalid."),
  );
  await expect(publishPreparedOperation(input.input)).rejects.toThrow(
    "Catalog cross-reference invalid",
  );
  expect(input.input.commit).not.toHaveBeenCalled();
});
test("a superseded input has no artifact download or canonical mutation", async () => {
  const input = fixture();
  input.setState({ ...input.getState(), operations: [] });
  expect((await publishPreparedOperation(input.input)).waiting).toBe(1);
  expect(input.input.loadResult).not.toHaveBeenCalled();
  expect(input.input.commit).not.toHaveBeenCalled();
});

function batchFixture() {
  const input = fixture();
  const first = preparedResultFixture();
  const secondOperation = operationFixture({
    identity: {
      ...input.getState().operations[0].identity,
      subject: "source:github-43",
    },
  });
  const second = preparedResultFixture({
    operationKey: secondOperation.key,
    source: { id: "github-43", identity: "github:43" },
    paths: ["data/snapshots/github/github-43.json"],
  });
  const results = new Map([
    [first.operationKey, first],
    [second.operationKey, second],
  ]);
  input.setState({
    ...input.getState(),
    operations: [...input.getState().operations, secondOperation],
  });
  const batch = {
    ...input.input,
    wakes: [...results.keys()].map((operationKey) => ({
      operationKey,
      runId: 700,
    })),
    context: vi.fn(
      async (
        _state: AutomationInventoryState,
        operation: typeof secondOperation,
      ) => ({
        ...preparedResultContextFixture().currentState,
        source: results.get(operation.key)!.source,
        allowedPaths: results
          .get(operation.key)!
          .files.map((file) => file.path),
        validateContent: () => true,
      }),
    ),
    loadResult: vi.fn(
      async ({ operation }: { operation: typeof secondOperation }) => ({
        result: results.get(operation.key)!,
        run: preparedResultContextFixture().run,
      }),
    ),
    commit: vi.fn(
      async (action: {
        operationKeys: string[];
        files: typeof first.files;
      }) => {
        const revision = "d".repeat(40);
        input.setState({
          ...input.getState(),
          remote: { ...input.getState().remote, mainHeadSha: revision },
          local: {
            revision,
            publications: action.operationKeys.map((key) => ({
              revision,
              record: createCanonicalPublicationRecord({
                result: results.get(key)!,
                operation: input
                  .getState()
                  .operations.find((operation) => operation.key === key)!,
              }),
            })),
            publicationFileDigests: Object.fromEntries(
              action.files.map((file) => [
                `${revision}:${file.path}`,
                file.sha256,
              ]),
            ),
          },
        });
        return { sha: revision };
      },
    ),
  };
  return { batch, results, input };
}

test("prepared reports sharing a canonical snapshot publish in order instead of regenerating each other forever", async () => {
  const { batch, results, input } = batchFixture();
  const pairs = [...results.values()].map((result, index) => {
    const operation = operationFixture({
      identity: {
        kind: "report-import",
        subject: `report:${String(index + 1).repeat(64)}`,
        inputDigest: result.inputDigest,
        policyVersion: result.policyVersion,
      },
    });
    const content = JSON.stringify({ report: index });
    return {
      operation,
      result: {
        ...result,
        kind: "report-import" as const,
        operationKey: operation.key,
        producer: {
          ...result.producer,
          workflow: ".github/workflows/import-tavernkeeper-reports.yml",
        },
        files: [
          {
            ...result.files[0],
            path: "data/security/tavernkeeper-report-summaries.json",
            content,
            bytes: Buffer.byteLength(content),
            sha256: createHash("sha256").update(content).digest("hex"),
          },
        ],
      },
    };
  });
  results.clear();
  for (const pair of pairs) results.set(pair.operation.key, pair.result);
  input.setState({
    ...input.getState(),
    operations: pairs.map((pair) => pair.operation),
  });
  batch.wakes = pairs.map((pair) => ({
    operationKey: pair.operation.key,
    runId: 700,
  }));
  batch.loadResult = vi.fn(async ({ operation }) => ({
    result: results.get(operation.key)!,
    run: {
      ...preparedResultContextFixture().run,
      path: ".github/workflows/import-tavernkeeper-reports.yml",
    },
  }));
  expect(await publishPreparedOperations(batch)).toMatchObject({
    published: 1,
    waiting: 1,
    regenerated: 0,
    rejected: 0,
  });
  expect(batch.commit).toHaveBeenCalledTimes(1);
  expect(batch.commit.mock.calls[0][0].operationKeys).toEqual([
    batch.wakes[0].operationKey,
  ]);
});

test("compatible production handoffs share one commit and retain separate recoverable records", async () => {
  const { batch } = batchFixture();
  expect((await publishPreparedOperations(batch)).published).toBe(2);
  expect(batch.commit).toHaveBeenCalledTimes(1);
  expect(batch.build).toHaveBeenCalledTimes(2);
  const action = batch.commit.mock.calls[0][0];
  expect(action.operationKeys).toEqual(
    batch.wakes.map((wake) => wake.operationKey),
  );
  expect(
    action.files.filter((file) => file.path.includes("/publications/")),
  ).toHaveLength(2);
  expect((await publishPreparedOperations(batch)).recovered).toBe(2);
  expect(batch.commit).toHaveBeenCalledTimes(1);
  expect(batch.loadResult).toHaveBeenCalledTimes(2);
});

test("one unavailable artifact acquires retry state while a healthy handoff can still publish", async () => {
  const { batch } = batchFixture();
  const original = batch.loadResult;
  batch.loadResult = vi.fn(async (input) => {
    if (input.operation.key === batch.wakes[1].operationKey)
      throw new Error("Artifact unavailable.");
    return original(input);
  });
  const onFailure = vi.fn(async () => {});
  expect(
    (await publishPreparedOperations({ ...batch, onFailure })).published,
  ).toBe(1);
  expect(onFailure).toHaveBeenCalledTimes(1);
  expect(batch.commit.mock.calls[0][0].operationKeys).toEqual([
    batch.wakes[0].operationKey,
  ]);
});

test("every batched operation's authority is checked again at the final write boundary", async () => {
  const { batch } = batchFixture();
  const original = batch.context;
  let secondReads = 0;
  batch.context = vi.fn(async (state, operation) => ({
    ...(await original(state, operation)),
    authorityValid:
      operation.key === batch.wakes[1].operationKey ? ++secondReads < 3 : true,
  }));
  await expect(publishPreparedOperations(batch)).rejects.toThrow(/superseded/u);
  expect(batch.commit).not.toHaveBeenCalled();
});

test("a prepared result cannot claim another source's path while an authorized result can publish", async () => {
  const { batch, results } = batchFixture();
  const first = results.get(batch.wakes[0].operationKey)!;
  const second = results.get(batch.wakes[1].operationKey)!;
  const content = JSON.stringify({ source_id: "github-43", repository_id: 43 });
  second.files = [
    {
      ...first.files[0],
      content,
      bytes: Buffer.byteLength(content),
      sha256: createHash("sha256").update(content).digest("hex"),
    },
  ];
  batch.context = vi.fn(async (_state, operation) => ({
    ...preparedResultContextFixture().currentState,
    source: results.get(operation.key)!.source,
    allowedPaths: [first.files[0].path],
    validateContent: () => true,
    fileDigests: {},
  }));
  const result = await publishPreparedOperations(batch);
  expect(result.published).toBe(1);
  expect(result.rejected).toBe(1);
  expect(batch.commit.mock.calls[0][0].operationKeys).toEqual([
    batch.wakes[0].operationKey,
  ]);
});
