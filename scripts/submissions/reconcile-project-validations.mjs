import { pathToFileURL } from "node:url";

import { parseProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";
import {
  PROJECT_VALIDATION_OWNED_LABELS,
  PROJECT_VALIDATION_RETRY_LIMIT,
  PROJECT_VALIDATION_STATE_MARKER,
  planProjectValidationReconciliation,
  projectValidationStateComment,
} from "./project-validation-reconciliation.mjs";

const STATUS_CONTEXT = "tavernary/publication-validation";
const GENERATED_BRANCH_PREFIXES = [
  "automation/project-submission-",
  "automation/project-owner-request-",
];
const OWNED_LABEL_DEFINITIONS = {
  "submission-validation-retrying": {
    color: "fbca04",
    description:
      "Tavernary is automatically retrying this exact generated head.",
  },
  "submission-validation-blocked": {
    color: "d93f0b",
    description:
      "Automatic exact-head validation or publication attempts are exhausted.",
  },
};

class StaleCandidateError extends Error {
  constructor() {
    super("Pull request state changed during reconciliation.");
    this.name = "StaleCandidateError";
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function labelNames(labels) {
  return (Array.isArray(labels) ? labels : [])
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((label) => typeof label === "string" && label.length > 0);
}

function expectedBranch(transaction) {
  if (transaction.producer === "project-submission") {
    return `automation/project-submission-${transaction.issue_number}`;
  }
  if (transaction.producer === "project-owner-request") {
    return `automation/project-owner-request-${transaction.issue_number}`;
  }
  return null;
}

function candidateFromPull(pull, repository, defaultBranch) {
  if (pull?.state !== "open") return { reason: "closed" };
  if (
    typeof pull?.head?.ref !== "string" ||
    !GENERATED_BRANCH_PREFIXES.some((prefix) =>
      pull.head.ref.startsWith(prefix),
    )
  ) {
    return { reason: "not-generated" };
  }
  if (
    pull.head.repo?.full_name !== repository ||
    pull.base?.repo?.full_name !== repository
  ) {
    return { reason: "fork-owned" };
  }
  if (pull.base.ref !== defaultBranch) return { reason: "wrong-base" };
  const transaction = parseProjectPublicationTransaction(pull.body ?? "");
  if (!transaction) return { reason: "malformed-transaction" };
  if (transaction.publication_mode !== "automatic") {
    return { reason: "manual-transaction" };
  }
  if (
    transaction.generated_head_sha !== pull.head.sha ||
    expectedBranch(transaction) !== pull.head.ref
  ) {
    return { reason: "changed-head" };
  }
  return { transaction };
}

async function listOpenPulls(repository, request) {
  const pulls = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/pulls?state=open&per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("GitHub returned an invalid pull request inventory.");
    }
    pulls.push(...batch);
    if (batch.length < 100) return pulls;
  }
}

async function listWorkflowRuns(repository, workflow, query, request) {
  const runs = [];
  for (let page = 1; ; page += 1) {
    const response = await request(
      `/repos/${repository}/actions/workflows/${workflow}/runs?${query}&per_page=100&page=${page}`,
    );
    const batch = response?.workflow_runs;
    if (!Array.isArray(batch)) {
      throw new Error(`GitHub returned an invalid ${workflow} run inventory.`);
    }
    runs.push(...batch);
    if (batch.length < 100) return runs;
  }
}

async function listValidationRuns(repository, pull, request) {
  const branch = encodeURIComponent(pull.head.ref);
  const runs = await listWorkflowRuns(
    repository,
    "ci.yml",
    `branch=${branch}&event=workflow_dispatch`,
    request,
  );
  return runs.filter(
    (run) =>
      run?.event === "workflow_dispatch" &&
      run.path === ".github/workflows/ci.yml" &&
      run.head_branch === pull.head.ref &&
      run.head_sha === pull.head.sha,
  );
}

function latestRun(runs) {
  return [...runs].sort(
    (left, right) =>
      Date.parse(right?.created_at ?? "") - Date.parse(left?.created_at ?? ""),
  )[0];
}

function associatedPublicationRuns(runs, validation, headSha) {
  if (validation?.conclusion !== "success") return [];
  const displayTitle = `Project publication for validation #${validation.id}`;
  return runs
    .filter(
      (run) =>
        run?.event === "workflow_dispatch" &&
        run.path === ".github/workflows/publish-project-transaction.yml" &&
        run.display_title === displayTitle,
    )
    .flatMap((run) => {
      const attempts = Math.min(
        PROJECT_VALIDATION_RETRY_LIMIT,
        Number.isInteger(run.run_attempt) && run.run_attempt > 0
          ? run.run_attempt
          : 1,
      );
      return Array.from({ length: attempts }, () => ({
        ...run,
        head_sha: headSha,
      }));
    });
}

async function loadReconciliationPlan({
  repository,
  pull,
  transaction,
  request,
  nowMs,
  loadPublicationRuns,
}) {
  const validationRuns = await listValidationRuns(repository, pull, request);
  const successfulValidation = latestRun(validationRuns);
  let publicationRuns = [];
  if (successfulValidation?.conclusion === "success") {
    publicationRuns = associatedPublicationRuns(
      await loadPublicationRuns(),
      successfulValidation,
      pull.head.sha,
    );
  }
  return planProjectValidationReconciliation({
    transaction,
    headSha: pull.head.sha,
    validationRuns,
    publicationRuns,
    nowMs,
    pull,
  });
}

function sameLivePull(expected, live) {
  return (
    live?.state === "open" &&
    live.number === expected.number &&
    live.head?.sha === expected.head.sha &&
    live.head?.ref === expected.head.ref &&
    live.head?.repo?.full_name === expected.head.repo?.full_name &&
    live.base?.ref === expected.base.ref
  );
}

async function guardCandidate(repository, pull, request) {
  const live = await request(`/repos/${repository}/pulls/${pull.number}`);
  if (!sameLivePull(pull, live)) throw new StaleCandidateError();
}

async function ensureOwnedLabels(repository, request) {
  for (const [name, definition] of Object.entries(OWNED_LABEL_DEFINITIONS)) {
    const path = `/repos/${repository}/labels/${encodeURIComponent(name)}`;
    let existing;
    try {
      existing = await request(path);
    } catch (error) {
      if (error?.status !== 404) throw error;
      await request(`/repos/${repository}/labels`, {
        method: "POST",
        body: JSON.stringify({ name, ...definition }),
      });
      continue;
    }
    if (
      existing?.color !== definition.color ||
      existing?.description !== definition.description
    ) {
      await request(path, {
        method: "PATCH",
        body: JSON.stringify({ new_name: name, ...definition }),
      });
    }
  }
}

async function listIssueComments(repository, issueNumber, request) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const suffix = page === 1 ? "" : `&page=${page}`;
    const batch = await request(
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100${suffix}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("GitHub returned an invalid issue comment inventory.");
    }
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
}

async function listCommitStatuses(repository, headSha, request) {
  const statuses = [];
  for (let page = 1; ; page += 1) {
    const batch = await request(
      `/repos/${repository}/commits/${headSha}/statuses?per_page=100&page=${page}`,
    );
    if (!Array.isArray(batch)) {
      throw new Error("GitHub returned an invalid commit status inventory.");
    }
    statuses.push(...batch);
    if (batch.length < 100) return statuses;
  }
}

function desiredOwnedLabels(plan) {
  const desired = new Set();
  if (plan.action === "block") {
    desired.add("submission-validation-blocked");
  } else if (
    plan.state === "retrying-validation" ||
    plan.state === "retrying-publication"
  ) {
    desired.add("submission-validation-retrying");
  }
  return desired;
}

async function reconcileOwnedLabels({
  repository,
  pull,
  issueNumber,
  issue,
  plan,
  request,
}) {
  const current = new Set(labelNames(issue?.labels));
  const desired = desiredOwnedLabels(plan);
  for (const label of PROJECT_VALIDATION_OWNED_LABELS) {
    if (desired.has(label) && !current.has(label)) {
      await guardCandidate(repository, pull, request);
      await request(`/repos/${repository}/issues/${issueNumber}/labels`, {
        method: "POST",
        body: JSON.stringify({ labels: [label] }),
      });
    } else if (!desired.has(label) && current.has(label)) {
      await guardCandidate(repository, pull, request);
      try {
        await request(
          `/repos/${repository}/issues/${issueNumber}/labels/${encodeURIComponent(label)}`,
          { method: "DELETE" },
        );
      } catch (error) {
        if (error?.status !== 404) throw error;
      }
    }
  }
}

function statusProjection(plan) {
  const descriptions = {
    validating: "Exact-head validation is queued.",
    "retrying-validation": `Retrying exact-head validation (${plan.attempts} of ${PROJECT_VALIDATION_RETRY_LIMIT}).`,
    "validation-blocked": "Exact-head validation attempts are exhausted.",
    handoff: "Exact-head validation passed; awaiting Publisher.",
    publishing: "Publishing the validated project transaction.",
    "retrying-publication": `Retrying Publisher jobs (${plan.attempts} of ${PROJECT_VALIDATION_RETRY_LIMIT}).`,
    "publication-blocked": "Publisher attempts are exhausted.",
    regenerating: "Regenerating the stale automatic transaction.",
    published: "Publisher completed this exact generated head.",
  };
  return {
    state:
      plan.action === "block"
        ? "failure"
        : plan.state === "published"
          ? "success"
          : "pending",
    context: STATUS_CONTEXT,
    description: descriptions[plan.state] ?? "Reconciling project validation.",
    ...(plan.run?.html_url ? { target_url: plan.run.html_url } : {}),
  };
}

function sameStatusProjection(status, projection) {
  return (
    status?.context === projection.context &&
    status?.state === projection.state &&
    status?.description === projection.description &&
    (status?.target_url ?? null) === (projection.target_url ?? null)
  );
}

async function projectState({
  repository,
  pull,
  transaction,
  plan,
  request,
  loadAuthenticatedActor,
}) {
  const [issue, comments, authenticatedActor] = await Promise.all([
    request(`/repos/${repository}/issues/${transaction.issue_number}`),
    listIssueComments(repository, transaction.issue_number, request),
    loadAuthenticatedActor(),
  ]);
  if (!Number.isSafeInteger(authenticatedActor?.id)) {
    throw new Error("GitHub returned no authenticated controller identity.");
  }
  await reconcileOwnedLabels({
    repository,
    pull,
    issueNumber: transaction.issue_number,
    issue,
    plan,
    request,
  });

  const body = projectValidationStateComment({
    state: plan.state,
    headSha: pull.head.sha,
    attempts: plan.attempts,
    run: plan.run,
  });
  const existing = comments.find(
    (comment) =>
      comment?.user?.id === authenticatedActor.id &&
      String(comment?.body ?? "").includes(PROJECT_VALIDATION_STATE_MARKER),
  );
  if (existing?.body !== body) {
    await guardCandidate(repository, pull, request);
    if (existing) {
      await request(`/repos/${repository}/issues/comments/${existing.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    } else {
      await request(
        `/repos/${repository}/issues/${transaction.issue_number}/comments`,
        {
          method: "POST",
          body: JSON.stringify({ body }),
        },
      );
    }
  }

  const projection = statusProjection(plan);
  const statuses = await listCommitStatuses(repository, pull.head.sha, request);
  const latestOwnedStatus = statuses.find(
    (status) => status?.context === STATUS_CONTEXT,
  );
  if (!sameStatusProjection(latestOwnedStatus, projection)) {
    await guardCandidate(repository, pull, request);
    await request(`/repos/${repository}/statuses/${pull.head.sha}`, {
      method: "POST",
      body: JSON.stringify(projection),
    });
  }
}

async function replanAndApply({
  repository,
  defaultBranch,
  pull,
  transaction,
  plan,
  request,
  nowMs,
}) {
  if (
    ![
      "validate",
      "retry-validation",
      "publish",
      "retry-publication",
      "regenerate",
    ].includes(plan.action)
  ) {
    return { plan, applied: false, superseded: false };
  }
  const currentPlan = await loadReconciliationPlan({
    repository,
    pull,
    transaction,
    request,
    nowMs,
    loadPublicationRuns: () =>
      listWorkflowRuns(
        repository,
        "publish-project-transaction.yml",
        "event=workflow_dispatch",
        request,
      ),
  });
  if (currentPlan.action !== plan.action) {
    return { plan: currentPlan, applied: false, superseded: true };
  }

  let path;
  let body;
  if (
    currentPlan.action === "validate" ||
    currentPlan.action === "retry-validation"
  ) {
    path = `/repos/${repository}/actions/workflows/ci.yml/dispatches`;
    body = { ref: pull.head.ref };
  } else if (currentPlan.action === "publish") {
    path = `/repos/${repository}/actions/workflows/publish-project-transaction.yml/dispatches`;
    body = {
      ref: defaultBranch,
      inputs: { validation_run_id: String(currentPlan.run.id) },
    };
  } else if (currentPlan.action === "retry-publication") {
    path = `/repos/${repository}/actions/runs/${currentPlan.run.id}/rerun-failed-jobs`;
  } else if (currentPlan.action === "regenerate") {
    const workflow =
      transaction.producer === "project-submission"
        ? "generate-project-submission.yml"
        : "generate-project-owner-request.yml";
    path = `/repos/${repository}/actions/workflows/${workflow}/dispatches`;
    body = {
      ref: defaultBranch,
      inputs: {
        issue_number: String(transaction.issue_number),
        force_regeneration: "false",
      },
    };
  } else {
    return { plan: currentPlan, applied: false, superseded: true };
  }
  await guardCandidate(repository, pull, request);
  await request(path, {
    method: "POST",
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { plan: currentPlan, applied: true, superseded: false };
}

export async function reconcileProjectValidations({
  repository,
  request,
  nowMs,
}) {
  if (
    typeof repository !== "string" ||
    !/^[^/\s]+\/[^/\s]+$/u.test(repository)
  ) {
    throw new Error("A GitHub repository is required.");
  }
  if (typeof request !== "function") {
    throw new Error("Project validation reconciliation needs request.");
  }
  const repositoryState = await request(`/repos/${repository}`);
  const defaultBranch = repositoryState?.default_branch;
  if (typeof defaultBranch !== "string" || defaultBranch.length === 0) {
    throw new Error("GitHub returned no default branch.");
  }
  const pulls = await listOpenPulls(repository, request);
  const results = [];
  let labelsReady = false;
  let publicationRunsPromise;
  let authenticatedActorPromise;
  const loadAuthenticatedActor = () => {
    authenticatedActorPromise ??= request("/user");
    return authenticatedActorPromise;
  };

  for (const pull of pulls) {
    const candidate = candidateFromPull(pull, repository, defaultBranch);
    if (!candidate.transaction) {
      results.push({
        pullNumber: pull?.number ?? null,
        action: "ignore",
        reason: candidate.reason,
      });
      continue;
    }
    const transaction = candidate.transaction;
    try {
      const plan = await loadReconciliationPlan({
        repository,
        pull,
        transaction,
        request,
        nowMs,
        loadPublicationRuns: () => {
          publicationRunsPromise ??= listWorkflowRuns(
            repository,
            "publish-project-transaction.yml",
            "event=workflow_dispatch",
            request,
          );
          return publicationRunsPromise;
        },
      });
      if (plan.action === "ignore") {
        results.push({
          pullNumber: pull.number,
          issueNumber: transaction.issue_number,
          action: "ignore",
          reason: "planner-ignore",
        });
        continue;
      }

      const application = await replanAndApply({
        repository,
        defaultBranch,
        pull,
        transaction,
        plan,
        request,
        nowMs,
      });
      const currentPlan = application.plan;
      let projectionError;
      try {
        await guardCandidate(repository, pull, request);
        if (!labelsReady) {
          await ensureOwnedLabels(repository, request);
          labelsReady = true;
        }
        await projectState({
          repository,
          pull,
          transaction,
          plan: currentPlan,
          request,
          loadAuthenticatedActor,
        });
      } catch (error) {
        projectionError = errorMessage(error);
      }
      results.push({
        pullNumber: pull.number,
        issueNumber: transaction.issue_number,
        headSha: pull.head.sha,
        action: currentPlan.action,
        state: currentPlan.state,
        attempts: currentPlan.attempts,
        runId: currentPlan.run?.id ?? null,
        outcome: application.superseded
          ? "superseded"
          : application.applied || currentPlan.action === "block"
            ? "applied"
            : "observed",
        ...(projectionError ? { projectionError } : {}),
      });
    } catch (error) {
      if (error instanceof StaleCandidateError) {
        results.push({
          pullNumber: pull.number,
          issueNumber: transaction.issue_number,
          action: "ignore",
          outcome: "stale",
        });
      } else {
        results.push({
          pullNumber: pull.number,
          issueNumber: transaction.issue_number,
          action: "error",
          error: errorMessage(error),
        });
      }
    }
  }

  return {
    repository,
    defaultBranch,
    scannedPulls: pulls.length,
    results,
  };
}

async function githubRequest(path, options = {}) {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/json",
      "User-Agent": "Tavernary-project-validation-reconciliation",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  });
  if (!response.ok) {
    const error = new Error(
      `GitHub ${response.status} for ${path}: ${await response.text()}`,
    );
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const repository = process.env.GITHUB_REPOSITORY ?? "";
  if (!process.env.GITHUB_TOKEN && !process.env.GH_TOKEN) {
    throw new Error("GITHUB_TOKEN or GH_TOKEN is required.");
  }
  const summary = await reconcileProjectValidations({
    repository,
    request: githubRequest,
    nowMs: Date.now(),
  });
  console.log(JSON.stringify(summary, null, 2));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
