import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { assertTrustedPreparedProducer } from "./prepared-result.mjs";
import {
  validateAutomationOperation,
  selectDueOperations,
} from "./operation.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

const kinds = {
  "refresh-catalog": "refresh",
  "enrich-catalog": "metadata",
  "review-catalog-policy": "advisory",
  "import-tavernkeeper-reports": "report-import",
  "apply-kit-submission": "kit",
  "apply-kit-withdrawal": "withdrawal",
};
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
  const kind = kinds[name];
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
      current.get(wake.operationKey).identity.kind !==
        kinds[run.path.slice(".github/workflows/".length, -4)]
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
