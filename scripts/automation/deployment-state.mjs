import { isConfirmedDeployment } from "./deployment-operations.mjs";
const sha = /^[a-f0-9]{40}$/u;
function fail() {
  throw Object.assign(
    new Error(
      "Active deployment proof or owner rollback authorization is invalid.",
    ),
    { code: "validation-failed" },
  );
}
function exact(value, keys) {
  return (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
function time(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}
export function validateActiveDeployment(active, { nowMs = Date.now() } = {}) {
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs < 0 ||
    !exact(active, [
      "schema_version",
      "mode",
      "deployment",
      "observedAt",
      "confirmingRunId",
      "rollbackBaselineSha",
      "rollbackReason",
      "ownerActorId",
    ]) ||
    active.schema_version !== 1 ||
    !["ordinary", "rollback"].includes(active.mode) ||
    !Number.isSafeInteger(active.confirmingRunId) ||
    active.confirmingRunId < 1 ||
    !time(active.observedAt) ||
    Date.parse(active.observedAt) > nowMs + 300000
  )
    fail();
  const record = active.deployment;
  if (
    !exact(record, [
      "schema_version",
      "sourceSha",
      "status",
      "buildId",
      "bundleDigest",
      "confirmedAt",
      "confirmation",
      "workflowRunId",
    ]) ||
    record.schema_version !== 1 ||
    !sha.test(record.sourceSha ?? "") ||
    !Number.isSafeInteger(record.workflowRunId) ||
    record.workflowRunId < 1 ||
    !new RegExp(`^run-${record.workflowRunId}-attempt-[1-9]\\d*$`, "u").test(
      record.buildId ?? "",
    ) ||
    !time(record.confirmedAt) ||
    Date.parse(record.confirmedAt) > Date.parse(active.observedAt) + 300000 ||
    !exact(record.confirmation, [
      "sourceSha",
      "catalogDigest",
      "targetDigest",
      "buildDigest",
      "essentialSmokePassed",
    ]) ||
    !isConfirmedDeployment(record, {
      sha: record.sourceSha,
      catalogDigest: record.confirmation.catalogDigest,
      targetDigest: record.confirmation.targetDigest,
    })
  )
    fail();
  if (active.mode === "ordinary") {
    if (
      active.rollbackBaselineSha !== null ||
      active.rollbackReason !== null ||
      active.ownerActorId !== null ||
      active.confirmingRunId !== record.workflowRunId
    )
      fail();
  } else if (
    !sha.test(active.rollbackBaselineSha ?? "") ||
    active.ownerActorId !== 2625904 ||
    typeof active.rollbackReason !== "string" ||
    !active.rollbackReason.trim() ||
    active.rollbackReason.length > 500 ||
    /[\u0000-\u001f\u007f]/u.test(active.rollbackReason)
  )
    fail();
  return structuredClone(active);
}
export function createActiveDeployment({
  deployment,
  confirmingRunId,
  nowMs,
  mode = "ordinary",
  rollbackBaselineSha = null,
  rollbackReason = null,
  ownerActorId = null,
}) {
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) fail();
  return validateActiveDeployment(
    {
      schema_version: 1,
      mode,
      deployment,
      observedAt: new Date(nowMs).toISOString(),
      confirmingRunId,
      rollbackBaselineSha,
      rollbackReason,
      ownerActorId,
    },
    { nowMs },
  );
}
export function activeRollbackCoversMain({
  active,
  latestPublishableSha,
  catalogDigest,
  targetDigest,
  nowMs = Date.now(),
}) {
  try {
    const proof = validateActiveDeployment(active, { nowMs });
    return (
      proof.mode === "rollback" &&
      proof.rollbackBaselineSha === latestPublishableSha &&
      proof.deployment.confirmation.catalogDigest === catalogDigest &&
      proof.deployment.confirmation.targetDigest === targetDigest
    );
  } catch {
    return false;
  }
}
