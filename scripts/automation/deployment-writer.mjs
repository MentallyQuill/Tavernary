import { createHash } from "node:crypto";
import { validateRevisionManifest } from "./revision-manifest.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
import {
  createActiveDeployment,
  validateActiveDeployment,
} from "./deployment-state.mjs";
const sha = /^[a-f0-9]{40}$/u;
function fail(code = "validation-failed") {
  throw Object.assign(
    new Error("Canonical deployment confirmation is invalid."),
    { code },
  );
}
function validProof(record, expected, nowMs, matchBuild = true) {
  if (
    !record ||
    record.schema_version !== 1 ||
    !/^[A-Za-z0-9._-]{1,128}$/u.test(record.buildId ?? "") ||
    !Number.isFinite(Date.parse(record.confirmedAt)) ||
    Date.parse(record.confirmedAt) > nowMs + 300000 ||
    new Date(record.confirmedAt).toISOString() !== record.confirmedAt ||
    !isConfirmedDeployment(record, {
      sha: expected.sourceSha,
      catalogDigest: expected.catalogDigest,
      targetDigest: expected.targetDigest,
    })
  )
    return false;
  if (
    matchBuild &&
    (record.buildId !== expected.buildId ||
      record.bundleDigest !== expected.buildDigest)
  )
    return false;
  const rootKeys = [
    "schema_version",
    "sourceSha",
    "status",
    "buildId",
    "bundleDigest",
    "confirmedAt",
    "confirmation",
    ...(Object.hasOwn(record, "workflowRunId") ? ["workflowRunId"] : []),
  ];
  const proofKeys = [
    "sourceSha",
    "catalogDigest",
    "targetDigest",
    "buildDigest",
    "essentialSmokePassed",
  ];
  return (
    Object.keys(record).length === rootKeys.length &&
    rootKeys.every((key) => Object.hasOwn(record, key)) &&
    Object.keys(record.confirmation).length === proofKeys.length &&
    proofKeys.every((key) => Object.hasOwn(record.confirmation, key))
  );
}
export async function confirmCanonicalDeployment({
  runId,
  load,
  loadManifest,
  probe,
  commit,
  isAncestor,
}) {
  if (!Number.isSafeInteger(runId) || runId < 1) fail();
  const initial = await load();
  if (!sha.test(initial.revision ?? "")) fail();
  const prepared = await loadManifest({ runId, revision: initial.revision });
  if (prepared.runId !== runId) fail();
  const expected = validateRevisionManifest(prepared.manifest);
  const ancestor = (revision) =>
    expected.sourceSha === revision ||
    isAncestor(expected.sourceSha, revision) === true;
  const activeProof = (state) =>
    state.activeDeployment == null
      ? null
      : validateActiveDeployment(state.activeDeployment, {
          nowMs: state.nowMs,
        });
  const monotonic = (state) => {
    const active = activeProof(state);
    if (
      active &&
      active.deployment.sourceSha !== expected.sourceSha &&
      isAncestor(active.deployment.sourceSha, expected.sourceSha) !== true
    )
      fail("input-superseded");
    return active;
  };
  const alreadyConfirmed = (state) => {
    const active = activeProof(state);
    return (
      (!active ||
        validProof(active.deployment, expected, state.nowMs, false)) &&
      state.deployments.some((record) =>
        validProof(record, expected, state.nowMs, false),
      )
    );
  };
  if (!ancestor(initial.revision)) fail("input-superseded");
  monotonic(initial);
  if (alreadyConfirmed(initial))
    return { status: "already-confirmed", sourceSha: expected.sourceSha };
  const result = await probe({ expected });
  if (result.status !== "confirmed") return result;
  const fresh = await load();
  if (!sha.test(fresh.revision ?? "") || !ancestor(fresh.revision))
    fail("input-superseded");
  if (!validProof(result.deployment, expected, fresh.nowMs)) fail();
  monotonic(fresh);
  if (alreadyConfirmed(fresh))
    return { status: "already-confirmed", sourceSha: expected.sourceSha };
  const content = `${JSON.stringify({ ...result.deployment, workflowRunId: runId }, null, 2)}\n`;
  const activeContent = `${JSON.stringify(createActiveDeployment({ deployment: { ...result.deployment, workflowRunId: runId }, confirmingRunId: runId, mode: "ordinary", nowMs: fresh.nowMs }), null, 2)}\n`;
  const publication = await commit({
    expectedMainSha: fresh.revision,
    message: "chore(deploy): record verified public revision",
    files: [
      {
        path: `data/maintenance/automation/deployments/${expected.sourceSha}.json`,
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
        baseDigest: null,
      },
      {
        path: "data/maintenance/automation/deployments/current.json",
        type: "file",
        content: activeContent,
        bytes: Buffer.byteLength(activeContent),
        sha256: createHash("sha256").update(activeContent).digest("hex"),
        baseDigest: null,
      },
    ],
  });
  if (!sha.test(publication.sha ?? "")) fail();
  return {
    status: "confirmed",
    sourceSha: expected.sourceSha,
    revision: publication.sha,
  };
}
