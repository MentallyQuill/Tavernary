import { validateAutomationReceipt } from "./receipts.mjs";
import { validateAutomationOperation } from "./operation.mjs";

const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;
function repositoryPath(repository) {
  if (!repositoryPattern.test(repository))
    throw new Error("Automation repository is invalid.");
  return `repos/${repository}`;
}
export function githubFailureStatus(error) {
  return (
    error?.status ??
    Number(String(error?.message ?? "").match(/\bHTTP (\d{3})\b/u)?.[1])
  );
}
export function assertTrustedAutomationContext(env, repository, event = {}) {
  repositoryPath(repository);
  if (
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_REPOSITORY !== repository
  )
    throw new Error("Automation apply requires trusted main code.");
  if (env.GITHUB_EVENT_NAME === "schedule") return;
  // The existing TavernKeeper integration can request factual imports only.
  if (
    env.GITHUB_EVENT_NAME === "workflow_dispatch" &&
    repository === "MentallyQuill/Tavernary" &&
    env.GITHUB_ACTOR_ID === "311860138" &&
    env.GITHUB_WORKFLOW_REF ===
      `${repository}/.github/workflows/import-tavernkeeper-reports.yml@refs/heads/main` &&
    !event.inputs?.operation_key &&
    !event.inputs?.retry_report_digest
  )
    return;
  if (
    ["workflow_dispatch", "issues"].includes(env.GITHUB_EVENT_NAME) &&
    ["2625904", env.TAVERNARY_PUBLISHER_BOT_ID]
      .filter(Boolean)
      .includes(env.GITHUB_ACTOR_ID)
  )
    return;
  const run = event.workflow_run;
  const paths = new Set([
    "ci.yml",
    "admit-issue.yml",
    "triage-submission.yml",
    "triage-project-owner-request.yml",
    "triage-kit-submission.yml",
    "publish-project-transaction.yml",
    "generate-project-submission.yml",
    "generate-project-owner-request.yml",
    "apply-kit-submission.yml",
    "apply-kit-withdrawal.yml",
    "automation-worker.yml",
    "automation-writer.yml",
    "deploy-pages.yml",
  ]);
  if (
    env.GITHUB_EVENT_NAME === "workflow_run" &&
    run?.head_repository?.full_name === repository &&
    paths.has(String(run.path ?? "").replace(/^\.github\/workflows\//u, "")) &&
    (run.head_branch === "main" ||
      (run.path === ".github/workflows/ci.yml" &&
        /^automation\/project-(?:submission|owner-request)-[1-9]\d*$/u.test(
          run.head_branch,
        )))
  )
    return;
  throw new Error("Automation actor or wake is not trusted.");
}
export function assertCanonicalWriterContext(env, repository, event = {}) {
  assertTrustedAutomationContext(env, repository, event);
  if (
    env.GITHUB_WORKFLOW_REF !==
    `${repository}/.github/workflows/automation-writer.yml@refs/heads/main`
  )
    throw new Error("Canonical writer custody is invalid.");
}

async function inventoryPage(gh, path, fields, page) {
  const raw = await gh([
    "api",
    "--method",
    "GET",
    path,
    "-f",
    "per_page=100",
    ...fields.flatMap((field) => ["-f", field]),
    "-f",
    `page=${page}`,
    "--jq",
    "[.]",
  ]);
  if (Buffer.byteLength(raw, "utf8") > 4 * 1024 * 1024)
    throw new Error("GitHub inventory page exceeds its byte bound.");
  const value = JSON.parse(raw);
  if (!Array.isArray(value) || value.length !== 1)
    throw new Error("GitHub returned an invalid inventory page.");
  return value[0];
}
async function pages(
  gh,
  path,
  fields = [],
  stop = () => false,
  allowPrefix = false,
) {
  const found = [];
  for (let page = 1; page <= 20; page++) {
    const value = await inventoryPage(gh, path, fields, page);
    if (!Array.isArray(value) || value.length > 100)
      throw new Error("GitHub returned an invalid list inventory.");
    found.push(value);
    if (value.length < 100 || stop(value)) return found;
  }
  if (allowPrefix) return found;
  throw new Error("GitHub current-work inventory exceeds its page bound.");
}
function runPages(value) {
  if (
    value.some(
      (page) =>
        !Array.isArray(page.workflow_runs) ||
        page.workflow_runs.length > 100 ||
        !Number.isSafeInteger(page.total_count) ||
        page.total_count < 0,
    )
  )
    throw new Error("GitHub returned an invalid run inventory.");
  return value.flatMap((page) => page.workflow_runs);
}
async function boundedRunPages(gh, path, fields) {
  // Probe one page before following links: an over-cap search must be split,
  // and an over-cap active/final-worker inventory must fail closed.
  const first = [await inventoryPage(gh, path, fields, 1)];
  runPages(first);
  if (first[0].total_count > 1000 || first[0].total_count <= 100) return first;
  for (let page = 2; page <= 10; page++) {
    const next = [await inventoryPage(gh, path, fields, page)];
    runPages(next);
    if (next[0].total_count > 1000)
      throw new Error("Workflow inventory changed beyond GitHub's result cap.");
    first.push(...next);
    if (next[0].workflow_runs.length < 100 || page * 100 >= next[0].total_count)
      return first;
  }
  throw new Error("Workflow inventory exceeds its page bound.");
}
export async function loadAutomationWorkerRuns({ gh, repository, nowMs }) {
  const value = await boundedRunPages(
    gh,
    `${repositoryPath(repository)}/actions/workflows/automation-worker.yml/runs`,
    [
      "branch=main",
      "event=workflow_dispatch",
      `created=>=${new Date(nowMs - 3_600_000).toISOString()}`,
    ],
  );
  if ((value[0]?.total_count ?? 0) > 1000)
    throw new Error("Final worker inventory exceeds GitHub's result cap.");
  return runPages(value);
}
export async function loadGenerationOwnerRequestRuns({
  gh,
  repository,
  issues,
  nowMs,
}) {
  const open = issues.filter(
    (issue) =>
      issue.state === "open" &&
      !issue.pull_request &&
      issue.labels?.some((label) =>
        ["project-submission", "project-owner-request"].includes(
          typeof label === "string" ? label : label.name,
        ),
      ),
  );
  if (!open.length) return [];
  const start = Math.min(...open.map((issue) => Date.parse(issue.created_at)));
  if (!Number.isFinite(start) || !Number.isFinite(nowMs) || start > nowMs)
    throw new Error("Generation request history clock is unavailable.");
  let searches = 0;
  const found = new Map();
  for (const workflow of [
    "generate-project-submission.yml",
    "generate-project-owner-request.yml",
  ]) {
    async function window(lower, upper) {
      if (++searches > 64)
        throw new Error(
          "Generation request history exceeds its bounded search budget.",
        );
      const value = await boundedRunPages(
        gh,
        `${repositoryPath(repository)}/actions/workflows/${workflow}/runs`,
        [
          "branch=main",
          "event=workflow_dispatch",
          "status=success",
          "actor=MentallyQuill",
          `created=${new Date(lower).toISOString()}..${new Date(upper).toISOString()}`,
        ],
      );
      if (value[0].total_count > 1000) {
        if (upper - lower <= 1000)
          throw new Error(
            "Generation request history exceeds GitHub's result cap in one second.",
          );
        const middle = Math.floor((lower + upper) / 2);
        await window(lower, middle);
        await window(middle, upper);
      } else {
        for (const run of runPages(value)) found.set(run.id, run);
      }
    }
    await window(start, nowMs);
  }
  return [...found.values()];
}
export async function loadGithubAutomationInventory({
  gh,
  repository,
  receipts,
  referencedOperations = [],
  nowMs,
}) {
  const root = repositoryPath(repository);
  if (!Number.isSafeInteger(nowMs) || nowMs < 90 * 86_400_000)
    throw new Error("GitHub inventory retention clock is invalid.");
  const cutoff = nowMs - 90 * 86_400_000;
  const recentClosure = (row) => {
    const updated = Date.parse(row.updated_at);
    if (!Number.isFinite(updated) || updated > nowMs + 300000)
      throw new Error("GitHub closed inventory clock is invalid.");
    return updated >= cutoff;
  };
  const [openIssues, closedIssues, openPulls, closedPulls, reference] =
    await Promise.all([
      pages(gh, `${root}/issues`, ["state=open"]),
      pages(
        gh,
        `${root}/issues`,
        [
          "state=closed",
          "sort=updated",
          "direction=desc",
          `since=${new Date(cutoff).toISOString()}`,
        ],
        (page) => page.some((row) => !recentClosure(row)),
        true,
      ),
      pages(gh, `${root}/pulls`, ["state=open"]),
      pages(
        gh,
        `${root}/pulls`,
        ["state=closed", "sort=updated", "direction=desc"],
        (page) => page.some((row) => !recentClosure(row)),
        true,
      ),
      gh(["api", `${root}/git/ref/heads/main`]).then(JSON.parse),
    ]);
  const issuePages = [...openIssues, closedIssues.flat().filter(recentClosure)];
  const pullPages = [...openPulls, closedPulls.flat().filter(recentClosure)];
  if (
    issuePages.some((page) => !Array.isArray(page)) ||
    pullPages.some((page) => !Array.isArray(page)) ||
    !/^[a-f0-9]{40}$/u.test(reference?.object?.sha ?? "")
  )
    throw new Error("GitHub returned an invalid authoritative inventory.");
  let searches = 0;
  async function window(start, end) {
    if (++searches > 64)
      throw new Error("Workflow inventory exceeded its bounded search budget.");
    const value = await boundedRunPages(gh, `${root}/actions/runs`, [
      `created=${new Date(start).toISOString()}..${new Date(end).toISOString()}`,
    ]);
    if ((value[0]?.total_count ?? 0) > 1000) {
      if (end - start <= 1000)
        throw new Error(
          "Workflow inventory exceeds GitHub's result cap in one second.",
        );
      const middle = Math.floor((start + end) / 2);
      return [...(await window(start, middle)), ...(await window(middle, end))];
    }
    return runPages(value);
  }
  const recent = await window(nowMs - 7 * 86_400_000, nowMs);
  const active = [];
  for (const status of [
    "queued",
    "in_progress",
    "waiting",
    "requested",
    "pending",
  ]) {
    const value = await boundedRunPages(gh, `${root}/actions/runs`, [
      `status=${status}`,
    ]);
    if ((value[0]?.total_count ?? 0) > 1000)
      throw new Error("Active workflow inventory exceeds GitHub's result cap.");
    active.push(...runPages(value));
  }
  const runs = new Map([...recent, ...active].map((run) => [run.id, run]));
  for (const receipt of receipts) {
    validateAutomationReceipt(receipt);
    if (receipt.operation.stage === "finalized") continue;
    const requestId =
      receipt.operation.identity.kind === "report-import"
        ? Number(
            /\.narrative-([1-9]\d*)$/u.exec(
              receipt.operation.identity.policyVersion,
            )?.[1],
          )
        : null;
    const ids = new Set(
      [receipt.operation.workerRunId, requestId].filter(
        (id) => Number.isSafeInteger(id) && id > 0,
      ),
    );
    for (const id of ids) {
      if (runs.has(id)) continue;
      try {
        const run = JSON.parse(await gh(["api", `${root}/actions/runs/${id}`]));
        if (run.id !== id || typeof run.status !== "string")
          throw new Error("GitHub returned an invalid saved worker.");
        runs.set(id, run);
      } catch (error) {
        if (githubFailureStatus(error) !== 404) throw error;
        // A deleted/expired handle is not live; durable retry state still survives.
        runs.delete(id);
      }
    }
  }
  const issues = new Map(
    issuePages.flat().map((issue) => [issue.number, issue]),
  );
  const pulls = new Map(pullPages.flat().map((pull) => [pull.number, pull]));
  const references = new Set();
  for (const operation of [
    ...receipts.map((receipt) => receipt.operation),
    ...referencedOperations,
  ]) {
    validateAutomationOperation(operation);
    if (operation.stage === "finalized") continue;
    const number = Number(
      /^issue:([1-9]\d*)$/u.exec(operation.identity.subject)?.[1],
    );
    if (Number.isSafeInteger(number) && number > 0) references.add(number);
  }
  if (references.size > 2000)
    throw new Error("Pending issue references exceed their inventory bound.");
  for (const number of references) {
    if (issues.has(number)) continue;
    try {
      const issue = JSON.parse(await gh(["api", `${root}/issues/${number}`]));
      if (issue.number !== number || !["open", "closed"].includes(issue.state))
        throw new Error("GitHub returned an invalid pending issue reference.");
      issues.set(number, issue);
    } catch (error) {
      if (githubFailureStatus(error) !== 404) throw error;
    }
  }
  // A reopened issue must still see an old declined generated PR. Query only
  // its deterministic branches instead of retaining all closed PR history.
  for (const issue of issues.values()) {
    if (
      issue.pull_request ||
      (issue.state !== "open" && !references.has(issue.number))
    )
      continue;
    for (const label of issue.labels ?? []) {
      const kind = typeof label === "string" ? label : label.name;
      if (!["project-submission", "project-owner-request"].includes(kind))
        continue;
      const scoped = await pages(gh, `${root}/pulls`, [
        "state=all",
        `head=${repository.split("/")[0]}:automation/${kind}-${issue.number}`,
      ]);
      for (const pull of scoped.flat()) pulls.set(pull.number, pull);
    }
  }
  return {
    issues: [...issues.values()],
    pulls: [...pulls.values()],
    runs: [...runs.values()],
    mainHeadSha: reference.object.sha,
  };
}

export async function persistGithubAutomationReceipt({
  gh,
  repository,
  receipt,
}) {
  validateAutomationReceipt(receipt);
  const path = `${repositoryPath(repository)}/contents/data/maintenance/automation/operations/${receipt.operation.key}.json`;
  let prior;
  try {
    prior = JSON.parse(await gh(["api", `${path}?ref=main`]));
    if (prior.encoding !== "base64" || !/^[a-f0-9]{40}$/u.test(prior.sha ?? ""))
      throw new Error("Stored receipt blob is invalid.");
    const previous = validateAutomationReceipt(
      JSON.parse(Buffer.from(prior.content, "base64").toString("utf8")),
    );
    if (previous.operation.key !== receipt.operation.key)
      throw new Error("Stored receipt path and operation identity disagree.");
    if (
      JSON.stringify(previous.operation) ===
        JSON.stringify(receipt.operation) &&
      previous.completedAt === receipt.completedAt
    )
      return;
  } catch (error) {
    if (githubFailureStatus(error) !== 404) throw error;
  }
  await gh(
    ["api", "--method", "PUT", path, "--input", "-"],
    JSON.stringify({
      message: `chore(automation): record ${receipt.operation.identity.kind} ${receipt.operation.stage}`,
      branch: "main",
      content: Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`).toString(
        "base64",
      ),
      ...(prior ? { sha: prior.sha } : {}),
    }),
  );
}
