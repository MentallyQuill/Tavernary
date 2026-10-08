import { expect, test, vi } from "vitest";
import { publishPreparedOperation } from "../../scripts/automation/prepared-publication.mjs";
import {
  preparedResultFixture,
  preparedResultContextFixture,
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
            record: {
              schema_version: 1,
              operation: context.operation,
              source: result.source,
              authorId: result.authorId,
              producer: result.producer,
              files: result.files.map(({ path, sha256 }) => ({ path, sha256 })),
            },
            revision: "d".repeat(40),
          },
        ],
        publicationFileDigests: Object.fromEntries(
          result.files.map((file) => [file.path, file.sha256]),
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
