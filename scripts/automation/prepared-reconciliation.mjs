import { selectPreparedWakes } from "./prepared-wake.mjs";
export async function reconcilePreparedOperations({
  state,
  hasResult,
  publish,
  limit = 20,
}) {
  const wakes = selectPreparedWakes({
    runs: state.remote.runs,
    operations: state.operations,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    limit,
  });
  const result = { published: 0, recovered: 0, failures: 0, consumedKeys: [] };
  for (const wake of wakes) {
    try {
      if (!(await hasResult(wake))) continue;
      result.consumedKeys.push(wake.operationKey);
      const publication = await publish(wake);
      result.published += publication.published;
      result.recovered += publication.recovered;
    } catch {
      if (!result.consumedKeys.includes(wake.operationKey))
        result.consumedKeys.push(wake.operationKey);
      result.failures++;
    }
  }
  return result;
}
