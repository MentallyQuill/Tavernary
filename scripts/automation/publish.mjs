import { validateAutomationOperation } from "./operation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";

const shaPattern = /^[a-f0-9]{40}$/u;
const keyPattern = /^[a-f0-9]{64}$/u;
function validateState(state) {
  if (
    !state ||
    !shaPattern.test(state.mainSha ?? "") ||
    !Array.isArray(state.operations) ||
    !state.canonicalRevisions
  )
    throw new Error("Canonical publication state is invalid.");
  state.operations.forEach(validateAutomationOperation);
  for (const [key, revision] of Object.entries(state.canonicalRevisions))
    if (!keyPattern.test(key) || !shaPattern.test(revision))
      throw new Error("Canonical publication proof is invalid.");
  return state;
}
function sameProposal(left, right) {
  const { expectedMainSha: _leftSha, ...leftProposal } = left;
  const { expectedMainSha: _rightSha, ...rightProposal } = right;
  return JSON.stringify(leftProposal) === JSON.stringify(rightProposal);
}
export async function publishCanonicalBatch({
  plan,
  readState,
  validate,
  commit,
  merge,
  persist,
  nowMs,
}) {
  if (!Number.isFinite(nowMs)) throw new Error("Publication clock is invalid.");
  const result = {
    published: 0,
    recovered: 0,
    waiting: plan.waiting.length,
    regenerated: plan.regenerate.length,
    rejected: plan.rejected.length,
  };
  const seen = new Set();
  for (const action of plan.actions) {
    if (
      !["commit", "merge"].includes(action.action) ||
      !shaPattern.test(action.expectedMainSha ?? "") ||
      !Array.isArray(action.operationKeys) ||
      action.operationKeys.length < 1 ||
      action.operationKeys.some((key) => !keyPattern.test(key) || seen.has(key))
    )
      throw new Error("Canonical publication action is invalid.");
    action.operationKeys.forEach((key) => seen.add(key));
  }
  if (seen.size > 20)
    throw new Error("Canonical publication exceeds its operation quota.");
  async function record(operation, revision, state) {
    const completed = operation.stage === "finalized";
    const stage = [
      "published",
      "deployment-requested",
      "deployment-confirmed",
      "finalized",
    ].includes(operation.stage)
      ? operation.stage
      : "published";
    const next = {
      ...operation,
      stage,
      expectedSha: revision,
      workerRunId: null,
      nextEligibleAt: null,
      retry: null,
    };
    const previous = (state.receipts ?? [])
      .map(validateAutomationReceipt)
      .find(
        (receipt) =>
          receipt.operation.key === operation.key &&
          JSON.stringify(receipt.operation) === JSON.stringify(next),
      );
    if (previous) return;
    await persist(
      validateAutomationReceipt({
        schema_version: 1,
        operation: next,
        updatedAt: new Date(nowMs).toISOString(),
        completedAt: completed ? new Date(nowMs).toISOString() : null,
      }),
    );
  }
  for (const key of plan.satisfied) {
    const state = validateState(await readState());
    const operation = state.operations.find(
      (operation) => operation.key === key,
    );
    const revision = state.canonicalRevisions[key];
    if (operation && revision) {
      await record(operation, revision, state);
      result.recovered++;
    } else result.waiting++;
  }
  for (const action of plan.actions) {
    const before = validateState(await readState());
    const operations = action.operationKeys.map((key) =>
      before.operations.find((operation) => operation.key === key),
    );
    if (operations.some((operation) => !operation)) {
      result.waiting += action.operationKeys.length;
      continue;
    }
    const satisfied = operations.filter(
      (operation) => before.canonicalRevisions[operation.key],
    );
    for (const operation of satisfied) {
      await record(operation, before.canonicalRevisions[operation.key], before);
      result.recovered++;
    }
    if (satisfied.length) {
      result.waiting += operations.length - satisfied.length;
      continue;
    }
    const decision = await validate(action, before);
    if (decision.action !== "ready") {
      const counter =
        decision.action === "regenerate"
          ? "regenerated"
          : decision.action === "reject"
            ? "rejected"
            : "waiting";
      result[counter] += operations.length;
      continue;
    }
    const publication = decision.publication;
    if (
      !sameProposal(action, publication) ||
      publication.expectedMainSha !== before.mainSha
    )
      throw new Error("Revalidated publication identity changed.");
    const boundary = validateState(await readState());
    if (
      boundary.mainSha !== publication.expectedMainSha ||
      operations.some(
        (operation) =>
          !boundary.operations.some(
            (current) =>
              current.key === operation.key &&
              current.expectedSha === operation.expectedSha,
          ),
      )
    ) {
      result.regenerated += operations.length;
      continue;
    }
    const effect =
      publication.action === "commit"
        ? await commit(publication, boundary)
        : await merge(publication, boundary);
    if (!shaPattern.test(effect?.sha ?? ""))
      throw new Error("Publication returned no verified revision.");
    const after = validateState(await readState());
    if (
      operations.some(
        (operation) => after.canonicalRevisions[operation.key] !== effect.sha,
      )
    )
      throw new Error("Publication has no matching canonical proof.");
    for (const operation of operations) {
      await record(operation, effect.sha, after);
      result.published++;
    }
  }
  return result;
}
