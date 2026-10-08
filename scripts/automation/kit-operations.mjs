import { effectiveIssueRoute } from "../submissions/admit-issue.mjs";
import { parseKitIssueFields } from "../submissions/triage-kit-issue.mjs";
import { classifyKitSubmissionHistory } from "../submissions/kit-submission-reconciliation.mjs";
import { parseKitWithdrawalIssue } from "../kits/apply-withdrawal.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";
import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { operationKey } from "./operation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import {
  recoverInventoryWorker,
  trustedOperationWorkerRuns,
} from "./inventory-worker.mjs";

export function discoverKitOperations(input) {
  const operations = [];
  for (const issue of input.issues) {
    const route = effectiveIssueRoute(issue);
    if (
      issue.pull_request ||
      !["kit", "kit-withdrawal"].includes(route) ||
      !Number.isSafeInteger(issue.user?.id) ||
      issue.user.id < 1 ||
      issue.user.type !== "User"
    )
      continue;
    let manifest;
    try {
      manifest =
        route === "kit"
          ? JSON.parse(parseKitIssueFields(issue.body ?? "").manifest)
          : parseKitWithdrawalIssue(issue.body ?? "").manifest;
    } catch {
      manifest = null;
    }
    if (
      route === "kit" &&
      manifest &&
      typeof manifest.title === "string" &&
      typeof manifest.description === "string"
    ) {
      manifest = {
        operation: manifest.operation,
        kit_id: manifest.kit_id,
        title: manifest.title.trim(),
        description: manifest.description.trim(),
        project_ids: manifest.project_ids,
      };
    }
    const identity = {
      kind: route === "kit" ? "kit" : "withdrawal",
      subject: `issue:${issue.number}`,
      inputDigest: fingerprintProjectPublicationInput({
        actor: { id: issue.user.id, login: issue.user.login },
        manifest: manifest ?? issue.body,
      }),
      policyVersion: CATALOG_POLICY_VERSION,
    };
    const operation = {
      key: operationKey(identity),
      identity,
      stage: "admitted",
      createdAt: new Date(
        Date.parse(issue.created_at ?? "") || input.nowMs,
      ).toISOString(),
      nextEligibleAt: null,
      expectedSha: null,
      workerRunId: null,
      retry: null,
    };
    const labels = issue.labels.map((label) =>
      typeof label === "string" ? label : label.name,
    );
    const admitted = labels.includes("issue-admitted");
    const withdrawalKit =
      route === "kit-withdrawal" &&
      manifest &&
      input.kits.find(
        (kit) =>
          kit.id === manifest.kit_id &&
          kit.author.github_user_id === issue.user.id,
      );
    const history =
      route === "kit"
        ? classifyKitSubmissionHistory({ ...input, issue })
        : null;
    if (
      ["published-create", "applied-edit"].includes(history?.disposition) ||
      withdrawalKit?.status === "withdrawn"
    ) {
      operation.expectedSha = input.canonicalRevision ?? null;
      operation.stage = input.confirmedRevisions?.includes(
        operation.expectedSha,
      )
        ? "deployment-confirmed"
        : input.requestedRevisions?.includes(operation.expectedSha)
          ? "deployment-requested"
          : "published";
      const completeLabel = route === "kit" ? "kit-published" : "kit-withdrawn";
      if (
        operation.stage === "deployment-confirmed" &&
        issue.state === "closed" &&
        issue.state_reason === "completed" &&
        labels.includes(completeLabel)
      )
        continue;
    } else {
      if (
        issue.state !== "open" ||
        labels.some((label) =>
          [
            "needs-maintainer-review",
            "needs-information",
            "submission-declined",
            "issue-limit-reached",
          ].includes(label),
        )
      )
        continue;
      if (route === "kit-withdrawal" && !withdrawalKit) continue;
      if (history?.disposition === "superseded") continue;
      operation.stage = !admitted
        ? "discovered"
        : route === "kit-withdrawal" ||
            (labels.includes("kit-publication-ready") &&
              history?.disposition === "unpublished-valid")
          ? "validated"
          : "admitted";
      if (
        admitted &&
        labels.includes("kit-publication-ready") &&
        history?.disposition === "invalid"
      ) {
        operation.retry = {
          failure: classifyAutomationFailure({
            validationErrors: ["Kit validation failed"],
          }),
          transientAttempts: 0,
          immediateAttempts: 0,
        };
      }
      const workflow =
        operation.stage === "discovered"
          ? "admit-issue"
          : operation.stage === "admitted"
            ? "triage-kit-submission"
            : route === "kit"
              ? "apply-kit-submission"
              : "apply-kit-withdrawal";
      const title =
        operation.stage === "discovered"
          ? `Issue #${issue.number}: Check submission eligibility`
          : `Kit #${issue.number}: ${operation.stage === "admitted" ? "Validate submission" : route === "kit" ? "Publish approved Kit" : "Withdraw published Kit"}`;
      const runs = input.runs
        .filter(
          (run) =>
            run.path === `.github/workflows/${workflow}.yml` &&
            run.event === "workflow_dispatch" &&
            run.display_title === title &&
            run.head_branch === (input.defaultBranch ?? "main") &&
            run.actor?.id === input.publisherActorId &&
            run.actor.type === "Bot",
        )
        .sort(
          (left, right) =>
            Date.parse(right.created_at ?? "") -
              Date.parse(left.created_at ?? "") || right.id - left.id,
        );
      if (operation.retry?.failure.kind !== "permanent")
        recoverInventoryWorker(operation, input, [
          ...trustedOperationWorkerRuns(input, operation),
          ...runs,
        ]);
    }
    operations.push(operation);
  }
  return operations;
}
