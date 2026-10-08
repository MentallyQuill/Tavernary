import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { readCanonicalFiles } from "./canonical-files.mjs";
import {
  hasConfirmedEnrichmentCanary,
  findEnrichmentCheckpointDeployment,
} from "./enrichment-preparation.mjs";
import {
  createEnrichmentReport,
  validateEnrichmentReport,
} from "../catalog/enrichment-report.mjs";
import {
  recordCheckpointPublication,
  approveCanaryDeployment,
  recordFullDeployment,
} from "../catalog/enrichment-run-state.mjs";
import { formatJson } from "../catalog/json-format.mjs";

const normalize = (value) =>
  value
    ? createEnrichmentReport(validateEnrichmentReport(structuredClone(value)))
    : null;
const paths = {
  canary: "data/reports/enrichment-canary.json",
  full: "data/reports/enrichment-report.json",
};
function projection(
  state,
  operation,
  now = new Date(state.nowMs).toISOString(),
) {
  const publication = (state.local.publications ?? []).find(
    ({ record, revision }) =>
      record.operation.key === operation.key &&
      record.operation.identity.kind === "enrichment" &&
      revision === operation.expectedSha,
  );
  if (!publication) return { status: "waiting" };
  const file = publication.record.files.find((file) =>
    Object.values(paths).includes(file.path),
  );
  if (
    !file ||
    state.local.publicationFileDigests?.[
      `${publication.revision}:${file.path}`
    ] !== file.sha256
  )
    return { status: "waiting" };
  const bytes = readCanonicalFiles({
    root: state.root,
    revision: publication.revision,
    paths: [file.path],
  })[file.path];
  if (
    !bytes ||
    createHash("sha256").update(bytes).digest("hex") !== file.sha256
  )
    return { status: "waiting" };
  const checkpoint = normalize(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
  );
  if (paths[checkpoint.mode] !== file.path) return { status: "waiting" };
  if (checkpoint.phase !== "complete" || checkpoint.status === "failed")
    return { status: "complete" };
  const current = normalize(
    state.local[
      checkpoint.mode === "canary" ? "enrichmentCanary" : "enrichmentFull"
    ],
  );
  if (!current || current.run_id !== checkpoint.run_id)
    return { status: "superseded" };
  const deployment = findEnrichmentCheckpointDeployment({
    state,
    publication,
    checkpoint,
    workflowRunId: current.deployment?.run_id,
  });
  if (!deployment) return { status: "waiting" };
  const publicationSha =
    checkpoint.mode === "full" ? deployment.sourceSha : publication.revision;
  const recordedAt =
    current.publication?.checkpoint_commit_sha === publicationSha
      ? current.publication.recorded_at
      : now;
  const verifiedAt =
    current.deployment?.commit_sha === deployment.sourceSha
      ? current.deployment.verified_at
      : now;
  const published = recordCheckpointPublication(checkpoint, {
    commitSha: publicationSha,
    now: recordedAt,
  });
  const approved = createEnrichmentReport(
    checkpoint.mode === "canary"
      ? approveCanaryDeployment(published, {
          commitSha: deployment.sourceSha,
          deploymentRunId: deployment.workflowRunId,
          now: verifiedAt,
        })
      : recordFullDeployment(published, {
          commitSha: deployment.sourceSha,
          deploymentRunId: deployment.workflowRunId,
          now: verifiedAt,
        }),
  );
  if (
    !isDeepStrictEqual(current, checkpoint) &&
    !isDeepStrictEqual(current, approved)
  )
    return { status: "superseded" };
  const outputs = {};
  if (!isDeepStrictEqual(current, approved)) outputs[file.path] = approved;
  if (checkpoint.mode === "canary") {
    const full = normalize(state.local.enrichmentFull);
    if (full?.status === "running") {
      if (
        full.expected_model !== approved.expected_model ||
        full.selection_mode !== approved.selection_mode
      )
        return { status: "superseded" };
      if (full.authorized_canary_run_id !== approved.run_id)
        outputs[paths.full] = {
          ...full,
          authorized_canary_run_id: approved.run_id,
          updated_at: verifiedAt,
        };
    }
  } else if (!hasConfirmedEnrichmentCanary(state, current))
    return { status: "waiting" };
  return Object.keys(outputs).length
    ? { status: "ready", outputs }
    : { status: "complete" };
}
export async function projectEnrichmentLifecycle({
  operation,
  state,
  load,
  commit,
}) {
  const now = new Date(state.nowMs).toISOString();
  const initial = projection(state, operation, now);
  if (initial.status !== "ready") return { status: initial.status };
  const fresh = await load();
  if (fresh.local.revision !== fresh.remote.mainHeadSha)
    return { status: "waiting" };
  const currentOperation = fresh.operations.find(
    (value) => value.key === operation.key,
  );
  if (
    !currentOperation ||
    currentOperation.stage !== "deployment-confirmed" ||
    currentOperation.expectedSha !== operation.expectedSha
  )
    return { status: "superseded" };
  const current = projection(fresh, currentOperation, now);
  if (current.status !== "ready") return { status: current.status };
  if (!isDeepStrictEqual(current.outputs, initial.outputs))
    return { status: "superseded" };
  const files = await Promise.all(
    Object.entries(current.outputs).map(async ([path, value]) => {
      const content = await formatJson(value);
      return {
        path,
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
      };
    }),
  );
  await commit({
    repository: fresh.repository,
    expectedMainSha: fresh.local.revision,
    message: "chore(enrichment): confirm deployed rollout checkpoint",
    files,
  });
  const after = await load();
  if (
    !Object.entries(current.outputs).every(([path, value]) =>
      isDeepStrictEqual(
        normalize(
          after.local[
            path === paths.canary ? "enrichmentCanary" : "enrichmentFull"
          ],
        ),
        value,
      ),
    )
  )
    return { status: "waiting" };
  return { status: "complete" };
}
