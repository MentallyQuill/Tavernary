import { createHash } from "node:crypto";
import { validateAutomationOperation } from "./operation.mjs";
import {
  assertTrustedPreparedProducer,
  validatePreparedResult,
} from "./prepared-result.mjs";

function runContext(captured) {
  return {
    id: captured.producer.runId,
    path: captured.producer.workflow,
    actor: { id: captured.publisherActorId, type: "Bot" },
    event: "workflow_dispatch",
    head_branch: "main",
    head_sha: captured.producer.sourceSha,
    head_repository: { full_name: captured.repository },
    status: "completed",
    conclusion: "success",
  };
}
export function capturePreparedOperation({
  operation,
  currentState,
  producer,
  publisherActorId,
}) {
  validateAutomationOperation(operation);
  if (
    !currentState.authorityValid ||
    currentState.mainSha !== producer.sourceSha ||
    !Array.isArray(currentState.allowedPaths) ||
    !currentState.allowedPaths.length ||
    new Set(currentState.allowedPaths).size !==
      currentState.allowedPaths.length ||
    currentState.allowedPaths.length > 128
  )
    throw new Error("Preparation base or authority is invalid.");
  const captured = structuredClone({
    schema_version: 1,
    operation,
    repository: currentState.repository,
    source: currentState.source,
    authorId: currentState.authorId,
    inputDigest: currentState.inputDigest,
    policyVersion: currentState.policyVersion,
    baseSha: currentState.mainSha,
    producer,
    publisherActorId,
    allowedPaths: currentState.allowedPaths,
    fileDigests: currentState.fileDigests,
  });
  assertTrustedPreparedProducer({
    kind: operation.identity.kind,
    repository: captured.repository,
    run: runContext(captured),
    publisherActorId,
  });
  if (
    captured.inputDigest !== operation.identity.inputDigest ||
    captured.policyVersion !== operation.identity.policyVersion
  )
    throw new Error("Preparation identity is invalid.");
  return captured;
}
export async function emitPreparedOperation({ captured, currentState, read }) {
  // Use the captured hashes, never a post-acquisition filesystem scan as the base.
  if (
    currentState.mainSha !== captured.baseSha ||
    currentState.inputDigest !== captured.inputDigest ||
    currentState.policyVersion !== captured.policyVersion ||
    currentState.repository !== captured.repository ||
    currentState.authorId !== captured.authorId ||
    currentState.authorityValid !== true ||
    JSON.stringify(currentState.source) !== JSON.stringify(captured.source) ||
    JSON.stringify(currentState.allowedPaths) !==
      JSON.stringify(captured.allowedPaths)
  )
    throw new Error("Preparation context changed during acquisition.");
  const files = [];
  for (const path of captured.allowedPaths) {
    const output = await read(path);
    if (!output) {
      if (captured.fileDigests[path])
        throw new Error("Prepared data cannot delete canonical records.");
      continue;
    }
    if (
      output.type !== "file" ||
      typeof output.content !== "string" ||
      Buffer.byteLength(output.content) > 8_388_608
    )
      throw new Error("Prepared data is not a bounded regular file.");
    const sha256 = createHash("sha256").update(output.content).digest("hex");
    if (sha256 === captured.fileDigests[path]) continue;
    files.push({
      path,
      type: "file",
      content: output.content,
      sha256,
      bytes: Buffer.byteLength(output.content),
      baseDigest: captured.fileDigests[path] ?? null,
    });
  }
  if (!files.length) return null;
  const result = {
    schema_version: 1,
    operationKey: captured.operation.key,
    kind: captured.operation.identity.kind,
    inputDigest: captured.inputDigest,
    policyVersion: captured.policyVersion,
    source: captured.source,
    authorId: captured.authorId,
    repository: captured.repository,
    producer: captured.producer,
    baseSha: captured.baseSha,
    files,
  };
  return validatePreparedResult(result, {
    operation: captured.operation,
    run: runContext(captured),
    publisherActorId: captured.publisherActorId,
    currentState: { ...currentState, fileDigests: captured.fileDigests },
  });
}
