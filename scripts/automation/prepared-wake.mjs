import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertTrustedPreparedProducer } from "./prepared-result.mjs";
import {
  validateAutomationOperation,
  selectDueOperations,
} from "./operation.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { trustedRestoreRun } from "./restore-source.mjs";
import { parseEnrichmentOwnerRequest } from "./enrichment-owner-request.mjs";

const kinds = {
  "refresh-catalog": "refresh",
  "enrich-catalog": ["metadata", "enrichment"],
  "review-catalog-policy": "advisory",
  "import-tavernkeeper-reports": "report-import",
  "apply-kit-submission": "kit",
  "apply-kit-withdrawal": "withdrawal",
};
function trustedDeploymentWake(run, env, repository, runId) {
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID);
  return (
    repository === "MentallyQuill/Tavernary" &&
    env.GITHUB_WORKFLOW_REF ===
      `${repository}/.github/workflows/automation-prepared.yml@refs/heads/main` &&
    Number.isSafeInteger(publisherActorId) &&
    publisherActorId > 0 &&
    run?.id === runId &&
    run.path === ".github/workflows/deploy-pages.yml" &&
    run.head_branch === "main" &&
    /^[a-f0-9]{40}$/u.test(run.head_sha ?? "") &&
    /^Site: Deploy [a-f0-9]{40}$/u.test(run.display_title ?? "") &&
    run.status === "completed" &&
    ["success", "failure", "cancelled", "timed_out"].includes(run.conclusion) &&
    Number.isSafeInteger(run.repository?.id) &&
    run.repository.id > 0 &&
    run.repository.full_name === repository &&
    run.head_repository?.id === run.repository.id &&
    run.head_repository.full_name === repository &&
    Number.isSafeInteger(run.actor?.id) &&
    run.actor.id > 0 &&
    (run.event === "push" ||
      (run.event === "workflow_dispatch" &&
        [2625904, publisherActorId].includes(run.actor.id)))
  );
}
export function planPreparedWake({
  run,
  repository,
  publisherActorId,
  diagnostic = false,
}) {
  if (
    !Number.isSafeInteger(publisherActorId) ||
    publisherActorId < 1 ||
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "")
  )
    return null;
  const operationKey = /^Automation prepare ([a-f0-9]{64})$/u.exec(
    run?.display_title ?? "",
  )?.[1];
  const name = /^\.github\/workflows\/([a-z0-9-]+)\.yml$/u.exec(
    run?.path ?? "",
  )?.[1];
  const kind = Array.isArray(kinds[name]) ? kinds[name][0] : kinds[name];
  if (!operationKey || !kind) return null;
  try {
    assertTrustedPreparedProducer({
      kind,
      repository,
      publisherActorId,
      run,
      requireSuccess: !diagnostic,
    });
  } catch {
    return null;
  }
  return {
    operationKey,
    runId: run.id,
    ...(diagnostic ? { diagnostic: true } : {}),
  };
}
export function selectPreparedWakes({
  runs,
  operations,
  repository,
  publisherActorId,
  limit = 20,
  nowMs = Date.now(),
  includeDiagnostics = false,
}) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 20)
    throw new Error("Prepared wake quota is invalid.");
  operations.forEach(validateAutomationOperation);
  const current = new Map(
    selectDueOperations(operations, { nowMs, limit: 20 })
      .filter(
        (operation) =>
          ![
            "published",
            "deployment-requested",
            "deployment-confirmed",
            "finalized",
          ].includes(operation.stage) &&
          !["permanent", "superseded"].includes(operation.retry?.failure.kind),
      )
      .map((operation) => [operation.key, operation]),
  );
  const selected = new Map();
  for (const run of runs) {
    const wake = planPreparedWake({
      run,
      repository,
      publisherActorId,
      diagnostic: includeDiagnostics && run.conclusion !== "success",
    });
    if (
      !wake ||
      !current.has(wake.operationKey) ||
      ![kinds[run.path.slice(".github/workflows/".length, -4)]]
        .flat()
        .includes(current.get(wake.operationKey).identity.kind)
    )
      continue;
    if (
      !selected.has(wake.operationKey) ||
      selected.get(wake.operationKey).runId < wake.runId
    )
      selected.set(wake.operationKey, wake);
  }
  return [...selected.values()]
    .sort(
      (a, b) =>
        current
          .get(a.operationKey)
          .createdAt.localeCompare(current.get(b.operationKey).createdAt) ||
        a.operationKey.localeCompare(b.operationKey),
    )
    .slice(0, limit);
}
export async function runPreparedWakeCli(options = {}) {
  const env = options.env ?? process.env;
  const gh = options.gh ?? executeGh;
  const write = options.write ?? console.log;
  try {
    if (
      env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_EVENT_NAME !== "workflow_run"
    )
      throw new Error("Prepared wake requires trusted completion context.");
    const repository = env.GITHUB_REPOSITORY;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? ""))
      throw new Error("Prepared wake repository is invalid.");
    const runId =
      options.runId ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8")).workflow_run
        ?.id;
    if (!Number.isSafeInteger(runId) || runId < 1)
      throw new Error("Prepared wake run is invalid.");
    const run = JSON.parse(
      await gh(["api", `repos/${repository}/actions/runs/${runId}`]),
    );
    if (
      env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/automation-prepared.yml@refs/heads/main` &&
      run.id === runId &&
      parseEnrichmentOwnerRequest(run, repository)
    ) {
      await gh([
        "workflow",
        "run",
        "automation-writer.yml",
        "--repo",
        repository,
        "--ref",
        "main",
        "-f",
        "mode=enrichment-request",
        "-f",
        `result_run_id=${runId}`,
      ]);
      write(
        JSON.stringify({
          status: "dispatched",
          mode: "enrichment-request",
          runId,
        }),
      );
      return 0;
    }
    if (
      env.GITHUB_WORKFLOW_REF ===
        `${repository}/.github/workflows/automation-prepared.yml@refs/heads/main` &&
      trustedRestoreRun(run, {
        repository,
        runId,
        currentMainSha: run.head_sha,
        isAncestor: () => false,
      })
    ) {
      await gh([
        "workflow",
        "run",
        "automation-writer.yml",
        "--repo",
        repository,
        "--ref",
        "main",
        "-f",
        "mode=confirm-restore",
        "-f",
        `result_run_id=${runId}`,
      ]);
      write(
        JSON.stringify({
          status: "dispatched",
          mode: "confirm-restore",
          runId,
        }),
      );
      return 0;
    }
    if (trustedDeploymentWake(run, env, repository, runId)) {
      await gh([
        "workflow",
        "run",
        "automation-writer.yml",
        "--repo",
        repository,
        "--ref",
        "main",
        "-f",
        "mode=confirm",
        "-f",
        `result_run_id=${runId}`,
      ]);
      write(JSON.stringify({ status: "dispatched", mode: "confirm", runId }));
      return 0;
    }
    const wake =
      run.id === runId
        ? planPreparedWake({
            run,
            repository,
            publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
            diagnostic: run.conclusion !== "success",
          })
        : null;
    if (!wake) {
      write(JSON.stringify({ status: "ignored" }));
      return 0;
    }
    await gh([
      "workflow",
      "run",
      "automation-writer.yml",
      "--repo",
      repository,
      "--ref",
      "main",
      "-f",
      wake.diagnostic ? "mode=reconcile" : "mode=publish",
      "-f",
      `operation_key=${wake.operationKey}`,
      "-f",
      `result_run_id=${wake.runId}`,
    ]);
    write(JSON.stringify({ status: "dispatched", ...wake }));
    return 0;
  } catch {
    write(JSON.stringify({ status: "unavailable" }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runPreparedWakeCli();
