import {
  validateModelBudgetState,
  createModelBudgetGuard,
} from "./model-budget.mjs";
const workflows = new Set([
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
  { repository, publisherActorId, operationKey, workflow, sourceSha },
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
    run.display_title === `Automation prepare ${operationKey}`
  );
}
function validateContext(input) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(input.repository ?? "") ||
    !Number.isSafeInteger(input.publisherActorId) ||
    input.publisherActorId < 1 ||
    !/^[a-f0-9]{64}$/u.test(input.operationKey ?? "") ||
    !/^[a-f0-9]{40}$/u.test(input.sourceSha ?? "") ||
    !workflows.has(input.workflow) ||
    !Array.isArray(input.ticketIds) ||
    !input.ticketIds.length ||
    input.ticketIds.length > 2 ||
    input.ticketIds.some((id) => !/^[a-f0-9]{64}$/u.test(id))
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
