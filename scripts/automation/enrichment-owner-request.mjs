import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createEnrichmentReport,
  validateEnrichmentReport,
} from "../catalog/enrichment-report.mjs";
import { createEnrichmentRunState } from "../catalog/enrichment-run-state.mjs";
import { selectEnrichmentRecords } from "../catalog/enrich-readmes.mjs";
import { selectRepresentativeCanaryIds } from "../catalog/select-enrichment-canary.mjs";
import { manualEnrichmentExclusions } from "../catalog/enrichment-policy.mjs";
import { formatJson } from "../catalog/json-format.mjs";
import { hasConfirmedEnrichmentCanary } from "./enrichment-preparation.mjs";

const report = (value) =>
  value
    ? createEnrichmentReport(validateEnrichmentReport(structuredClone(value)))
    : null;
const failure = (code) =>
  Object.assign(new Error("Owner enrichment request is unavailable."), {
    code,
  });
export function parseEnrichmentOwnerRequest(
  run,
  repository = "MentallyQuill/Tavernary",
) {
  const match =
    /^Enrichment request (pending|all-automatic) batch([1-9]\d?) concurrency([1-8])$/u.exec(
      run?.display_title ?? "",
    );
  if (
    !match ||
    Number(match[2]) > 30 ||
    run.path !== ".github/workflows/request-catalog-enrichment.yml" ||
    run.event !== "workflow_dispatch" ||
    run.head_branch !== "main" ||
    run.actor?.id !== 2625904 ||
    run.actor.type !== "User" ||
    run.repository?.id !== 1309605115 ||
    run.repository.full_name !== repository ||
    run.head_repository?.id !== run.repository.id ||
    run.head_repository.full_name !== repository ||
    !Number.isSafeInteger(run.id) ||
    run.id < 1 ||
    !/^[a-f0-9]{40}$/u.test(run.head_sha ?? "") ||
    run.status !== "completed" ||
    run.conclusion !== "success"
  )
    return null;
  return {
    runId: run.id,
    sourceSha: run.head_sha,
    scope: match[1],
    batchSize: Number(match[2]),
    concurrency: Number(match[3]),
  };
}
export function enrichmentRequestAncestor(root, ancestor, descendant) {
  if (ancestor === descendant) return true;
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
      timeout: 30000,
      windowsHide: true,
    });
    return true;
  } catch (error) {
    return error.status === 1 ? false : null;
  }
}
export async function admitEnrichmentOwnerRequest({
  state,
  run,
  model,
  commit,
  isAncestor = (a, b) => enrichmentRequestAncestor(state.root, a, b),
}) {
  const request = parseEnrichmentOwnerRequest(run, state.repository);
  if (
    !request ||
    state.local.revision !== state.remote.mainHeadSha ||
    isAncestor(request.sourceSha, state.local.revision) !== true
  )
    throw failure("authorization-lost");
  if (typeof model !== "string" || !model || /\s/u.test(model))
    throw failure("provider-configuration-invalid");
  const canary = report(state.local.enrichmentCanary);
  const full = report(state.local.enrichmentFull);
  const admittedId = Number(
    /^owner-enrichment-([1-9]\d*)$/u.exec(canary?.run_id ?? "")?.[1] ?? 0,
  );
  if (request.runId <= admittedId)
    return { status: "already-admitted", runId: request.runId };
  if (canary && ["running", "awaiting-deployment"].includes(canary.status))
    return { status: "waiting", reason: "active-canary" };
  if (
    full &&
    ((full.status === "running" && hasConfirmedEnrichmentCanary(state, full)) ||
      (full.phase === "complete" && !full.deployment))
  )
    return { status: "waiting", reason: "active-full" };
  const continuing = full?.status === "running";
  if (continuing && full.expected_model !== model)
    throw failure("provider-model-mismatch");
  if (continuing && full.selection_mode !== request.scope)
    throw failure("input-superseded");
  const sources = Object.fromEntries(
    state.local.sources.map((source) => [source.id, source]),
  );
  const manifest = selectEnrichmentRecords(state.local.projects, sources, {
    force: request.scope === "all-automatic",
  }).map((project) => project.id);
  const canaryIds = selectRepresentativeCanaryIds(
    state.local.projects,
    sources,
    state.local.snapshots,
    { selectionMode: request.scope },
  );
  const now = new Date(state.nowMs).toISOString();
  const manualExclusions = manualEnrichmentExclusions(state.local.projects).map(
    ({ projectId, reason, note }) => ({
      id: projectId,
      reason_code: reason,
      enrichment_note: note,
    }),
  );
  const configuration = {
    model,
    batchSize: request.batchSize,
    concurrency: request.concurrency,
    now,
    selectionMode: request.scope,
    manualExclusions,
  };
  const nextCanary = createEnrichmentReport(
    createEnrichmentRunState({
      ...configuration,
      mode: "canary",
      runId: `owner-enrichment-${request.runId}`,
      manifest: canaryIds,
    }),
  );
  const outputs = { "data/reports/enrichment-canary.json": nextCanary };
  if (!continuing)
    outputs["data/reports/enrichment-report.json"] = createEnrichmentReport(
      createEnrichmentRunState({
        ...configuration,
        mode: "full",
        runId: `owner-enrichment-full-${request.runId}`,
        manifest,
      }),
    );
  const files = await Promise.all(
    Object.entries(outputs).map(async ([path, value]) => {
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
  const result = await commit({
    repository: state.repository,
    expectedMainSha: state.local.revision,
    files,
    message: "chore(enrichment): admit verified owner rollout",
  });
  return { status: "admitted", runId: request.runId, sha: result.sha };
}
export async function loadLatestEnrichmentOwnerRequest({ gh, repository }) {
  const response = await gh([
    "api",
    `repos/${repository}/actions/workflows/request-catalog-enrichment.yml/runs?branch=main&event=workflow_dispatch&status=success&per_page=100&page=1`,
  ]);
  if (Buffer.byteLength(response) > 4194304)
    throw failure("provider-unavailable");
  const value = JSON.parse(response);
  if (!Array.isArray(value.workflow_runs) || value.workflow_runs.length > 100)
    throw failure("provider-unavailable");
  const request = value.workflow_runs
    .filter((run) => parseEnrichmentOwnerRequest(run, repository))
    .sort((a, b) => b.id - a.id)[0];
  if (!request && value.workflow_runs.length === 100)
    throw failure("provider-unavailable");
  return request ?? null;
}
