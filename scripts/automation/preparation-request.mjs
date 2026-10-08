import { readFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  validateAutomationOperation,
  selectDueOperations,
} from "./operation.mjs";
import { assertTrustedAutomationContext } from "./github-inventory.mjs";
import {
  loadAutomationInventory,
  discoverAutomationState,
} from "./inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { synchronizeWithdrawalFeedback } from "./withdrawal-feedback.mjs";
import { REFRESH_COMPANION_SOURCE_ID } from "./catalog-operations.mjs";
import { selectRefreshSources } from "../catalog/refresh-repositories.mjs";
import {
  isReportNarrativeRetry,
  reportOperationDigest,
} from "./report-operations.mjs";

const workflowKinds = {
  "apply-kit-submission.yml": "kit",
  "apply-kit-withdrawal.yml": "withdrawal",
  "review-catalog-policy.yml": "advisory",
  "refresh-catalog.yml": "refresh",
  "import-tavernkeeper-reports.yml": "report-import",
};
export function planReportPreparationRequests({ state, reportDigest }) {
  if (
    reportDigest &&
    (!/^[a-f0-9]{64}$/u.test(reportDigest) ||
      !state.local.reportIndex?.reports.some(
        (entry) => entry.report_digest === reportDigest,
      ))
  )
    throw new Error("Report request digest is invalid.");
  return selectDueOperations(
    state.operations.filter(
      (operation) =>
        operation.identity.kind === "report-import" &&
        operation.stage === "admitted" &&
        (reportDigest
          ? isReportNarrativeRetry(operation) &&
            reportOperationDigest(operation) === reportDigest
          : !isReportNarrativeRetry(operation)),
    ),
    { nowMs: state.nowMs, limit: 20 },
  ).map((operation) => ({
    workflow: isReportNarrativeRetry(operation)
      ? "automation-writer.yml"
      : "import-tavernkeeper-reports.yml",
    inputs: {
      operation_key: operation.key,
      ...(isReportNarrativeRetry(operation) ? { mode: "prepare" } : {}),
    },
  }));
}
export function planRefreshPreparationRequests({
  state,
  mode = "incremental",
  sourceId,
  batchSize = 12,
}) {
  const selected = new Set(
    selectRefreshSources(state.local.sources, state.local.snapshots, {
      mode,
      sourceId,
      batchSize,
    }).map((source) => source.id),
  );
  if (mode === "incremental") selected.add(REFRESH_COMPANION_SOURCE_ID);
  const explicit = ["baseline", "project", "forensic"].includes(mode);
  return selectDueOperations(
    state.operations
      .filter(
        (operation) =>
          operation.identity.kind === "refresh" &&
          operation.stage === "admitted" &&
          selected.has(operation.identity.subject.slice(7)),
      )
      .map((operation) =>
        explicit ? { ...operation, nextEligibleAt: null } : operation,
      ),
    { nowMs: state.nowMs, limit: 20 },
  ).map((operation) => ({
    workflow: "refresh-catalog.yml",
    inputs: {
      mode: mode === "forensic" ? "forensic" : "project",
      source_id: operation.identity.subject.slice(7),
      operation_key: operation.key,
    },
  }));
}
export function planAdvisoryPreparationRequests({ state, projectId }) {
  if (projectId && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(projectId))
    throw new Error("Advisory request identity is invalid.");
  return selectDueOperations(
    state.operations.filter(
      (operation) =>
        operation.identity.kind === "advisory" &&
        ["admitted", "validated"].includes(operation.stage) &&
        (!projectId || operation.identity.subject.split(":")[2] === projectId),
    ),
    { nowMs: state.nowMs, limit: 10 },
  ).map((operation) => ({
    workflow: "automation-writer.yml",
    inputs: {
      mode: operation.stage === "validated" ? "advisory-notice" : "prepare",
      operation_key: operation.key,
    },
  }));
}
export function planPreparationRequest({ state, workflow, issueNumber }) {
  const kind = workflowKinds[workflow];
  if (!kind || !Number.isSafeInteger(issueNumber) || issueNumber < 1)
    throw new Error("Preparation request context is invalid.");
  state.operations.forEach(validateAutomationOperation);
  const operations = state.operations.filter(
    (operation) =>
      operation.identity.kind === kind &&
      operation.identity.subject === `issue:${issueNumber}` &&
      operation.stage === "validated" &&
      operation.retry?.failure.kind !== "permanent" &&
      operation.workerRunId === null,
  );
  if (operations.length > 1)
    throw new Error("Preparation request has ambiguous current authority.");
  if (!operations.length) return { action: "wait" };
  return {
    action: "dispatch",
    workflow,
    inputs: {
      issue_number: String(issueNumber),
      operation_key: operations[0].key,
    },
  };
}
export async function runPreparationRequestCli(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? console.log;
  try {
    const repository = env.GITHUB_REPOSITORY;
    const event =
      options.event ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    assertTrustedAutomationContext(env, repository, event);
    if (!["workflow_dispatch", "schedule"].includes(env.GITHUB_EVENT_NAME))
      throw new Error("Preparation request must be explicitly dispatched.");
    const workflow = /^\.github\/workflows\/([a-z0-9-]+\.yml)$/u.exec(
      env.GITHUB_WORKFLOW_REF?.slice(`${repository}/`.length).split("@")[0],
    )?.[1];
    if (
      env.GITHUB_WORKFLOW_REF !==
        `${repository}/.github/workflows/${workflow}@refs/heads/main` ||
      !workflowKinds[workflow]
    )
      throw new Error("Preparation request workflow is invalid.");
    if (
      env.GITHUB_EVENT_NAME === "schedule" &&
      ![
        "review-catalog-policy.yml",
        "refresh-catalog.yml",
        "import-tavernkeeper-reports.yml",
      ].includes(workflow)
    )
      throw new Error("Scheduled request workflow is invalid.");
    const state = await (
      options.load ??
      (() =>
        loadAutomationInventory({
          root: process.cwd(),
          gh: executeGh,
          repository,
          publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
          nowMs: Date.now(),
        }))
    )();
    const requestRunId = Number(env.GITHUB_RUN_ID);
    if (
      workflow !== "import-tavernkeeper-reports.yml" &&
      Number.isSafeInteger(requestRunId) &&
      requestRunId > 0
    ) {
      state.remote = {
        ...state.remote,
        runs: state.remote.runs.filter((run) => run.id !== requestRunId),
      };
      state.operations = discoverAutomationState(state);
    }
    if (workflow === "import-tavernkeeper-reports.yml") {
      const reportDigest = event.inputs?.retry_report_digest;
      if (
        reportDigest &&
        (env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
          env.GITHUB_ACTOR_ID !== "2625904")
      )
        throw new Error("Narrative retry requires current owner authority.");
      const requests = planReportPreparationRequests({ state, reportDigest });
      if (env.GITHUB_OUTPUT)
        await appendFile(env.GITHUB_OUTPUT, `requests=${requests.length}\n`);
      write(JSON.stringify(requests));
      return 0;
    }
    if (workflow === "review-catalog-policy.yml") {
      if (
        env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
        !event.inputs?.project_id
      )
        throw new Error("Advisory project is required.");
      const requests = planAdvisoryPreparationRequests({
        state,
        projectId: event.inputs?.project_id,
      });
      if (env.GITHUB_OUTPUT)
        await appendFile(env.GITHUB_OUTPUT, `requests=${requests.length}\n`);
      write(JSON.stringify(requests));
      return 0;
    }
    if (workflow === "refresh-catalog.yml") {
      const requests = planRefreshPreparationRequests({
        state,
        mode: event.inputs?.mode ?? "incremental",
        sourceId: event.inputs?.source_id,
        batchSize: Number(event.inputs?.batch_size ?? 12),
      });
      if (env.GITHUB_OUTPUT)
        await appendFile(env.GITHUB_OUTPUT, `requests=${requests.length}\n`);
      write(JSON.stringify(requests));
      return 0;
    }
    const issueNumber = Number(event.inputs?.issue_number);
    const plan = planPreparationRequest({ state, workflow, issueNumber });
    if (workflow === "apply-kit-withdrawal.yml")
      await (options.feedback ?? synchronizeWithdrawalFeedback)({
        state,
        issueNumber,
      });
    if (env.GITHUB_OUTPUT)
      await appendFile(
        env.GITHUB_OUTPUT,
        `prepare=${plan.action === "dispatch"}\n${plan.action === "dispatch" ? `operation_key=${plan.inputs.operation_key}\n` : ""}`,
      );
    write(JSON.stringify(plan));
    return 0;
  } catch {
    write(JSON.stringify({ status: "unavailable" }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runPreparationRequestCli();
