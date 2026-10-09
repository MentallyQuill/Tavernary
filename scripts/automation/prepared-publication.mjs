import { publishPreparedOperations } from "./prepared-batch.mjs";
export { publishPreparedOperations } from "./prepared-batch.mjs";
export function publishPreparedOperation({ operationKey, runId, ...input }) {
  return publishPreparedOperations({
    ...input,
    wakes: [{ operationKey, runId }],
  });
}
