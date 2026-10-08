import { selectPreparedWakes } from "./prepared-wake.mjs";
export async function reconcilePreparedOperations({
  state,
  hasResult,
  publish,
  onFailure,
  readDiagnostic,
  limit = 20,
}) {
  const wakes = selectPreparedWakes({
    runs: state.remote.runs,
    operations: state.operations,
    repository: state.repository,
    publisherActorId: state.publisherActorId,
    limit,
    nowMs: state.nowMs,
    includeDiagnostics: true,
  });
  const result = { published: 0, recovered: 0, failures: 0, consumedKeys: [] };
  const ready = [];
  for (const wake of wakes) {
    let error;
    let available = false;
    try {
      if (wake.diagnostic) {
        if (!readDiagnostic)
          throw new Error("Prepared diagnostic adapter is unavailable.");
        error = { failure: await readDiagnostic(wake) };
      } else available = await hasResult(wake);
    } catch (caught) {
      error = caught;
    }
    if (error) {
      result.consumedKeys.push(wake.operationKey);
      // Persist outside the observation catch: bookkeeping outages must remain visible.
      if (onFailure)
        await onFailure({ operationKey: wake.operationKey, error });
      result.failures++;
    } else if (available) {
      result.consumedKeys.push(wake.operationKey);
      ready.push(wake);
    }
  }
  if (ready.length) {
    let failure;
    try {
      const publication = await publish(ready);
      result.published += publication.published;
      result.recovered += publication.recovered;
    } catch (error) {
      failure = error;
    }
    if (failure) {
      if (onFailure)
        for (const wake of ready)
          await onFailure({ operationKey: wake.operationKey, error: failure });
      result.failures += ready.length;
    }
  }
  return result;
}
