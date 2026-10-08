import { selectPreparedWakes } from "./prepared-wake.mjs";
export async function reconcilePreparedOperations({
  state,
  hasResult,
  publish,
  onFailure,
  limit = 20,
}) {
  const wakes = selectPreparedWakes({
    runs: state.remote.runs,
    operations: state.operations,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    limit,
    nowMs: state.nowMs,
  });
  const result = { published: 0, recovered: 0, failures: 0, consumedKeys: [] };
  const ready = [];
  for (const wake of wakes) {
    try {
      if (!(await hasResult(wake))) continue;
      result.consumedKeys.push(wake.operationKey);
      ready.push(wake);
    } catch (error) {
      if (onFailure)
        await onFailure({ operationKey: wake.operationKey, error });
      if (!result.consumedKeys.includes(wake.operationKey))
        result.consumedKeys.push(wake.operationKey);
      result.failures++;
    }
  }
  if (ready.length) {
    try {
      const publication = await publish(ready);
      result.published += publication.published;
      result.recovered += publication.recovered;
    } catch (error) {
      if (onFailure)
        for (const wake of ready)
          await onFailure({ operationKey: wake.operationKey, error });
      result.failures += ready.length;
    }
  }
  return result;
}
