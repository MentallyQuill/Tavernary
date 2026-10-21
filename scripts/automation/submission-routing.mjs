import { readFile, readdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  discoverProjectOperations,
  projectIssueMatchesTransaction,
  retryableCopyReviewPull,
} from "./project-operations.mjs";
import { parseProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { validateAutomationReceipt } from "./receipts.mjs";
import { inspectProjectRetry } from "./project-retries.mjs";

export function isDirectSubmissionKind(kind) {
  return ["project", "owner-request", "kit", "withdrawal"].includes(kind);
}

export function generationRequestMode(inputs = {}) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs))
    throw new Error("Legacy generation envelope is incomplete.");
  const key = inputs.operation_key ?? "";
  const ticket = inputs.budget_ticket ?? "";
  const request = inputs.request_run_id ?? 0;
  const checkpoints = inputs.checkpoint_run_ids ?? "";
  if (
    key === "" &&
    ticket === "" &&
    [0, "0", ""].includes(request) &&
    checkpoints === ""
  )
    return "direct";
  const tickets = typeof ticket === "string" ? ticket.split(",") : [];
  const ids =
    typeof checkpoints === "string" && checkpoints
      ? checkpoints.split(",")
      : [];
  if (
    typeof key !== "string" ||
    !/^[a-f0-9]{64}$/u.test(key) ||
    tickets.length < 1 ||
    tickets.length > 2 ||
    tickets.some((value) => !/^[a-f0-9]{64}$/u.test(value)) ||
    new Set(tickets).size !== tickets.length ||
    !/^(?:0|[1-9]\d*)$/u.test(String(request)) ||
    !Number.isSafeInteger(Number(request)) ||
    typeof checkpoints !== "string" ||
    ids.length > 10 ||
    ids.some(
      (value) =>
        !/^[1-9]\d*$/u.test(value) || !Number.isSafeInteger(Number(value)),
    ) ||
    new Set(ids).size !== ids.length
  )
    throw new Error("Legacy generation envelope is incomplete.");
  return "legacy";
}

export function planDirectGeneration(input) {
  const issue = input.issues[0];
  const producer = issue?.labels.some(
    (label) => (label.name ?? label) === "project-owner-request",
  )
    ? "project-owner-request"
    : "project-submission";
  const repository = input.repository ?? "MentallyQuill/Tavernary";
  const pull = input.pulls.find(
    (pull) =>
      pull.state === "open" &&
      pull.head?.ref === `automation/${producer}-${issue?.number}`,
  );
  if (pull) {
    const transaction = parseProjectPublicationTransaction(pull.body ?? "");
    const trusted =
      pull.user?.id === input.publisherActorId &&
      pull.user.type === "Bot" &&
      pull.head?.repo?.full_name === repository &&
      pull.base?.repo?.full_name === repository &&
      pull.base.ref === "main" &&
      transaction?.producer === producer &&
      transaction.issue_number === issue.number;
    if (!trusted) return { action: "wait", reason: "maintainer-review" };
    if (
      transaction.generated_head_sha !== pull.head.sha &&
      (producer === "project-owner-request" || !input.forceRegeneration)
    )
      return { action: "wait", reason: "maintainer-review" };
    if (
      !input.forceRegeneration &&
      !retryableCopyReviewPull({ ...input, issue, pull }) &&
      (!input.currentMainSha ||
        transaction.base_sha === input.currentMainSha) &&
      projectIssueMatchesTransaction({
        issue,
        transaction,
        catalog: input.catalog,
      })
    )
      return { action: "wait", reason: "existing-review-pr" };
  }
  const [operation] = discoverProjectOperations({
    ...input,
    pulls: [],
    runs: input.runs.filter(
      (run) =>
        run.id !== input.currentRunId &&
        (run.display_title?.startsWith("Automation prepare ") ||
          run.id < input.currentRunId),
    ),
  });
  if (!operation) return { action: "wait", reason: "input-not-eligible" };
  if (operation.workerRunId)
    return { action: "wait", reason: "active-generation" };
  if (operation.retry?.failure.kind === "permanent")
    return { action: "wait", reason: "maintainer-review" };
  if (
    operation.nextEligibleAt &&
    Date.parse(operation.nextEligibleAt) > input.nowMs
  )
    return { action: "wait", reason: "retry-not-due" };
  return { action: "generate" };
}

export async function runDirectGenerationGuard({
  env = process.env,
  gh = executeGh,
  root = process.cwd(),
} = {}) {
  const event = JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
  if (generationRequestMode(event.inputs) === "legacy")
    return { action: "generate" };
  const issueNumber = Number(event.inputs?.issue_number);
  const producer = env.GITHUB_WORKFLOW_REF?.split("@")[0]
    .split("/")
    .at(-1)
    ?.replace(/^generate-|\.yml$/gu, "");
  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1 ||
    !["project-submission", "project-owner-request"].includes(producer) ||
    !env.GITHUB_REPOSITORY
  )
    throw new Error("Invalid direct generation context.");
  const api = async (path) => JSON.parse(await gh(["api", path]));
  const repository = env.GITHUB_REPOSITORY;
  const records = async (path) =>
    Promise.all(
      (await readdir(resolve(root, path)))
        .filter((name) => name.endsWith(".json"))
        .map(async (name) =>
          JSON.parse(await readFile(resolve(root, path, name), "utf8")),
        ),
    );
  const [issue, pulls, projects, sources, batches, reference] =
    await Promise.all([
      api(`repos/${repository}/issues/${issueNumber}`),
      api(
        `repos/${repository}/pulls?state=open&base=main&head=${encodeURIComponent(`${repository.split("/")[0]}:automation/${producer}-${issueNumber}`)}&per_page=100`,
      ),
      records("data/registry/projects"),
      records("data/registry/sources"),
      Promise.all(
        ["queued", "pending", "requested", "waiting", "in_progress"].map(
          async (status) => {
            const runs = [];
            for (let page = 1; ; page++) {
              const batch = await api(
                `repos/${repository}/actions/workflows/generate-${producer}.yml/runs?event=workflow_dispatch&branch=main&status=${status}&per_page=100&page=${page}`,
              );
              if (!Array.isArray(batch.workflow_runs))
                throw new Error("Invalid generation run inventory.");
              runs.push(...batch.workflow_runs);
              if (batch.workflow_runs.length < 100) return runs;
            }
          },
        ),
      ),
      api(`repos/${repository}/git/ref/heads/main`),
    ]);
  if (!/^[a-f0-9]{40}$/u.test(reference?.object?.sha ?? ""))
    throw new Error("Direct generation main revision is invalid.");
  if (!Array.isArray(pulls))
    throw new Error("Invalid generation PR inventory.");
  const input = {
    issues: [issue],
    pulls,
    runs: batches.flat(),
    receipts: [],
    catalog: { projects, sources },
    publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    repository,
    currentMainSha: reference.object.sha,
    currentRunId: Number(env.GITHUB_RUN_ID),
    nowMs: Date.now(),
    forceRegeneration:
      event.inputs.force_regeneration === true ||
      event.inputs.force_regeneration === "true",
  };
  const retry = await inspectProjectRetry({
    state: {
      repository,
      publisherActorId: input.publisherActorId,
      nowMs: input.nowMs,
      remote: { issues: [issue], runs: input.runs },
      local: { projects, sources },
    },
    issue,
    gh,
  });
  input.deferredRetries = new Map(
    retry.notBefore ? [[issueNumber, retry.notBefore]] : [],
  );
  const [operation] = discoverProjectOperations({
    ...input,
    pulls: [],
    runs: [],
  });
  if (operation) {
    try {
      const receipt = validateAutomationReceipt(
        JSON.parse(
          await readFile(
            resolve(
              root,
              `data/maintenance/automation/operations/${operation.key}.json`,
            ),
            "utf8",
          ),
        ),
      );
      if (receipt.operation.key !== operation.key)
        throw new Error("Generation receipt identity changed.");
      input.receipts.push(receipt);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return planDirectGeneration(input);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const plan = await runDirectGenerationGuard();
  await appendFile(
    process.env.GITHUB_OUTPUT,
    `generate=${plan.action === "generate"}\n`,
  );
  console.log(JSON.stringify(plan));
}
