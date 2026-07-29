import { expectedTransactionPaths } from "./project-publication-transaction.mjs";

const generatedBranches = [
  ["project-submission", "automation/project-submission-"],
  ["project-owner-request", "automation/project-owner-request-"],
];

function labels(issue) {
  return new Set(
    (issue?.labels ?? [])
      .map((label) => (typeof label === "string" ? label : label?.name))
      .filter(Boolean),
  );
}

function branchProducer(branch) {
  return generatedBranches.find(([, prefix]) => branch.startsWith(prefix));
}

function regenerate(transaction, reasonCode) {
  return {
    action: "regenerate",
    reasonCode,
    producer: transaction.producer,
    issueNumber: transaction.issue_number,
  };
}

export function planProjectPublication(input) {
  const run = input?.workflowRun;
  const branch = run?.head_branch ?? "";
  const route = branchProducer(branch);
  if (
    run?.name !== "Site: Validate changes" ||
    run?.event !== "workflow_dispatch" ||
    !route
  ) {
    return { action: "ignore" };
  }
  if (input.enabled !== true) {
    return { action: "paused", reasonCode: "automatic-publication-disabled" };
  }
  if (run.conclusion !== "success") {
    return {
      action: "retry",
      reasonCode: "ci-failed",
      producer: route[0],
    };
  }

  const transaction = input.transaction;
  const pull = input.pull;
  if (
    !transaction ||
    transaction.producer !== route[0] ||
    branch !== pull?.head?.ref ||
    run.head_sha !== transaction.generated_head_sha
  ) {
    return { action: "ignore" };
  }
  const expectedBranch = `${route[1]}${transaction.issue_number}`;
  if (
    branch !== expectedBranch ||
    pull.state !== "open" ||
    pull.base?.ref !== input.defaultBranch ||
    pull.head?.repo?.full_name?.toLocaleLowerCase() !==
      input.repository?.toLocaleLowerCase()
  ) {
    return { action: "ignore" };
  }
  if (pull.head.sha !== transaction.generated_head_sha) {
    return regenerate(transaction, "head-sha-stale");
  }

  const issueLabels = labels(input.issue);
  const routeLabel =
    transaction.producer === "project-submission"
      ? "project-submission"
      : "project-owner-request";
  if (
    input.issue?.number !== transaction.issue_number ||
    input.issue?.state !== "open" ||
    !issueLabels.has("issue-admitted") ||
    !issueLabels.has(routeLabel) ||
    !issueLabels.has("submission-pr-open")
  ) {
    return { action: "reject", reasonCode: "issue-no-longer-admitted" };
  }
  if (input.current?.authorityValid !== true) {
    return { action: "reject", reasonCode: "authority-lost" };
  }
  if (input.current?.sourceIdentityValid !== true) {
    return { action: "reject", reasonCode: "source-identity-changed" };
  }
  let expectedPaths;
  try {
    expectedPaths = expectedTransactionPaths(transaction);
  } catch {
    return { action: "reject", reasonCode: "transaction-invalid" };
  }
  const changedPaths = Array.isArray(input.changedPaths)
    ? [...input.changedPaths].sort((left, right) => left.localeCompare(right))
    : [];
  if (JSON.stringify(changedPaths) !== JSON.stringify(expectedPaths)) {
    return { action: "reject", reasonCode: "path-mismatch" };
  }
  if (input.current.inputDigest !== transaction.input_digest) {
    return regenerate(transaction, "input-digest-stale");
  }
  for (const [projectId, fingerprint] of Object.entries(
    transaction.input_fingerprints.projects,
  )) {
    if (input.current.projectFingerprints?.[projectId] !== fingerprint) {
      return regenerate(transaction, "project-fingerprint-stale");
    }
  }
  if (
    transaction.input_fingerprints.source !== null &&
    input.current.sourceFingerprint !== transaction.input_fingerprints.source
  ) {
    return regenerate(transaction, "source-fingerprint-stale");
  }
  if (input.current.mainSha !== transaction.base_sha) {
    return regenerate(transaction, "base-behind-main");
  }
  if (transaction.publication_mode === "manual") {
    return {
      action: "await-maintainer",
      reasonCode: "manual-approval-required",
      producer: transaction.producer,
      issueNumber: transaction.issue_number,
      projectIds: transaction.project_ids,
      sourceId: transaction.source_id,
    };
  }
  if (pull.mergeable === null || pull.mergeable === undefined) {
    return {
      action: "retry",
      reasonCode: "mergeability-pending",
      producer: transaction.producer,
      issueNumber: transaction.issue_number,
    };
  }
  if (pull.mergeable !== true) {
    return regenerate(transaction, "merge-conflict");
  }
  return {
    action: "merge",
    pullNumber: pull.number,
    expectedHeadSha: transaction.generated_head_sha,
    producer: transaction.producer,
    issueNumber: transaction.issue_number,
    projectIds: transaction.project_ids,
    sourceId: transaction.source_id,
  };
}
