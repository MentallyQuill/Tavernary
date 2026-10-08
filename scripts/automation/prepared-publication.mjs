import { createHash } from "node:crypto";
import { planCanonicalPublication } from "./write-lane.mjs";
import { publishCanonicalBatch } from "./publish.mjs";
import {
  createCanonicalPublicationRecord,
  discoverCanonicalPublications,
} from "./publication-record.mjs";

export async function publishPreparedOperation({
  operationKey,
  runId,
  load,
  context,
  loadResult,
  build,
  commit,
  persist,
}) {
  if (
    !/^[a-f0-9]{64}$/u.test(operationKey ?? "") ||
    !Number.isSafeInteger(runId) ||
    runId < 1
  )
    throw new Error("Prepared publication input is invalid.");
  let inventory = await load();
  const nowMs = inventory.nowMs;
  function proof(state) {
    return discoverCanonicalPublications({
      records: state.local.publications ?? [],
      fileDigests: state.local.publicationFileDigests ?? {},
      receipts: state.receipts,
      nowMs: state.nowMs,
    });
  }
  async function readState() {
    inventory = await load();
    if (inventory.local.revision !== inventory.remote.mainHeadSha)
      throw Object.assign(new Error("Canonical writer checkout changed."), {
        code: "input-superseded",
      });
    const publications = proof(inventory);
    const operations = new Map(
      inventory.operations.map((operation) => [operation.key, operation]),
    );
    for (const operation of publications)
      if (!operations.has(operation.key))
        operations.set(operation.key, operation);
    return {
      mainSha: inventory.remote.mainHeadSha,
      operations: [...operations.values()],
      receipts: inventory.receipts,
      canonicalRevisions: Object.fromEntries(
        publications.map((operation) => [operation.key, operation.expectedSha]),
      ),
    };
  }
  const proven = proof(inventory).find(
    (operation) => operation.key === operationKey,
  );
  let operation =
    inventory.operations.find((operation) => operation.key === operationKey) ??
    proven;
  if (!operation)
    return {
      published: 0,
      recovered: 0,
      waiting: 1,
      regenerated: 0,
      rejected: 0,
    };
  let candidate;
  let plan;
  if (proven)
    plan = {
      actions: [],
      rejected: [],
      regenerate: [],
      waiting: [],
      satisfied: [operationKey],
    };
  else {
    const currentState = await context(inventory, operation);
    candidate = {
      ...(await loadResult({ inventory, operation, currentState, runId })),
      currentState,
    };
    plan = planCanonicalPublication({
      operations: inventory.operations,
      candidates: [candidate],
      currentMainSha: inventory.remote.mainHeadSha,
      expectedPublisherId: inventory.publisherActorId,
    });
  }
  return publishCanonicalBatch({
    plan,
    nowMs,
    readState,
    persist,
    validate: async (action) => {
      operation = inventory.operations.find(
        (current) => current.key === operationKey,
      );
      if (!operation)
        return { action: "regenerate", reasonCode: "prepared-input-stale" };
      let currentState;
      try {
        currentState = await context(inventory, operation);
      } catch (error) {
        return {
          action: error.code === "input-superseded" ? "regenerate" : "reject",
          reasonCode: "prepared-authority-lost",
        };
      }
      const fresh = planCanonicalPublication({
        operations: inventory.operations,
        candidates: [{ ...candidate, currentState }],
        currentMainSha: inventory.remote.mainHeadSha,
        expectedPublisherId: inventory.publisherActorId,
      });
      if (!fresh.actions.length)
        return {
          action: fresh.regenerate.length
            ? "regenerate"
            : fresh.rejected.length
              ? "reject"
              : "wait",
          reasonCode:
            fresh.regenerate[0]?.reasonCode ??
            fresh.rejected[0]?.reasonCode ??
            "publication-pending",
        };
      if (action.action !== "commit" || fresh.actions[0].action !== "commit")
        throw new Error("Prepared data cannot perform a project merge.");
      await build(fresh.actions[0], inventory);
      return { action: "ready", publication: fresh.actions[0] };
    },
    commit: async (action) => {
      // The final inventory is freshly loaded by publishCanonicalBatch at the write boundary.
      const currentState = await context(inventory, operation);
      const fresh = planCanonicalPublication({
        operations: inventory.operations,
        candidates: [{ ...candidate, currentState }],
        currentMainSha: inventory.remote.mainHeadSha,
        expectedPublisherId: inventory.publisherActorId,
      });
      if (fresh.actions.length !== 1 || fresh.actions[0].action !== "commit")
        throw Object.assign(new Error("Prepared publication is superseded."), {
          code: "input-superseded",
        });
      const files = await build(action, inventory);
      const record = createCanonicalPublicationRecord({
        result: candidate.result,
        operation,
      });
      const content = `${JSON.stringify(record, null, 2)}\n`;
      const recordFile = {
        path: `data/maintenance/automation/publications/${operationKey}.json`,
        type: "file",
        content,
        sha256: createHash("sha256").update(content).digest("hex"),
        bytes: Buffer.byteLength(content),
        baseDigest: null,
      };
      return commit({ ...action, files: [...files, recordFile] }, inventory);
    },
    merge: async () => {
      throw new Error("Prepared data cannot perform a project merge.");
    },
  });
}
