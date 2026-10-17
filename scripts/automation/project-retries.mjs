import { parseProjectSubmissionIssue } from "../submissions/parse-project-submission.mjs";
import { parseSourceIdentity } from "../submissions/source-identity.mjs";
import { parseProjectSubmissionStateMarker } from "../submissions/triage-issue.mjs";
import { loadRedditRetryState } from "../submissions/project-submission-retry-state.mjs";
import { hasTerminalForkDependency } from "../submissions/retry-fork-dependencies.mjs";
import {
  indexedFrontendUrls,
  hasResolvableFrontendDependency,
} from "../submissions/retry-frontend-dependencies.mjs";
import { planAutomationRetry } from "./retry.mjs";
import {
  classifyAutomationFailure,
  AUTOMATION_FAILURE_REASON_KINDS,
} from "./failure.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";

function labels(issue) {
  return (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
}
const activeStatuses = new Set([
  "queued",
  "in_progress",
  "pending",
  "waiting",
  "requested",
]);
function triageIsDue(state, issue) {
  const runs = state.remote.runs
    .filter(
      (run) =>
        run.path === ".github/workflows/triage-submission.yml" &&
        run.head_branch === "main" &&
        run.event === "workflow_dispatch" &&
        run.head_repository?.full_name === state.repository &&
        run.actor?.id === state.publisherActorId &&
        run.actor.type === "Bot" &&
        run.display_title === `Project #${issue.number}: Validate submission`,
    )
    .sort((a, b) => b.id - a.id);
  if (runs.some((run) => activeStatuses.has(run.status))) return false;
  if (!runs.length) return true;
  const last = runs[0],
    updated = Date.parse(last.updated_at ?? last.created_at ?? "");
  if (!Number.isFinite(updated)) return false;
  if (Date.parse(issue.updated_at ?? "") > updated) return true;
  const delay =
    last.conclusion === "success"
      ? updated + 86400000
      : Date.parse(
          planAutomationRetry({
            failure: classifyAutomationFailure({
              diagnosticCode: "unknown-failure",
            }),
            transientAttempts: Math.max(0, runs.length - 1),
            immediateAttempts: runs.length,
            nowMs: updated,
            jitterSeed: `project-triage-${issue.number}`,
          }).nextEligibleAt ?? "",
        );
  return Number.isFinite(delay) && state.nowMs >= delay;
}
async function ownedComments({ state, issue, gh }) {
  const comments = [];
  for (let page = 1; page <= 10; page++) {
    const response = await gh([
      "api",
      `repos/${state.repository}/issues/${issue.number}/comments?per_page=100&page=${page}`,
    ]);
    if (Buffer.byteLength(response) > 4194304)
      throw new Error("Project retry comment history is unavailable.");
    const value = JSON.parse(response);
    if (!Array.isArray(value) || value.length > 100)
      throw new Error("Project retry comment history is unavailable.");
    comments.push(
      ...value.filter(
        (comment) =>
          comment.user?.type === "Bot" &&
          [41898282, state.publisherActorId].includes(comment.user.id),
      ),
    );
    if (value.length < 100) return comments;
  }
  throw new Error(
    "Project retry comment history exceeds its bounded search budget.",
  );
}
async function directGenerationDeadline({ state, issue, comments, gh }) {
  const producer = labels(issue).includes("project-owner-request")
    ? "project-owner-request"
    : "project-submission";
  for (const comment of [...comments].sort((a, b) => b.id - a.id)) {
    if (
      !comment.body?.includes(
        `<!-- tavernary-project-generation-failure:${producer} -->`,
      )
    )
      continue;
    const markers = [
      ...comment.body.matchAll(
        /<!-- tavernary-generation-recovery\s+([\s\S]*?)\s+-->/gu,
      ),
    ];
    if (markers.length !== 1) continue;
    let marker;
    try {
      marker = JSON.parse(markers[0][1]);
    } catch {
      continue;
    }
    const deadline = Date.parse(marker.next_eligible_at ?? "");
    const runId = new RegExp(
      `\\(https://github\\.com/${state.repository}/actions/runs/([1-9]\\d*)\\)`,
      "u",
    ).exec(comment.body)?.[1];
    if (
      marker.schema_version !== 1 ||
      marker.issue_number !== issue.number ||
      marker.producer !== producer ||
      !Object.hasOwn(
        AUTOMATION_FAILURE_REASON_KINDS,
        marker.reason_code ?? "",
      ) ||
      AUTOMATION_FAILURE_REASON_KINDS[marker.reason_code] !==
        marker.failure_kind ||
      !Number.isFinite(deadline) ||
      new Date(deadline).toISOString() !== marker.next_eligible_at ||
      !Number.isSafeInteger(Number(runId)) ||
      deadline <= state.nowMs
    )
      continue;
    const run = JSON.parse(
      await gh(["api", `repos/${state.repository}/actions/runs/${runId}`]),
    );
    const updated = Date.parse(run.updated_at ?? "");
    if (
      run.id === Number(runId) &&
      run.status === "completed" &&
      run.conclusion &&
      run.conclusion !== "success" &&
      run.path === `.github/workflows/generate-${producer}.yml` &&
      run.event === "workflow_dispatch" &&
      run.head_branch === "main" &&
      run.head_repository?.full_name === state.repository &&
      ((run.actor?.id === state.publisherActorId && run.actor.type === "Bot") ||
        (run.actor?.id === 2625904 && run.actor.type === "User")) &&
      run.display_title ===
        `${producer === "project-submission" ? "Project" : "Owner request"} #${issue.number}: Create review PR` &&
      Number.isFinite(updated) &&
      updated <= state.nowMs &&
      deadline > updated
    )
      return marker.next_eligible_at;
  }
  return null;
}
export async function inspectProjectRetry({ state, issue, gh }) {
  const result = { resolved: false, notBefore: null },
    names = labels(issue);
  if (
    issue.state !== "open" ||
    issue.pull_request ||
    !names.some((name) =>
      ["project-submission", "project-owner-request"].includes(name),
    ) ||
    names.some((name) =>
      ["submission-declined", "issue-limit-reached"].includes(name),
    )
  )
    return result;
  const waiting =
    names.includes("waiting-on-fork-parent") ||
    names.includes("needs-information");
  const parsed = parseProjectSubmissionIssue(issue.body ?? "", {
    allowLegacyV3: true,
  });
  let identity;
  try {
    if (parsed.valid)
      identity = parseSourceIdentity(parsed.manifest.source_url);
  } catch {
    return result;
  }
  const reddit =
    identity?.kind === "reddit" && names.includes("submission-retryable");
  if (!waiting && !names.includes("submission-retryable")) return result;
  const comments = await ownedComments({ state, issue, gh });
  if (names.includes("submission-retryable"))
    result.notBefore = await directGenerationDeadline({
      state,
      issue,
      comments,
      gh,
    });
  if (reddit) {
    const retry = loadRedditRetryState(comments, {
      issueNumber: issue.number,
      sourceIdentity: `reddit:${identity.postId.toLowerCase()}`,
    });
    if (
      retry?.outcome === "pending" &&
      Date.parse(retry.next_eligible_retry_at) > state.nowMs
    )
      if (
        Date.parse(retry.next_eligible_retry_at) >
        Date.parse(result.notBefore ?? "1970-01-01T00:00:00Z")
      )
        result.notBefore = retry.next_eligible_retry_at;
  }
  if (!waiting || !triageIsDue(state, issue)) return result;
  const markers = comments
    .map((comment) => ({
      comment,
      marker: parseProjectSubmissionStateMarker(comment.body ?? ""),
    }))
    .filter(({ marker }) => marker);
  if (markers.length !== 1) return result;
  const { comment, marker } = markers[0];
  if (
    names.includes("waiting-on-fork-parent") &&
    marker.status === "waiting-on-fork-parent"
  ) {
    const sources = new Map(
      (state.local.sources ?? [])
        .filter(
          (source) =>
            source.type === "github" &&
            Number.isSafeInteger(source.repository_id) &&
            source.repository_id > 0,
        )
        .map((source) => [source.repository_id, source]),
    );
    if (
      hasTerminalForkDependency({
        comments: [comment],
        sourcesByRepositoryId: sources,
      })
    )
      result.resolved = true;
    else if (
      Number.isSafeInteger(marker.fork_dependency?.issue_number) &&
      marker.fork_dependency.issue_number > 0
    ) {
      let upstream;
      try {
        upstream = JSON.parse(
          await gh([
            "api",
            `repos/${state.repository}/issues/${marker.fork_dependency.issue_number}`,
          ]),
        );
      } catch (error) {
        if (githubFailureStatus(error) === 404) return result;
        throw error;
      }
      if (
        upstream.number === marker.fork_dependency.issue_number &&
        upstream.state === "closed" &&
        !upstream.pull_request &&
        labels(upstream).includes("project-submission")
      )
        result.resolved = hasTerminalForkDependency({
          comments: [comment],
          sourcesByRepositoryId: sources,
          closedUpstreamIssueNumber: upstream.number,
        });
    }
  } else if (
    names.includes("needs-information") &&
    marker.status === "needs-information"
  ) {
    result.resolved = hasResolvableFrontendDependency({
      comments: [comment],
      indexedUrls: indexedFrontendUrls(
        state.local.projects ?? [],
        Object.fromEntries(
          (state.local.sources ?? []).map((source) => [source.id, source]),
        ),
      ),
    });
  }
  return result;
}
export async function inspectProjectRetries({ state, gh, limit = 20 }) {
  if (
    !Number.isSafeInteger(limit) ||
    limit < 0 ||
    limit > 20 ||
    !Number.isFinite(state.nowMs)
  )
    throw new Error("Project retry inspection quota is invalid.");
  const candidates = state.remote.issues
    .filter(
      (issue) =>
        issue.state === "open" &&
        !issue.pull_request &&
        labels(issue).some((name) =>
          ["project-submission", "project-owner-request"].includes(name),
        ) &&
        labels(issue).some((name) =>
          [
            "needs-information",
            "waiting-on-fork-parent",
            "submission-retryable",
          ].includes(name),
        ),
    )
    .sort((a, b) => a.number - b.number);
  const resolvedDependencies = new Set(),
    deferredRetries = new Map();
  const inspectionComplete = candidates.length <= limit;
  const nextInspection = new Date(
    (Math.floor(state.nowMs / 1800000) + 1) * 1800000,
  ).toISOString();
  for (const issue of candidates)
    if (labels(issue).includes("submission-retryable"))
      deferredRetries.set(issue.number, nextInspection);
  if (!limit || !candidates.length)
    return {
      resolvedDependencies,
      deferredRetries,
      failures: 0,
      inspectionComplete,
    };
  const batches = Math.ceil(candidates.length / limit),
    start = (Math.floor(state.nowMs / 1800000) % batches) * limit;
  let failures = 0;
  for (const issue of candidates.slice(start, start + limit)) {
    try {
      const result = await inspectProjectRetry({ state, issue, gh });
      if (result.resolved) resolvedDependencies.add(issue.number);
      if (result.notBefore) deferredRetries.set(issue.number, result.notBefore);
      else deferredRetries.delete(issue.number);
    } catch (error) {
      failures++;
      const failure = classifyAutomationFailure({
        httpStatus: githubFailureStatus(error),
        diagnosticCode: error.code,
      });
      console.warn(
        `Project #${issue.number} retry inspection unavailable (${failure.reasonCode}).`,
      );
    }
  }
  return {
    resolvedDependencies,
    deferredRetries,
    failures,
    inspectionComplete,
  };
}
