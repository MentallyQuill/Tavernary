import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { effectiveIssueRoute } from "../submissions/admit-issue.mjs";
import { parseProjectSubmissionIssue } from "../submissions/parse-project-submission.mjs";
import { parseProjectOwnerManifestIssue } from "../help/triage-project-owner-request.mjs";
import { normalizeProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import {
  fingerprintProjectPublicationInput,
  parseProjectPublicationTransaction,
} from "../publication/project-publication-transaction.mjs";
import { planProjectValidationReconciliation } from "../submissions/project-validation-reconciliation.mjs";
import frontends from "../../data/vocabularies/frontends.json" with { type: "json" };
import primaryFunctions from "../../data/vocabularies/primary-functions.json" with { type: "json" };
import tags from "../../data/vocabularies/tags.json" with { type: "json" };
import modelFamilies from "../../data/vocabularies/model-families.json" with { type: "json" };
import completionFormats from "../../data/vocabularies/completion-formats.json" with { type: "json" };
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
import { operationKey } from "./operation.mjs";

import {
  matchingOperationReceipt as matchingReceipt,
  receiptBindsWorker as boundGeneration,
  recoverInventoryWorker as generationRecovery,
} from "./inventory-worker.mjs";

const defaultVocabularies = {
  frontends,
  primaryFunctions,
  tags,
  modelFamilies,
  completionFormats,
  tagVocabularyHash: tagVocabularyHash(tags),
};
const protectedLabels = new Set([
  "needs-information",
  "submission-declined",
  "issue-limit-reached",
]);
const activeStatuses = new Set([
  "queued",
  "in_progress",
  "pending",
  "requested",
  "waiting",
]);

function isActive(run) {
  return activeStatuses.has(run.status) || run.conclusion == null;
}
function actorMatches(actor, user) {
  return (
    actor?.id === user?.id &&
    actor?.type === user?.type &&
    actor?.login?.toLowerCase() === user?.login?.toLowerCase()
  );
}
function issueManifest(issue, kind, catalog, admitted) {
  if (kind === "project")
    return parseProjectSubmissionIssue(issue.body ?? "", {
      allowLegacyV3: admitted,
    });
  const parsed = parseProjectOwnerManifestIssue(issue.body ?? "");
  if (!parsed.valid) return parsed;
  return normalizeProjectOwnerManifest(parsed.manifest, {
    ...(catalog.vocabularies ?? defaultVocabularies),
    source: catalog.sources.find(
      (source) => source.id === parsed.manifest?.source_id,
    ),
  });
}

function trustedPull(pull, transaction, input, producer, issue) {
  const repository = input.repository ?? "MentallyQuill/Tavernary";
  return (
    transaction?.producer === producer &&
    transaction.issue_number === issue.number &&
    pull.user?.id === input.publisherActorId &&
    pull.user.type === "Bot" &&
    pull.head?.sha === transaction.generated_head_sha &&
    pull.head?.repo?.full_name === repository &&
    pull.base?.repo?.full_name === repository &&
    pull.base.ref === (input.defaultBranch ?? "main") &&
    actorMatches(transaction.actor, issue.user)
  );
}

function trustedGenerationRuns(input, issue, producer) {
  const title = `${producer === "project-submission" ? "Project" : "Owner request"} #${issue.number}: Create review PR`;
  return input.runs
    .filter(
      (run) =>
        run.path === `.github/workflows/generate-${producer}.yml` &&
        run.event === "workflow_dispatch" &&
        run.head_branch === (input.defaultBranch ?? "main") &&
        run.display_title === title &&
        run.actor?.id === input.publisherActorId &&
        run.actor.type === "Bot",
    )
    .sort(
      (left, right) =>
        Date.parse(right.created_at ?? "") -
          Date.parse(left.created_at ?? "") || right.id - left.id,
    );
}

export function discoverProjectOperations(input) {
  const operations = [];
  for (const issue of input.issues) {
    const route = effectiveIssueRoute(issue);
    if (
      !["open", "closed"].includes(issue.state) ||
      issue.pull_request ||
      !["project", "project-owner"].includes(route) ||
      !Number.isSafeInteger(issue.user?.id) ||
      issue.user.id < 1
    )
      continue;
    const labels = issue.labels.map((label) =>
      typeof label === "string" ? label : label.name,
    );
    const admitted = labels.includes("issue-admitted");
    if (labels.some((label) => protectedLabels.has(label))) continue;
    const kind = route === "project" ? "project" : "owner-request";
    const producer =
      route === "project" ? "project-submission" : "project-owner-request";
    const parsed = issueManifest(issue, kind, input.catalog, admitted);
    const manifestDigest = fingerprintProjectPublicationInput(
      parsed.valid
        ? parsed.manifest
        : { bodyDigest: fingerprintProjectPublicationInput(issue.body ?? "") },
    );
    const actor = {
      id: issue.user.id,
      login: issue.user.login,
      type: issue.user.type,
    };
    const identity = {
      kind,
      subject: `issue:${issue.number}`,
      inputDigest: fingerprintProjectPublicationInput({
        actor,
        inputDigest: manifestDigest,
      }),
      policyVersion: CATALOG_POLICY_VERSION,
    };
    const created = Date.parse(issue.created_at ?? "");
    const operation = {
      key: operationKey(identity),
      identity,
      stage: admitted ? "admitted" : "discovered",
      createdAt: new Date(
        Number.isFinite(created) ? created : input.nowMs,
      ).toISOString(),
      nextEligibleAt: null,
      expectedSha: null,
      workerRunId: null,
      retry: null,
    };
    const repository = input.repository ?? "MentallyQuill/Tavernary";
    const branch = `automation/${producer}-${issue.number}`;
    const related = input.pulls.filter(
      (pull) =>
        pull.head?.ref === branch &&
        (pull.head.repo?.full_name === repository ||
          pull.user?.id === input.publisherActorId),
    );
    const merged = related.find(
      (pull) =>
        pull.state === "closed" &&
        pull.merged_at &&
        /^[a-f0-9]{40}$/u.test(pull.merge_commit_sha ?? ""),
    );
    const pull = merged ?? related.find((pull) => pull.state === "open");
    if (issue.state === "closed" && !merged) continue;
    if (!pull) {
      if (related.length > 0) continue;
      generationRecovery(
        operation,
        input,
        trustedGenerationRuns(input, issue, producer),
      );
      operations.push(operation);
      continue;
    }
    const transaction = parseProjectPublicationTransaction(pull.body ?? "");
    if (!trustedPull(pull, transaction, input, producer, issue)) continue;
    if (merged) {
      operation.identity = {
        ...identity,
        inputDigest: fingerprintProjectPublicationInput({
          actor: transaction.actor,
          inputDigest: transaction.input_digest,
        }),
        policyVersion: transaction.policy_version,
      };
      operation.key = operationKey(operation.identity);
      operation.expectedSha = pull.merge_commit_sha;
      operation.stage = input.catalog.confirmedRevisions?.includes(
        pull.merge_commit_sha,
      )
        ? "deployment-confirmed"
        : input.catalog.requestedRevisions?.includes(pull.merge_commit_sha)
          ? "deployment-requested"
          : "published";
      operations.push(operation);
      continue;
    }
    if (!admitted || transaction.publication_mode !== "automatic") continue;
    operation.expectedSha = pull.head.sha;
    if (
      transaction.input_digest !== manifestDigest ||
      transaction.policy_version !== identity.policyVersion
    ) {
      operation.workerRunId =
        trustedGenerationRuns(input, issue, producer).find(isActive)?.id ??
        null;
      operations.push(operation);
      continue;
    }
    const validations = input.runs.filter(
      (run) =>
        run.path === ".github/workflows/ci.yml" &&
        run.event === "workflow_dispatch" &&
        run.head_branch === branch &&
        run.head_sha === pull.head.sha,
    );
    const successful = validations.filter(
      (run) => run.conclusion === "success",
    );
    const titles = new Set(
      successful.map((run) => `Project publication for validation #${run.id}`),
    );
    const publications = input.runs
      .filter(
        (run) =>
          run.path === ".github/workflows/publish-project-transaction.yml" &&
          run.event === "workflow_dispatch" &&
          run.head_branch === (input.defaultBranch ?? "main") &&
          run.actor?.id === input.publisherActorId &&
          run.actor.type === "Bot" &&
          titles.has(run.display_title),
      )
      .map((run) => ({ ...run, head_sha: pull.head.sha }));
    const receipt = matchingReceipt(input, {
      ...operation,
      stage: "generated",
    });
    const generations = trustedGenerationRuns(input, issue, producer)
      .filter((run) => isActive(run) || boundGeneration(run, receipt))
      .map((run) => ({ ...run, head_sha: pull.head.sha }));
    const plan = planProjectValidationReconciliation({
      transaction,
      headSha: pull.head.sha,
      validationRuns: validations,
      publicationRuns: publications,
      generationRuns: generations,
      nowMs: input.nowMs,
      pull,
    });
    if (plan.action === "ignore") continue;
    operation.stage = [
      "validating",
      "retrying-validation",
      "validation-blocked",
    ].includes(plan.state)
      ? "generated"
      : "validated";
    operation.workerRunId = plan.run && isActive(plan.run) ? plan.run.id : null;
    operation.nextEligibleAt = plan.retry?.nextEligibleAt ?? null;
    operation.retry = plan.failure
      ? {
          failure: plan.failure,
          transientAttempts: Math.max(0, validations.length - 1),
          immediateAttempts: plan.attempts,
        }
      : null;
    const saved = matchingReceipt(input, operation);
    if (
      operation.retry &&
      saved?.operation.retry?.failure.reasonCode ===
        operation.retry.failure.reasonCode &&
      plan.run &&
      !Number.isFinite(
        Date.parse(plan.run.updated_at ?? plan.run.created_at ?? ""),
      )
    ) {
      operation.nextEligibleAt = saved.operation.nextEligibleAt;
    }
    operations.push(operation);
  }
  return operations;
}
