import { pathToFileURL } from "node:url";

import {
  ownerRequestBranch,
  parseOwnerRequestPullRequestMarker,
} from "../help/project-owner-pr.mjs";
import {
  parseSubmissionPullRequestMarker,
  submissionBranch,
} from "./project-submission-pr.mjs";

const PRODUCERS = new Set(["project-submission", "project-owner-request"]);
const QUEUE_LABELS = new Set([
  "needs-information",
  "needs-maintainer-review",
  "duplicate-candidate",
  "submission-retryable",
  "submission-pr-open",
  "submission-declined",
  "waiting-on-fork-parent",
]);
const BLOCKING_LABELS = new Set(["needs-information", "submission-declined"]);

function labelNames(issue) {
  return Array.isArray(issue?.labels)
    ? issue.labels
        .map((label) => (typeof label === "string" ? label : label?.name))
        .filter((label) => typeof label === "string" && label.length > 0)
    : [];
}

function routingLabel(producer) {
  return producer === "project-submission"
    ? "project-submission"
    : "project-owner-request";
}

export function planProjectGenerationFailure(input) {
  if (!PRODUCERS.has(input?.producer)) {
    throw new Error("Project generation failure producer is invalid.");
  }
  const labels = labelNames(input.issue);
  if (
    input.issue?.state !== "open" ||
    !labels.includes("issue-admitted") ||
    !labels.includes(routingLabel(input.producer)) ||
    labels.includes("submission-pr-open") ||
    labels.some((label) => BLOCKING_LABELS.has(label))
  ) {
    return { action: "noop" };
  }
  const desired =
    input.ownedPull?.state === "open"
      ? "submission-pr-open"
      : "submission-retryable";
  const nextLabels = labels.filter((label) => !QUEUE_LABELS.has(label));
  nextLabels.push(desired);
  const commentMarker = `<!-- tavernary-project-generation-failure:${input.producer} -->`;
  const commentBody = [
    commentMarker,
    "Generation stopped before publication, so no catalog change was published.",
    "",
    `Reason category: \`${input.reasonCode ?? "generation-failed"}\``,
    "",
    `[View the failed GitHub Actions run](${input.runUrl})`,
    "",
    desired === "submission-pr-open"
      ? "An owned review pull request already exists, so review continues there."
      : "This request is retryable after the generation problem is corrected.",
  ].join("\n");
  return {
    action: "reconcile",
    labels: [...new Set(nextLabels)],
    commentMarker,
    commentBody,
  };
}

function ownedPullFor({ pulls, producer, issueNumber, repository, branch }) {
  return (pulls ?? []).find((pull) => {
    const marker =
      producer === "project-submission"
        ? parseSubmissionPullRequestMarker(pull?.body ?? "")
        : parseOwnerRequestPullRequestMarker(pull?.body ?? "");
    return (
      pull?.state === "open" &&
      pull?.head?.ref === branch &&
      pull?.head?.repo?.full_name === repository &&
      marker?.issue_number === issueNumber
    );
  });
}

async function issueComments(request, repository, issueNumber) {
  const comments = [];
  for (let page = 1; ; page += 1) {
    const suffix = page === 1 ? "" : `&page=${page}`;
    const current = await request(
      `/repos/${repository}/issues/${issueNumber}/comments?per_page=100${suffix}`,
    );
    comments.push(...current);
    if (current.length < 100) return comments;
  }
}

export async function reconcileProjectGenerationFailure(input) {
  const request = input?.request;
  if (typeof request !== "function") {
    throw new Error("Project generation failure reconciliation needs request.");
  }
  const [owner] = String(input.repository ?? "").split("/");
  const branch =
    input.producer === "project-submission"
      ? submissionBranch(input.issueNumber)
      : ownerRequestBranch(input.issueNumber);
  const issue = await request(
    `/repos/${input.repository}/issues/${input.issueNumber}`,
  );
  const pulls = await request(
    `/repos/${input.repository}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=100`,
  );
  const ownedPull =
    ownedPullFor({
      pulls,
      producer: input.producer,
      issueNumber: input.issueNumber,
      repository: input.repository,
      branch,
    }) ?? null;
  let plan = planProjectGenerationFailure({
    issue,
    producer: input.producer,
    ownedPull,
    runUrl: input.runUrl,
    reasonCode: input.reasonCode,
  });
  if (plan.action === "noop") return plan;

  const comments = await issueComments(
    request,
    input.repository,
    input.issueNumber,
  );
  const currentIssue = await request(
    `/repos/${input.repository}/issues/${input.issueNumber}`,
  );
  plan = planProjectGenerationFailure({
    issue: currentIssue,
    producer: input.producer,
    ownedPull,
    runUrl: input.runUrl,
    reasonCode: input.reasonCode,
  });
  if (plan.action === "noop") return plan;

  await request(
    `/repos/${input.repository}/issues/${input.issueNumber}/labels`,
    {
      method: "PUT",
      body: JSON.stringify({ labels: plan.labels }),
    },
  );
  const existing = (comments ?? []).find((comment) =>
    String(comment?.body ?? "").includes(plan.commentMarker),
  );
  if (existing) {
    await request(`/repos/${input.repository}/issues/comments/${existing.id}`, {
      method: "PATCH",
      body: JSON.stringify({ body: plan.commentBody }),
    });
  } else {
    await request(
      `/repos/${input.repository}/issues/${input.issueNumber}/comments`,
      {
        method: "POST",
        body: JSON.stringify({ body: plan.commentBody }),
      },
    );
  }
  return plan;
}

function githubHeaders() {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    "User-Agent": "Tavernary-project-generation-failure",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function github(path, options = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { ...githubHeaders(), ...options.headers },
  });
  if (!response.ok) {
    throw new Error(`GitHub ${response.status} while reconciling generation.`);
  }
  return response.status === 204 ? null : response.json();
}

async function main() {
  const issueNumber = Number(process.env.ISSUE_NUMBER);
  const repository = process.env.GITHUB_REPOSITORY;
  const producer = process.env.GENERATION_PRODUCER;
  const runUrl = process.env.GENERATION_RUN_URL;
  const reasonCode = process.env.GENERATION_REASON_CODE ?? "generation-failed";
  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1 ||
    !repository ||
    !PRODUCERS.has(producer) ||
    !runUrl
  ) {
    throw new Error("Project generation failure environment is invalid.");
  }
  await reconcileProjectGenerationFailure({
    repository,
    issueNumber,
    producer,
    runUrl,
    reasonCode,
    request: github,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
