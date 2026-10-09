import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateAutomationOperation } from "./operation.mjs";
import {
  loadAutomationInventory,
  discoverAutomationState,
} from "./inventory.mjs";
import { assertTrustedAutomationContext } from "./github-inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { isReportNarrativeRetry } from "./report-operations.mjs";

export function planAutomationWorker(operation) {
  validateAutomationOperation(operation);
  if (
    operation.workerRunId !== null ||
    operation.retry?.failure.kind === "permanent"
  )
    return { action: "wait" };
  const dispatch = (workflow, inputs) => ({
    action: "dispatch",
    workflow,
    inputs,
  });
  if (operation.stage === "finalized") return { action: "finished" };
  if (operation.stage === "deployment-confirmed")
    return dispatch("automation-writer.yml", {
      mode: "finalize",
      operation_key: operation.key,
    });
  if (operation.stage === "deployment-requested")
    if (operation.identity.kind !== "deployment") return { action: "wait" };
  if (operation.stage === "deployment-requested")
    return dispatch("automation-writer.yml", {
      mode: "confirm",
      operation_key: operation.key,
    });
  if (operation.stage === "published") {
    if (operation.identity.kind !== "deployment") return { action: "wait" };
    if (!/^[a-f0-9]{40}$/u.test(operation.expectedSha ?? ""))
      throw new Error("Published work has no trusted revision.");
    return dispatch("deploy-pages.yml", { source_sha: operation.expectedSha });
  }
  const number = operation.identity.subject.match(/^issue:([1-9]\d*)$/u)?.[1];
  if (operation.stage === "discovered" && number)
    return dispatch("admit-issue.yml", { issue_number: number });
  if (["project", "owner-request"].includes(operation.identity.kind)) {
    if (operation.stage === "admitted")
      return dispatch(
        operation.identity.kind === "project"
          ? "triage-submission.yml"
          : "triage-project-owner-request.yml",
        { issue_number: number },
      );
    return dispatch("automation-writer.yml", {
      mode: "reconcile-project",
      operation_key: operation.key,
    });
  }
  if (operation.identity.kind === "kit")
    return dispatch(
      operation.stage === "validated"
        ? "apply-kit-submission.yml"
        : "triage-kit-submission.yml",
      {
        issue_number: number,
        ...(operation.stage === "validated"
          ? { operation_key: operation.key }
          : {}),
      },
    );
  if (operation.identity.kind === "withdrawal")
    return dispatch("apply-kit-withdrawal.yml", {
      issue_number: number,
      operation_key: operation.key,
    });
  if (operation.identity.kind === "refresh")
    return dispatch("refresh-catalog.yml", {
      operation_key: operation.key,
      mode: "project",
      source_id: operation.identity.subject.slice(7),
    });
  if (operation.identity.kind === "advisory" && operation.stage === "validated")
    return dispatch("automation-writer.yml", {
      mode: "advisory-notice",
      operation_key: operation.key,
    });
  if (
    operation.identity.kind === "report-import" &&
    isReportNarrativeRetry(operation)
  )
    return dispatch("automation-writer.yml", {
      mode: "prepare",
      operation_key: operation.key,
    });
  if (operation.identity.kind === "report-import")
    return dispatch("import-tavernkeeper-reports.yml", {
      operation_key: operation.key,
    });
  if (
    ["metadata", "advisory", "enrichment"].includes(operation.identity.kind)
  ) {
    return dispatch("automation-writer.yml", {
      mode: "prepare",
      operation_key: operation.key,
    });
  }
  throw new Error("Automation worker kind is unsupported.");
}

export async function runAutomationWorker({
  operationKey,
  load,
  gh,
  repository = "MentallyQuill/Tavernary",
}) {
  if (!/^[a-f0-9]{64}$/u.test(operationKey))
    throw new Error("Worker operation key is invalid.");
  const operation = (await load()).find(
    (operation) => operation.key === operationKey,
  );
  if (!operation) return { action: "superseded" };
  const plan = planAutomationWorker(operation);
  if (plan.action !== "dispatch") return plan;
  await gh([
    "workflow",
    "run",
    plan.workflow,
    "--repo",
    repository,
    "--ref",
    "main",
    ...Object.entries(plan.inputs).flatMap(([key, value]) => [
      "-f",
      `${key}=${value}`,
    ]),
  ]);
  return plan;
}

async function main() {
  const env = process.env;
  const repository = env.GITHUB_REPOSITORY;
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  assertTrustedAutomationContext(env, repository, event);
  try {
    const state = await loadAutomationInventory({
      root: process.cwd(),
      gh: executeGh,
      repository,
      publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
      nowMs: Date.now(),
    });
    // Reconstruct authority; our own dispatch intent and live handle only guard the controller.
    state.receipts = state.receipts.filter(
      (receipt) => receipt.operation.key !== env.OPERATION_KEY,
    );
    state.remote.runs = state.remote.runs.filter(
      (run) => run.id !== Number(env.GITHUB_RUN_ID),
    );
    const result = await runAutomationWorker({
      operationKey: env.OPERATION_KEY,
      load: async () => discoverAutomationState(state),
      gh: executeGh,
      repository,
    });
    console.log(JSON.stringify(result));
  } catch (error) {
    const failure = classifyAutomationFailure({
      diagnosticCode: error?.code,
      httpStatus: error?.status,
    });
    if (env.AUTOMATION_DIAGNOSTIC_PATH)
      await writeFile(
        env.AUTOMATION_DIAGNOSTIC_PATH,
        `${JSON.stringify({ schema_version: 1, operation_key: env.OPERATION_KEY, failure })}\n`,
      );
    console.error(JSON.stringify({ status: "unavailable", failure }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
