import { validateAutomationOperation } from "./operation.mjs";
import { discoverKitOperations } from "./kit-operations.mjs";
import { projectIssueMatchesTransaction } from "./project-operations.mjs";
import {
  parseProjectPublicationTransaction,
  fingerprintProjectPublicationInput,
} from "../publication/project-publication-transaction.mjs";
import {
  planProjectSubmissionClosure,
  terminalProjectValidationComment,
} from "../submissions/project-submission-lifecycle.mjs";
import { planProjectOwnerClosure } from "../help/project-owner-lifecycle.mjs";
import { reconcileOwnedKitLabels } from "../submissions/kit-submission-reconciliation.mjs";
import {
  planCopyAdjustmentNotice,
  planOwnerDelistNotice,
} from "../publication/project-publication-notices.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { createHash } from "node:crypto";
import Ajv from "ajv";
import advisorySchema from "../../data/schemas/catalog-policy-review.schema.json" with { type: "json" };
import { createPolicyEvidenceFingerprint } from "../moderation/catalog-policy-review-contract.mjs";
import { renderCatalogPolicyReviewIssue } from "../moderation/catalog-policy-review-notice.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";

const advisoryAjv = new Ajv({ strict: false });
advisoryAjv.addFormat(
  "date-time",
  (value) =>
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value) &&
    Number.isFinite(Date.parse(value)),
);
const validateAdvisory = advisoryAjv.compile(advisorySchema);

const repository = "MentallyQuill/Tavernary";
const complete = () => ({ status: "complete" });
const superseded = () => ({ status: "superseded" });
const waiting = () => ({ status: "waiting" });
const labels = (issue) =>
  issue.labels.map((label) => (typeof label === "string" ? label : label.name));
const positive = (value) => Number.isSafeInteger(value) && value > 0;
const owned = (value, publisherActorId) =>
  value.user?.type === "Bot" &&
  [publisherActorId, 41898282].includes(value.user.id);
const humanDecision = (issue) =>
  issue.state_reason === "not_planned" ||
  labels(issue).some((label) =>
    ["submission-declined", "needs-information"].includes(label),
  );

async function api(gh, path, method = "GET", payload) {
  const result = await gh(
    [
      "api",
      `repos/${repository}/${path}`,
      ...(method === "GET" ? [] : ["--method", method]),
      ...(payload ? ["--input", "-"] : []),
    ],
    payload ? JSON.stringify(payload) : undefined,
  );
  if (Buffer.byteLength(result) > 4194304)
    throw new Error("Lifecycle response exceeds its bound.");
  return result.trim() ? JSON.parse(result) : null;
}
async function pages(gh, path) {
  const result = [];
  for (let page = 1; page <= 10; page++) {
    const current = await api(
      gh,
      `${path}${path.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
    );
    if (!Array.isArray(current) || current.length > 100)
      throw new Error("Lifecycle inventory is invalid.");
    result.push(...current);
    if (current.length < 100) return result;
  }
  throw Object.assign(new Error("Lifecycle inventory exceeds its bound."), {
    code: "provider-unavailable",
  });
}
async function issue(gh, number) {
  const value = await api(gh, `issues/${number}`);
  if (
    value?.number !== number ||
    value.pull_request ||
    !Array.isArray(value.labels) ||
    !positive(value.user?.id)
  )
    throw new Error("Lifecycle issue identity is invalid.");
  return value;
}
function sameIssue(left, right) {
  return (
    left.number === right.number &&
    left.user.id === right.user.id &&
    left.user.type === right.user.type &&
    left.body === right.body
  );
}
async function ensureLabel(gh, name) {
  try {
    await api(gh, `labels/${encodeURIComponent(name)}`);
  } catch (error) {
    if (githubFailureStatus(error) !== 404) throw error;
    await api(gh, "labels", "POST", {
      name,
      color: "6e7781",
      description: "Tavernary publication lifecycle.",
    });
  }
}
async function syncIssue({ gh, original, desiredLabels, removeLabels, guard }) {
  let current = await issue(gh, original.number);
  if (
    !sameIssue(original, current) ||
    humanDecision(current) ||
    !(await guard(current))
  )
    return superseded();
  for (const name of labels(current).filter(
    (label) => removeLabels.includes(label) && !desiredLabels.includes(label),
  )) {
    try {
      await api(
        gh,
        `issues/${current.number}/labels/${encodeURIComponent(name)}`,
        "DELETE",
      );
    } catch (error) {
      if (githubFailureStatus(error) !== 404) throw error;
    }
  }
  const add = desiredLabels.filter((name) => !labels(current).includes(name));
  for (const name of add) await ensureLabel(gh, name);
  if (add.length)
    await api(gh, `issues/${current.number}/labels`, "POST", { labels: add });
  current = await issue(gh, original.number);
  if (
    !sameIssue(original, current) ||
    humanDecision(current) ||
    !(await guard(current))
  )
    return superseded();
  if (current.state !== "closed" || current.state_reason !== "completed")
    await api(gh, `issues/${current.number}`, "PATCH", {
      state: "closed",
      state_reason: "completed",
    });
  const after = await issue(gh, original.number);
  if (!sameIssue(original, after) || !(await guard(after))) return superseded();
  return after.state === "closed" &&
    after.state_reason === "completed" &&
    desiredLabels.every((name) => labels(after).includes(name)) &&
    !removeLabels.some(
      (name) => !desiredLabels.includes(name) && labels(after).includes(name),
    )
    ? complete()
    : waiting();
}
function currentOperation(state, operation) {
  return state.operations.some(
    (value) =>
      value.key === operation.key &&
      value.expectedSha === operation.expectedSha &&
      ["deployment-confirmed", "finalized"].includes(value.stage),
  );
}
function kitMatches(state, operation, current) {
  if (!currentOperation(state, operation)) return false;
  const found = discoverKitOperations({
    issues: [{ ...current, state: "open" }],
    kits: state.local.kits,
    projects: state.local.projects,
    sourcesById: Object.fromEntries(
      state.local.sources.map((source) => [source.id, source]),
    ),
    snapshotsBySourceId: Object.fromEntries(
      state.local.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
    ),
    blockedUsers: state.local.blockedUsers,
    trustedEditors: state.local.trustedEditors,
    runs: [],
    receipts: [],
    nowMs: state.nowMs,
    publisherActorId: state.publisherActorId,
    canonicalRevision: operation.expectedSha,
    confirmedRevisions: [operation.expectedSha],
  });
  return found.some(
    (value) =>
      value.key === operation.key && value.stage === "deployment-confirmed",
  );
}
async function kitProjection(input) {
  const { operation, gh, load } = input;
  const state = await load();
  const number = Number(operation.identity.subject.slice(6));
  const original = await issue(gh, number);
  if (humanDecision(original) || !kitMatches(state, operation, original))
    return superseded();
  const withdrawal = operation.identity.kind === "withdrawal";
  const desiredLabels = withdrawal
    ? ["issue-admitted", "kit-withdrawal", "kit-withdrawn"]
    : ["issue-admitted", "kit-submission", "kit-published"];
  const combined = reconcileOwnedKitLabels({
    currentLabels: labels(original),
    desiredOwnedLabels: desiredLabels,
  });
  const removeLabels = [
    ...labels(original).filter((name) => !combined.includes(name)),
    ...(withdrawal ? ["needs-information", "kit-publication-ready"] : []),
  ];
  return syncIssue({
    gh,
    original,
    desiredLabels,
    removeLabels,
    guard: async (current) => kitMatches(await load(), operation, current),
  });
}
async function applyNotice(gh, plan, kind, issueNumber) {
  if (!["create", "update"].includes(plan.action)) return;
  if (kind === "comment") {
    if (plan.action === "update" && !positive(plan.commentId))
      throw new Error("Notice comment identity is invalid.");
    await api(
      gh,
      plan.action === "create"
        ? `issues/${issueNumber}/comments`
        : `issues/comments/${plan.commentId}`,
      plan.action === "create" ? "POST" : "PATCH",
      { body: plan.body },
    );
  } else {
    for (const name of plan.labels) await ensureLabel(gh, name);
    if (plan.action === "update" && !positive(plan.issueNumber))
      throw new Error("Notice issue identity is invalid.");
    await api(
      gh,
      plan.action === "create" ? "issues" : `issues/${plan.issueNumber}`,
      plan.action === "create" ? "POST" : "PATCH",
      {
        title: plan.title,
        body: plan.body,
        ...(plan.action === "create" ? { labels: plan.labels } : {}),
      },
    );
  }
}
async function projectProjection(input) {
  const { operation, gh, load } = input;
  const state = await load();
  const number = Number(operation.identity.subject.slice(6));
  const producer =
    operation.identity.kind === "project"
      ? "project-submission"
      : "project-owner-request";
  const candidates = state.remote.pulls.filter(
    (pull) =>
      pull.head?.ref === `automation/${producer}-${number}` &&
      pull.merge_commit_sha === operation.expectedSha,
  );
  if (candidates.length !== 1) return superseded();
  const pull = await api(gh, `pulls/${candidates[0].number}`);
  const transaction = parseProjectPublicationTransaction(pull?.body ?? "");
  if (
    !transaction ||
    pull.number !== candidates[0].number ||
    pull.user?.id !== state.publisherActorId ||
    pull.user.type !== "Bot" ||
    pull.state !== "closed" ||
    !pull.merged_at ||
    pull.merge_commit_sha !== operation.expectedSha ||
    pull.head?.repo?.full_name !== repository ||
    pull.base?.repo?.full_name !== repository ||
    pull.base.ref !== "main" ||
    pull.head.sha !== transaction.generated_head_sha ||
    transaction.producer !== producer ||
    transaction.issue_number !== number ||
    transaction.policy_version !== operation.identity.policyVersion ||
    fingerprintProjectPublicationInput({
      actor: transaction.actor,
      inputDigest: transaction.input_digest,
    }) !== operation.identity.inputDigest
  )
    return superseded();
  const original = await issue(gh, number);
  const matches = (fresh, current) =>
    currentOperation(fresh, operation) &&
    projectIssueMatchesTransaction({
      issue: current,
      transaction,
      catalog: { projects: fresh.local.projects, sources: fresh.local.sources },
    });
  if (humanDecision(original) || !matches(state, original)) return superseded();
  const plan = (
    producer === "project-submission"
      ? planProjectSubmissionClosure
      : planProjectOwnerClosure
  )({
    merged: true,
    headRef: pull.head.ref,
    headRepository: pull.head.repo.full_name,
    baseRepository: repository,
    baseRef: pull.base.ref,
    defaultBranch: "main",
    headSha: pull.head.sha,
    body: pull.body,
  });
  if (plan.action !== "merged") return superseded();
  const comments = (await pages(gh, `issues/${number}/comments`)).filter(
    (value) => owned(value, state.publisherActorId),
  );
  const terminal = comments.filter((value) =>
    String(value.body ?? "").includes(
      "<!-- tavernary-project-validation-state",
    ),
  );
  if (terminal.length > 1)
    throw new Error("Validation comment custody is ambiguous.");
  if (terminal[0]) {
    const body = terminalProjectValidationComment({
      existingBody: terminal[0].body,
      action: "merged",
      headSha: pull.head.sha,
    });
    if (body !== null)
      await applyNotice(
        gh,
        { action: "update", commentId: terminal[0].id, body },
        "comment",
        number,
      );
  }
  const copy = planCopyAdjustmentNotice(transaction, comments);
  await applyNotice(gh, copy, "comment", number);
  let delistInput;
  if (transaction.operation === "delist-source") {
    const notices = (
      await pages(gh, "issues?state=all&labels=owner-delist-notice")
    ).filter(
      (value) => owned(value, state.publisherActorId) && !value.pull_request,
    );
    const source = state.local.sources.find(
      (value) => value.id === transaction.source_id,
    );
    if (source?.status !== "delisted") return superseded();
    delistInput = {
      transaction,
      source,
      projects: state.local.projects,
      kits: state.local.kits,
      pull,
      issue: original,
      publishedAt: pull.merged_at,
      existingIssues: notices,
    };
    const delist = planOwnerDelistNotice(delistInput);
    await applyNotice(gh, delist, "issue", number);
  }
  const outcome = await syncIssue({
    gh,
    original,
    desiredLabels: [],
    removeLabels: plan.removeLabels,
    guard: async (current) => matches(await load(), current),
  });
  if (outcome.status !== "complete") return outcome;
  // A receipt cannot substitute for the externally visible projection.
  const verifiedComments = (
    await pages(gh, `issues/${number}/comments`)
  ).filter((value) => owned(value, state.publisherActorId));
  const verifiedCopy = planCopyAdjustmentNotice(transaction, verifiedComments);
  if (["create", "update"].includes(verifiedCopy.action)) return waiting();
  if (
    terminal[0] &&
    !verifiedComments.some(
      (value) =>
        value.id === terminal[0].id &&
        terminalProjectValidationComment({
          existingBody: value.body,
          action: "merged",
          headSha: pull.head.sha,
        }) === null,
    )
  )
    return waiting();
  if (delistInput) {
    const existingIssues = (
      await pages(gh, "issues?state=all&labels=owner-delist-notice")
    ).filter(
      (value) => owned(value, state.publisherActorId) && !value.pull_request,
    );
    if (
      ["create", "update"].includes(
        planOwnerDelistNotice({ ...delistInput, existingIssues }).action,
      )
    )
      return waiting();
  }
  return complete();
}
function advisoryData(state, operation) {
  const [, sourceId, projectId] = operation.identity.subject.split(":");
  const project = state.local.projects.find(
    (value) => value.id === projectId && value.source_id === sourceId,
  );
  const source = state.local.sources.find((value) => value.id === sourceId);
  const snapshot = state.local.snapshots.find(
    (value) => value.source_id === sourceId,
  );
  const review = state.local.advisoryState.find(
    (value) => value.project_id === projectId && value.source_id === sourceId,
  );
  if (
    source?.refresh_policy !== "automatic" ||
    !review ||
    !project ||
    !source ||
    operation.identity.policyVersion !== CATALOG_POLICY_VERSION ||
    source.status !== "active" ||
    !["github", "codeberg"].includes(source.type) ||
    !positive(source.repository_id) ||
    snapshot?.repository?.id !== source.repository_id ||
    !/^[a-f0-9]{40}$/u.test(snapshot.repository.head_sha ?? "") ||
    !effectiveListingState({ project, source, snapshot }).public
  )
    return null;
  if (
    !validateAdvisory(review) ||
    Date.parse(review.reviewed_at) > state.nowMs + 300000 ||
    (review.status === "review-suggested"
      ? review.category === null
      : review.category !== null)
  )
    throw Object.assign(new Error("Advisory state is invalid."), {
      code: "validation-failed",
    });
  const identity = `${source.type}:${source.repository.toLowerCase()}`;
  const fingerprint = createPolicyEvidenceFingerprint({
    projectId,
    sourceId,
    headSha: snapshot.repository.head_sha,
    policyVersion: operation.identity.policyVersion,
  });
  if (
    review.source_identity !== identity ||
    review.evidence_fingerprint !== fingerprint ||
    review.policy_version !== operation.identity.policyVersion ||
    fingerprintProjectPublicationInput({
      sourceIdentity: identity,
      fingerprint,
    }) !== operation.identity.inputDigest
  )
    return null;
  return { project, source, snapshot, review };
}
async function advisoryProjection({ operation, gh, load, commit }) {
  const state = await load();
  const initial = advisoryData(state, operation);
  if (!initial) return superseded();
  const { project, source, review } = initial;
  if (review.status === "clear") return complete();
  if (review.status !== "review-suggested") return waiting();
  const marker = `<!-- tavernary-advisory-operation:${operation.key} -->`;
  const legacyMarker = `<!-- tavernary-catalog-policy-review:${project.id} -->`;
  const binds = (value) =>
    owned(value, state.publisherActorId) &&
    !value.pull_request &&
    (String(value.body ?? "").includes(marker) ||
      (String(value.body ?? "").includes(legacyMarker) &&
        String(value.body).includes(review.evidence_fingerprint)));
  let notice;
  if (review.maintenance_issue_number !== null) {
    notice = await api(gh, `issues/${review.maintenance_issue_number}`);
    if (notice?.number !== review.maintenance_issue_number || !binds(notice))
      throw Object.assign(new Error("Advisory notice custody is invalid."), {
        code: "validation-failed",
      });
    return complete();
  }
  const candidates = (
    await pages(gh, "issues?state=all&labels=catalog-policy-advisory")
  ).filter(binds);
  if (candidates.length > 1)
    throw Object.assign(new Error("Advisory notice custody is ambiguous."), {
      code: "validation-failed",
    });
  notice = candidates[0];
  if (!notice) {
    const latest = await load();
    const current = advisoryData(latest, operation);
    if (
      !current ||
      fingerprintProjectPublicationInput(current.review) !==
        fingerprintProjectPublicationInput(review)
    )
      return superseded();
    const rendered = renderCatalogPolicyReviewIssue({
      project,
      sourceUrl: `https://${source.type === "github" ? "github.com" : "codeberg.org"}/${source.repository}`,
      output: {
        status: "review-suggested",
        category: review.category,
        explanation:
          "An automated review suggested checking the verified source against the Catalog Policy. This advisory does not establish a violation.",
      },
      submittedSummary: "",
      copyReasons: [],
      evidenceFingerprint: review.evidence_fingerprint,
      policyVersion: review.policy_version,
      reviewedAt: review.reviewed_at,
    });
    await ensureLabel(gh, "catalog-policy-advisory");
    notice = await api(gh, "issues", "POST", {
      ...rendered,
      body: `${marker}\n${rendered.body}`,
    });
    if (!positive(notice?.number) || !binds(notice))
      throw new Error("Advisory notice creation is unconfirmed.");
  }
  const verified = await api(gh, `issues/${notice.number}`);
  if (verified?.number !== notice.number || !binds(verified))
    throw new Error("Advisory notice is unconfirmed.");
  const fresh = await load();
  const current = advisoryData(fresh, operation);
  if (!current) return superseded();
  if (current.review.maintenance_issue_number === notice.number)
    return complete();
  if (
    fresh.local.revision !== fresh.remote.mainHeadSha ||
    fingerprintProjectPublicationInput(current.review) !==
      fingerprintProjectPublicationInput(review)
  )
    return superseded();
  const content = `${JSON.stringify({ ...current.review, maintenance_issue_number: notice.number }, null, 2)}\n`;
  await commit({
    repository,
    expectedMainSha: fresh.local.revision,
    message: "chore(moderation): record verified advisory notice",
    files: [
      {
        path: `data/snapshots/policy-review/${project.id}.json`,
        type: "file",
        content,
        bytes: Buffer.byteLength(content),
        sha256: createHash("sha256").update(content).digest("hex"),
      },
    ],
  });
  const after = advisoryData(await load(), operation);
  return after?.review.maintenance_issue_number === notice.number
    ? complete()
    : waiting();
}
export async function projectAutomationLifecycle(input) {
  const { operation, state } = input;
  validateAutomationOperation(operation);
  if (state.repository !== repository || !positive(state.publisherActorId))
    throw new Error("Lifecycle context is invalid.");
  if (
    operation.identity.kind === "advisory" &&
    ["deployment-confirmed", "validated"].includes(operation.stage)
  )
    return advisoryProjection(input);
  if (operation.stage !== "deployment-confirmed") return waiting();
  if (["kit", "withdrawal"].includes(operation.identity.kind))
    return kitProjection(input);
  if (["project", "owner-request"].includes(operation.identity.kind))
    return projectProjection(input);
  if (
    ["deployment", "refresh", "metadata", "report-import"].includes(
      operation.identity.kind,
    )
  )
    return complete();
  throw new Error("Lifecycle kind is unsupported.");
}
