import { createHash } from "node:crypto";
import { validateRevisionManifest } from "./revision-manifest.mjs";
import { isConfirmedDeployment } from "./deployment-operations.mjs";
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
  if (!ancestor(initial.revision)) fail("input-superseded");
  if (
    initial.deployments.some((record) =>
      validProof(record, expected, initial.nowMs, false),
    )
  )
    return { status: "already-confirmed", sourceSha: expected.sourceSha };
  const result = await probe({ expected });
  if (result.status !== "confirmed") return result;
  const fresh = await load();
  if (!sha.test(fresh.revision ?? "") || !ancestor(fresh.revision))
    fail("input-superseded");
  if (!validProof(result.deployment, expected, fresh.nowMs)) fail();
  if (
    fresh.deployments.some((record) =>
      validProof(record, expected, fresh.nowMs, false),
    )
  )
    return { status: "already-confirmed", sourceSha: expected.sourceSha };
  const content = `${JSON.stringify({ ...result.deployment, workflowRunId: runId }, null, 2)}\n`;
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
    ],
  });
  if (!sha.test(publication.sha ?? "")) fail();
  return {
    status: "confirmed",
    sourceSha: expected.sourceSha,
    revision: publication.sha,
  };
}
