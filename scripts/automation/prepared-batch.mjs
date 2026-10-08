import { createHash } from "node:crypto";
import { planCanonicalPublication } from "./write-lane.mjs";
import { publishCanonicalBatch } from "./publish.mjs";
import { selectDueOperations } from "./operation.mjs";
import {
  createCanonicalPublicationRecord,
  discoverCanonicalPublications,
} from "./publication-record.mjs";

export async function publishPreparedOperations({
  wakes,
  load,
  context,
  loadResult,
  build,
  commit,
  persist,
  onFailure,
}) {
  if (
    !Array.isArray(wakes) ||
    wakes.length > 20 ||
    new Set(wakes.map((wake) => wake.operationKey)).size !== wakes.length ||
    wakes.some(
      (wake) =>
        !/^[a-f0-9]{64}$/u.test(wake.operationKey ?? "") ||
        !Number.isSafeInteger(wake.runId) ||
        wake.runId < 1,
    )
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
  const proven = new Map(
    proof(inventory).map((operation) => [operation.key, operation]),
  );
  const candidates = new Map();
  const satisfied = [];
  const waiting = [];
  const failures = [];
  const dueKeys = new Set(
    selectDueOperations(inventory.operations, { nowMs, limit: 20 }).map(
      (operation) => operation.key,
    ),
  );
  for (const wake of wakes) {
    if (proven.has(wake.operationKey)) {
      satisfied.push(wake.operationKey);
      continue;
    }
    const operation = inventory.operations.find(
      (operation) => operation.key === wake.operationKey,
    );
    if (
      !operation ||
      !dueKeys.has(operation.key) ||
      operation.retry?.failure.kind === "superseded"
    ) {
      waiting.push({
        key: wake.operationKey,
        reasonCode: "prepared-input-stale",
      });
      continue;
    }
    if (
      operation.identity.kind === "report-import" &&
      [...candidates.values()].some(
        (candidate) => candidate.result.kind === "report-import",
      )
    ) {
      // Full report snapshots share canonical paths. Publish the oldest one;
      // later handoffs revalidate against that updated snapshot on the next wake.
      waiting.push({
        key: operation.key,
        reasonCode: "prepared-shared-record-wait",
      });
      continue;
    }
    try {
      const currentState = await context(inventory, operation);
      candidates.set(operation.key, {
        ...(await loadResult({
          inventory,
          operation,
          currentState,
          runId: wake.runId,
        })),
        currentState,
      });
    } catch (error) {
      if (!onFailure) throw error;
      await onFailure({ operationKey: operation.key, error });
      failures.push({
        key: operation.key,
        reasonCode: "prepared-load-unavailable",
      });
    }
  }
  function plan(values) {
    return planCanonicalPublication({
      operations: inventory.operations,
      candidates: values,
      currentMainSha: inventory.remote.mainHeadSha,
      expectedPublisherId: inventory.publisherActorId,
    });
  }
  const initial = plan([...candidates.values()]);
  if (onFailure)
    for (const decision of [...initial.rejected, ...initial.regenerate])
      await onFailure({
        operationKey: decision.key,
        error: Object.assign(new Error("Prepared publication rejected."), {
          code: decision.reasonCode,
        }),
      });
  initial.rejected.push(...failures);
  initial.satisfied.push(...satisfied);
  initial.waiting.push(...waiting);
  async function revalidate(action) {
    const values = [];
    for (const key of action.operationKeys) {
      const operation = inventory.operations.find(
        (operation) => operation.key === key,
      );
      if (!operation)
        return {
          regenerate: [{ reasonCode: "prepared-input-stale" }],
          actions: [],
          rejected: [],
        };
      try {
        values.push({
          ...candidates.get(key),
          currentState: await context(inventory, operation),
        });
      } catch (error) {
        return {
          actions: [],
          regenerate:
            error.code === "input-superseded"
              ? [{ reasonCode: "prepared-input-stale" }]
              : [],
          rejected:
            error.code === "input-superseded"
              ? []
              : [{ reasonCode: "prepared-authority-lost" }],
        };
      }
    }
    return plan(values);
  }
  return publishCanonicalBatch({
    plan: initial,
    nowMs,
    readState,
    persist,
    validate: async (action) => {
      const fresh = await revalidate(action);
      if (
        fresh.actions.length !== 1 ||
        fresh.regenerate.length ||
        fresh.rejected.length
      ) {
        if (onFailure && (fresh.regenerate.length || fresh.rejected.length))
          for (const key of action.operationKeys)
            await onFailure({
              operationKey: key,
              error: Object.assign(
                new Error("Prepared publication rejected."),
                {
                  code:
                    fresh.regenerate[0]?.reasonCode ??
                    fresh.rejected[0]?.reasonCode,
                },
              ),
            });
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
      }
      if (action.action !== "commit" || fresh.actions[0].action !== "commit")
        throw new Error("Prepared data cannot perform a project merge.");
      await build(fresh.actions[0], inventory);
      return { action: "ready", publication: fresh.actions[0] };
    },
    commit: async (action) => {
      // Inventory and every operation's authority are refreshed at the write boundary.
      const fresh = await revalidate(action);
      if (
        fresh.actions.length !== 1 ||
        fresh.actions[0].action !== "commit" ||
        fresh.regenerate.length ||
        fresh.rejected.length ||
        JSON.stringify(fresh.actions[0]) !== JSON.stringify(action)
      )
        throw Object.assign(new Error("Prepared publication is superseded."), {
          code: "input-superseded",
        });
      const files = await build(fresh.actions[0], inventory);
      const records = action.operationKeys.map((key) => {
        const record = createCanonicalPublicationRecord({
          result: candidates.get(key).result,
          operation: inventory.operations.find(
            (operation) => operation.key === key,
          ),
        });
        const content = `${JSON.stringify(record, null, 2)}\n`;
        return {
          path: `data/maintenance/automation/publications/${key}.json`,
          type: "file",
          content,
          sha256: createHash("sha256").update(content).digest("hex"),
          bytes: Buffer.byteLength(content),
          baseDigest: null,
        };
      });
      return commit(
        { ...fresh.actions[0], files: [...files, ...records] },
        inventory,
      );
    },
    merge: async () => {
      throw new Error("Prepared data cannot perform a project merge.");
    },
  });
}
