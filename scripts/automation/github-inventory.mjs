import { validateAutomationReceipt } from "./receipts.mjs";

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

async function pages(gh, path, fields = []) {
  const value = JSON.parse(
    await gh([
      "api",
      "--paginate",
      "--slurp",
      "--method",
      "GET",
      path,
      "-f",
      "per_page=100",
      ...fields.flatMap((field) => ["-f", field]),
    ]),
  );
  if (!Array.isArray(value))
    throw new Error("GitHub returned an invalid paginated inventory.");
  return value;
}
function runPages(value) {
  if (
    value.some(
      (page) =>
        !Array.isArray(page.workflow_runs) ||
        !Number.isSafeInteger(page.total_count),
    )
  )
    throw new Error("GitHub returned an invalid run inventory.");
  return value.flatMap((page) => page.workflow_runs);
}
export async function loadAutomationWorkerRuns({ gh, repository, nowMs }) {
  const value = await pages(
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
export async function loadGithubAutomationInventory({
  gh,
  repository,
  receipts,
  nowMs,
}) {
  const root = repositoryPath(repository);
  const [issuePages, pullPages, reference] = await Promise.all([
    pages(gh, `${root}/issues`, ["state=all"]),
    pages(gh, `${root}/pulls`, ["state=all"]),
    gh(["api", `${root}/git/ref/heads/main`]).then(JSON.parse),
  ]);
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
    const value = await pages(gh, `${root}/actions/runs`, [
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
    const value = await pages(gh, `${root}/actions/runs`, [`status=${status}`]);
    if ((value[0]?.total_count ?? 0) > 1000)
      throw new Error("Active workflow inventory exceeds GitHub's result cap.");
    active.push(...runPages(value));
  }
  const runs = new Map([...recent, ...active].map((run) => [run.id, run]));
  for (const receipt of receipts) {
    validateAutomationReceipt(receipt);
    const id = receipt.operation.workerRunId;
    if (id === null) continue;
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
  return {
    issues: issuePages.flat(),
    pulls: pullPages.flat(),
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
