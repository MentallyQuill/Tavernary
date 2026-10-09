import {
  validateModelBudgetState,
  createModelBudgetGuard,
  validateModelUsageEvidence,
} from "./model-budget.mjs";
import { loadPreparedGithubArtifact } from "./prepared-github.mjs";
import { decodePreparedArtifact } from "./prepared-artifact.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";

export async function loadGenerationModelUsage(input) {
  const context = await loadPreparedGithubArtifact({
    ...input,
    artifactKind: "generation-usage",
    allowMissing: true,
  });
  if (!context) return null;
  const archive = await input.download([
    "api",
    `repos/${input.repository}/actions/artifacts/${context.artifact.id}/zip`,
  ]);
  const value = decodePreparedArtifact({
    archive,
    digest: context.artifact.digest,
    filename: "automation-generation-model-usage.json",
  });
  if (
    Object.keys(value).sort().join(",") !==
      "modelUsage,operationKey,producer,schema_version" ||
    value.schema_version !== 1 ||
    value.operationKey !== input.operation.key ||
    !value.producer ||
    Object.keys(value.producer).sort().join(",") !==
      "runId,sourceSha,workflow" ||
    value.producer.runId !== context.run.id ||
    value.producer.workflow !== context.run.path ||
    value.producer.sourceSha !== context.run.head_sha
  )
    throw new Error("Generation usage evidence is invalid.");
  validateModelUsageEvidence(value.modelUsage);
  return value;
}

export async function runGenerationWithBudgetEvidence({
  generate,
  loader,
  env = process.env,
  read = readFile,
  write = writeFile,
  emit = true,
}) {
  let failed = false;
  try {
    return await generate();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    if (
      emit &&
      env.RUNNER_TEMP &&
      env.GITHUB_RUN_ID &&
      !loader.evidenceSaved?.()
    ) {
      try {
        const event = JSON.parse(await read(env.GITHUB_EVENT_PATH, "utf8"));
        const workflow = env.GITHUB_WORKFLOW_REF?.split("/")
          .slice(2)
          .join("/")
          .split("@")[0];
        if (
          !/^[a-f0-9]{64}$/u.test(event.inputs?.operation_key ?? "") ||
          !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA ?? "") ||
          !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID) ||
          ![
            ".github/workflows/generate-project-submission.yml",
            ".github/workflows/generate-project-owner-request.yml",
          ].includes(workflow)
        )
          throw fail();
        await loader.load();
        const modelUsage = validateModelUsageEvidence(loader.usage());
        if (!loader.evidenceSaved?.())
          await write(
            resolve(env.RUNNER_TEMP, "automation-generation-model-usage.json"),
            `${JSON.stringify({ schema_version: 1, operationKey: event.inputs.operation_key, producer: { runId: Number(env.GITHUB_RUN_ID), sourceSha: env.GITHUB_SHA, workflow }, modelUsage })}\n`,
            { flag: "wx" },
          );
      } catch (error) {
        if (!failed) throw error;
      }
    }
  }
}

export function createProducerBudgetLoader({
  env = process.env,
  gh = executeGh,
  event,
  nowMs,
  sleep,
  persistEvidence = (path, content, options) => {
    if (options.flag === "wx") writeFileSync(path, content, options);
    else {
      writeFileSync(`${path}.pending`, content, { flag: "w" });
      renameSync(`${path}.pending`, path);
    }
  },
} = {}) {
  let promise,
    guard,
    evidenceSaved = false;
  return {
    load: () =>
      (promise ??= (async () => {
        const metadata =
          event ?? JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
        guard = await loadProducerBudgetGuard({
          env,
          operationKey: metadata.inputs?.operation_key,
          ticketIds: String(metadata.inputs?.budget_ticket ?? "")
            .split(",")
            .filter(Boolean),
          gh,
          nowMs,
          sleep,
          requestRunId: Number(metadata.inputs?.request_run_id || 0),
        });
        const workflow = env.GITHUB_WORKFLOW_REF?.slice(
          `${env.GITHUB_REPOSITORY}/`.length,
        ).split("@")[0];
        if (
          env.RUNNER_TEMP &&
          [
            ".github/workflows/generate-project-submission.yml",
            ".github/workflows/generate-project-owner-request.yml",
          ].includes(workflow)
        ) {
          const persist = () => {
            const content = `${JSON.stringify({ schema_version: 1, operationKey: metadata.inputs.operation_key, producer: { runId: Number(env.GITHUB_RUN_ID), sourceSha: env.GITHUB_SHA, workflow }, modelUsage: guard.usage() })}\n`;
            persistEvidence(
              resolve(
                env.RUNNER_TEMP,
                "automation-generation-model-usage.json",
              ),
              content,
              { flag: evidenceSaved ? "w" : "wx" },
            );
            evidenceSaved = true;
          };
          persist();
          const complete = guard.completeRequest;
          guard.completeRequest = (request) => {
            complete(request);
            persist();
          };
        }
        return guard;
      })()),
    usage: () => guard?.usage?.() ?? [],
    evidenceSaved: () => evidenceSaved,
  };
}
const workflows = new Set([
  ".github/workflows/generate-project-submission.yml",
  ".github/workflows/generate-project-owner-request.yml",
  ".github/workflows/enrich-catalog.yml",
  ".github/workflows/review-catalog-policy.yml",
  ".github/workflows/import-tavernkeeper-reports.yml",
]);
const sleepDefault = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fail = () =>
  Object.assign(
    new Error("Verified model preparation allowance is unavailable."),
    { code: "budget-exhausted" },
  );
function trustedRun(
  run,
  {
    repository,
    publisherActorId,
    operationKey,
    workflow,
    sourceSha,
    requestRunId = 0,
  },
) {
  return (
    Number.isSafeInteger(run?.id) &&
    run.id > 0 &&
    run.path === workflow &&
    run.event === "workflow_dispatch" &&
    run.head_branch === "main" &&
    run.head_sha === sourceSha &&
    run.head_repository?.full_name?.toLowerCase() ===
      repository.toLowerCase() &&
    run.actor?.id === publisherActorId &&
    run.actor.type === "Bot" &&
    run.run_attempt === 1 &&
    run.display_title ===
      `Automation prepare ${operationKey}${requestRunId ? ` request${requestRunId}` : ""}`
  );
}
function validateContext(input, allowEmptyTickets = false) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(input.repository ?? "") ||
    !Number.isSafeInteger(input.publisherActorId) ||
    input.publisherActorId < 1 ||
    !/^[a-f0-9]{64}$/u.test(input.operationKey ?? "") ||
    !/^[a-f0-9]{40}$/u.test(input.sourceSha ?? "") ||
    !workflows.has(input.workflow) ||
    !Array.isArray(input.ticketIds) ||
    (!input.ticketIds.length && !allowEmptyTickets) ||
    input.ticketIds.length > 2 ||
    input.ticketIds.some((id) => !/^[a-f0-9]{64}$/u.test(id)) ||
    !Number.isSafeInteger(input.requestRunId ?? 0) ||
    (input.requestRunId ?? 0) < 0 ||
    (input.forceRegeneration === true && !input.requestRunId)
  )
    throw fail();
}
function json(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > 8388608)
    throw fail();
  return JSON.parse(text);
}
export async function dispatchReservedModelPreparation(input) {
  validateContext(input);
  return dispatchPreparation(input);
}
export async function dispatchUnbudgetedPreparation(input) {
  const context = { ...input, ticketIds: [] };
  validateContext(context, true);
  return dispatchPreparation(context);
}
async function dispatchPreparation(input) {
  if (
    input.checkpointRunIds !== undefined &&
    (!Array.isArray(input.checkpointRunIds) ||
      input.checkpointRunIds.length > 10 ||
      new Set(input.checkpointRunIds).size !== input.checkpointRunIds.length ||
      input.checkpointRunIds.some((id) => !Number.isSafeInteger(id) || id < 1))
  )
    throw fail();
  const advisory =
    input.workflow === ".github/workflows/review-catalog-policy.yml";
  const generation = [
    ".github/workflows/generate-project-submission.yml",
    ".github/workflows/generate-project-owner-request.yml",
  ].includes(input.workflow);
  if (
    generation &&
    (!Number.isSafeInteger(input.issueNumber) || input.issueNumber < 1)
  )
    throw fail();
  if (advisory && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(input.projectId ?? ""))
    throw fail();
  const {
    gh,
    repository,
    operationKey,
    workflow,
    sourceSha,
    ticketIds,
    nowMs,
    sleep = sleepDefault,
  } = input;
  await gh([
    "workflow",
    "run",
    workflow.slice(".github/workflows/".length),
    "--repo",
    repository,
    "--ref",
    "main",
    "-f",
    `operation_key=${operationKey}`,
    "-f",
    `budget_ticket=${ticketIds.join(",")}`,
    ...(generation
      ? [
          "-f",
          `issue_number=${input.issueNumber}`,
          "-f",
          `force_regeneration=${input.forceRegeneration === true ? "true" : "false"}`,
          "-f",
          `request_run_id=${input.requestRunId ?? 0}`,
        ]
      : []),
    ...(advisory
      ? [
          "-f",
          `project_id=${input.projectId}`,
          "-f",
          "transaction_issue_number=0",
          "-f",
          "transaction_pull_number=0",
          "-f",
          `merge_sha=${sourceSha}`,
        ]
      : []),
    ...(input.workflow ===
    ".github/workflows/generate-project-owner-request.yml"
      ? ["-f", `checkpoint_run_ids=${(input.checkpointRunIds ?? []).join(",")}`]
      : []),
  ]);
  for (let attempt = 0; attempt < 5; attempt++) {
    const page = json(
      await gh([
        "api",
        "--method",
        "GET",
        `repos/${repository}/actions/workflows/${workflow.slice(".github/workflows/".length)}/runs`,
        "-f",
        "per_page=100",
        "-f",
        "event=workflow_dispatch",
        "-f",
        `head_sha=${sourceSha}`,
      ]),
    );
    if (
      !Number.isSafeInteger(page.total_count) ||
      page.total_count < 0 ||
      page.total_count > 100 ||
      !Array.isArray(page.workflow_runs) ||
      page.workflow_runs.length > 100
    )
      throw fail();
    const runs = page.workflow_runs.filter(
      (run) =>
        trustedRun(run, input) &&
        Date.parse(run.created_at) >= nowMs - 1000 &&
        Date.parse(run.created_at) <= nowMs + 60000,
    );
    if (runs.length > 1) throw fail();
    if (runs.length === 1) return { runId: runs[0].id, workflow };
    if (attempt < 4) await sleep(2000);
  }
  throw fail();
}
export async function loadProducerBudgetGuard({
  env,
  operationKey,
  ticketIds,
  gh,
  nowMs = Date.now,
  sleep = sleepDefault,
  requestRunId = 0,
}) {
  const workflow = env.GITHUB_WORKFLOW_REF?.slice(
    `${env.GITHUB_REPOSITORY}/`.length,
  ).split("@")[0];
  const input = {
    repository: env.GITHUB_REPOSITORY,
    publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    operationKey,
    workflow,
    sourceSha: env.GITHUB_SHA,
    ticketIds,
    requestRunId,
  };
  validateContext(input);
  if (
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    Number(env.GITHUB_ACTOR_ID) !== input.publisherActorId ||
    env.GITHUB_WORKFLOW_REF !==
      `${input.repository}/${workflow}@refs/heads/main` ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "")
  )
    throw fail();
  const runId = Number(env.GITHUB_RUN_ID);
  const run = json(
    await gh(["api", `repos/${input.repository}/actions/runs/${runId}`]),
  );
  if (run.id !== runId || !trustedRun(run, input)) throw fail();
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = validateModelBudgetState(
      json(
        await gh([
          "api",
          `repos/${input.repository}/contents/data/maintenance/automation/model-budgets/global.json?ref=main`,
          "--header",
          "Accept: application/vnd.github.raw+json",
        ]),
      ),
    );
    const tickets = ticketIds.map((id) =>
      state.tickets.find((ticket) => ticket.id === id),
    );
    if (
      tickets.some(
        (ticket) =>
          !ticket ||
          ticket.operationKey !== operationKey ||
          (requestRunId &&
            !ticket.requestId.startsWith(
              `generation-request-${requestRunId}:`,
            )) ||
          ticket.settled ||
          (ticket.producer &&
            (ticket.producer.runId !== runId ||
              ticket.producer.workflow !== workflow)),
      )
    )
      throw fail();
    if (tickets.every((ticket) => ticket.producer))
      return createModelBudgetGuard({
        state,
        ticketIds,
        operationKey,
        runId,
        workflow,
        runAttempt: 1,
        nowMs,
      });
    if (attempt < 4) await sleep(12000);
  }
  throw fail();
}
