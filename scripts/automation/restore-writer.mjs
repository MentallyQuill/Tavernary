import { createHash } from "node:crypto";
import { validateRestoreSource } from "./restore-source.mjs";
import { validateSiteBundle } from "./site-bundle.mjs";
import { planRollback } from "./rollback.mjs";
import {
  createActiveDeployment,
  validateActiveDeployment,
} from "./deployment-state.mjs";
const sha = /^[a-f0-9]{40}$/u;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error("Restored public proof or canonical revision is invalid."),
    { code },
  );
}
export async function confirmRestoredDeployment({
  runId,
  load,
  loadSource,
  loadBundle,
  readCurrent,
  probe,
  commit,
  isAncestor,
}) {
  if (!Number.isSafeInteger(runId) || runId < 1) fail();
  const initial = await load();
  if (!sha.test(initial.revision ?? "")) fail();
  const source = validateRestoreSource(
    await loadSource({ runId, revision: initial.revision }),
  );
  if (
    source.runId !== runId ||
    (source.baselineSha !== initial.revision &&
      isAncestor(source.baselineSha, initial.revision) !== true)
  )
    fail();
  const retained = await loadBundle({
    releaseId: source.releaseId,
    revision: initial.revision,
    nowMs: initial.nowMs,
  });
  const bundle = validateSiteBundle(retained.bundle),
    manifest = bundle.manifest;
  if (
    retained.releaseId !== source.releaseId ||
    manifest.sourceSha !== source.sourceSha ||
    manifest.buildId !== source.buildId ||
    manifest.buildDigest !== source.buildDigest ||
    manifest.catalogDigest !== source.catalogDigest ||
    manifest.targetDigest !== source.targetDigest ||
    bundle.archiveDigest !== source.archiveDigest ||
    retained.deployment.sourceSha !== source.sourceSha ||
    retained.deployment.buildId !== source.buildId ||
    retained.deployment.bundleDigest !== source.buildDigest ||
    (source.sourceSha !== initial.revision &&
      isAncestor(source.sourceSha, initial.revision) !== true)
  )
    fail();
  createActiveDeployment({
    deployment: retained.deployment,
    confirmingRunId: retained.deployment.workflowRunId,
    nowMs: initial.nowMs,
  });
  const already = (state) => {
    const active =
      state.activeDeployment == null
        ? null
        : validateActiveDeployment(state.activeDeployment, {
            nowMs: state.nowMs,
          });
    return (
      active?.mode === "rollback" &&
      active.confirmingRunId === runId &&
      active.deployment.sourceSha === source.sourceSha &&
      active.deployment.bundleDigest === source.buildDigest &&
      active.rollbackBaselineSha === source.baselineSha &&
      active.rollbackReason === source.reason
    );
  };
  if (already(initial))
    return { status: "already-confirmed", sourceSha: source.sourceSha };
  const verifyCurrent = async () => {
    const current = await readCurrent();
    if (
      planRollback({
        target: bundle,
        currentCatalogDigest: current.catalogDigest,
        currentTargetsDigest: current.targetDigest,
        ownerTombstones: current.ownerTombstones,
        authorizedReason: source.reason,
      }).action !== "deploy"
    )
      fail("input-superseded");
  };
  await verifyCurrent();
  const result = await probe({ expected: manifest });
  if (result.status !== "confirmed") return result;
  const fresh = await load();
  if (fresh.revision !== initial.revision) fail("input-superseded");
  if (already(fresh))
    return { status: "already-confirmed", sourceSha: source.sourceSha };
  await verifyCurrent();
  const deployment = {
    ...result.deployment,
    workflowRunId: retained.deployment.workflowRunId,
  };
  if (
    deployment.sourceSha !== source.sourceSha ||
    deployment.buildId !== source.buildId ||
    deployment.bundleDigest !== source.buildDigest ||
    deployment.confirmation?.catalogDigest !== source.catalogDigest ||
    deployment.confirmation?.targetDigest !== source.targetDigest
  )
    fail();
  const active = createActiveDeployment({
    deployment,
    confirmingRunId: runId,
    nowMs: fresh.nowMs,
    mode: "rollback",
    rollbackBaselineSha: source.baselineSha,
    rollbackReason: source.reason,
    ownerActorId: source.ownerActorId,
  });
  const content = `${JSON.stringify(active, null, 2)}\n`;
  const publication = await commit({
    expectedMainSha: fresh.revision,
    message: "chore(deploy): record verified owner restore",
    files: [
      {
        path: "data/maintenance/automation/deployments/current.json",
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        baseDigest: null,
      },
    ],
  });
  if (!sha.test(publication.sha ?? "")) fail();
  return {
    status: "confirmed",
    sourceSha: source.sourceSha,
    revision: publication.sha,
  };
}
