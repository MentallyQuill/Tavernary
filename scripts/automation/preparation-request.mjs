import { readFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateAutomationOperation } from "./operation.mjs";
import { assertTrustedAutomationContext } from "./github-inventory.mjs";
import { loadAutomationInventory } from "./inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { synchronizeWithdrawalFeedback } from "./withdrawal-feedback.mjs";

const workflowKinds = {
  "apply-kit-submission.yml": "kit",
  "apply-kit-withdrawal.yml": "withdrawal",
};
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
    if (env.GITHUB_EVENT_NAME !== "workflow_dispatch")
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
