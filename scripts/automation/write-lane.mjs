import { validateAutomationOperation } from "./operation.mjs";
import { validatePreparedResult } from "./prepared-result.mjs";
import { planProjectPublication } from "../publication/project-publication-planner.mjs";
import {
  createProjectPublicationTransaction,
  expectedTransactionPaths,
} from "../publication/project-publication-transaction.mjs";

export function planCanonicalPublication({
  operations,
  candidates,
  currentMainSha,
  expectedPublisherId,
}) {
  if (
    !/^[a-f0-9]{40}$/u.test(currentMainSha) ||
    !Number.isSafeInteger(expectedPublisherId) ||
    expectedPublisherId < 1
  )
    throw new Error("Canonical write context is invalid.");
  const plan = {
    actions: [],
    rejected: [],
    regenerate: [],
    waiting: [],
    satisfied: [],
  };
  const byKey = new Map();
  for (const operation of operations) {
    validateAutomationOperation(operation);
    if (
      byKey.has(operation.key) &&
      JSON.stringify(byKey.get(operation.key)) !== JSON.stringify(operation)
    )
      throw new Error("Canonical operations disagree.");
    byKey.set(operation.key, operation);
  }
  const unique = new Map();
  const conflicted = new Set();
  for (const candidate of candidates) {
    const key = candidate.result?.operationKey;
    const prior = unique.get(key);
    if (
      prior &&
      JSON.stringify(prior.result) !== JSON.stringify(candidate.result)
    )
      conflicted.add(key);
    else unique.set(key, candidate);
  }
  if (unique.size > 20)
    throw new Error(
      "Canonical publication exceeds its twenty-operation quota.",
    );
  const accepted = [];
  for (const [key, candidate] of unique) {
    const operation = byKey.get(key);
    if (!operation || conflicted.has(key)) {
      plan.rejected.push({ key, reasonCode: "prepared-operation-conflict" });
      continue;
    }
    if (
      [
        "published",
        "deployment-requested",
        "deployment-confirmed",
        "finalized",
      ].includes(operation.stage)
    ) {
      plan.satisfied.push(key);
      continue;
    }
    try {
      if (operation.retry?.failure.kind === "permanent") {
        plan.rejected.push({
          key,
          reasonCode: "operation-permanently-rejected",
        });
        continue;
      }
      if (candidate.currentState.mainSha !== currentMainSha)
        throw Object.assign(new Error("Main changed."), {
          code: "prepared-base-stale",
        });
      const result = validatePreparedResult(candidate.result, {
        operation,
        run: candidate.run,
        publisherActorId: expectedPublisherId,
        currentState: candidate.currentState,
      });
      if (["project", "owner-request"].includes(operation.identity.kind)) {
        const input = candidate.currentState.projectPublication;
        if (!input || input.current?.mainSha !== currentMainSha)
          throw Object.assign(new Error("Project authority context missing."), {
            code: "prepared-state-invalid",
          });
        const transaction = createProjectPublicationTransaction(
          input.transaction,
        );
        if (
          transaction.producer !==
            (result.kind === "project"
              ? "project-submission"
              : "project-owner-request") ||
          `issue:${transaction.issue_number}` !== operation.identity.subject ||
          transaction.actor.id !== result.authorId ||
          transaction.source_id !== result.source.id ||
          transaction.source_identity.canonical !== result.source.identity ||
          transaction.policy_version !== result.policyVersion ||
          transaction.base_sha !== result.baseSha ||
          transaction.generated_head_sha !== operation.expectedSha ||
          input.pull?.user?.id !== expectedPublisherId ||
          input.pull?.user?.type !== "Bot" ||
          JSON.stringify([...expectedTransactionPaths(transaction)].sort()) !==
            JSON.stringify(result.files.map((file) => file.path).sort()) ||
          result.files.some(
            (file) => input.validatedFileDigests?.[file.path] !== file.sha256,
          )
        )
          throw Object.assign(
            new Error("Project transaction binding changed."),
            { code: "prepared-operation-mismatch" },
          );
        const decision = planProjectPublication(input);
        if (decision.action === "merge")
          plan.actions.push({
            ...decision,
            operationKeys: [key],
            expectedMainSha: currentMainSha,
          });
        else if (decision.action === "regenerate")
          plan.regenerate.push({ key, reasonCode: decision.reasonCode });
        else if (decision.action === "reject")
          plan.rejected.push({ key, reasonCode: decision.reasonCode });
        else
          plan.waiting.push({
            key,
            reasonCode: decision.reasonCode ?? "publication-pending",
          });
      } else accepted.push({ key, result });
    } catch (error) {
      const reasonCode =
        typeof error?.code === "string" &&
        /^prepared-[a-z-]+$/u.test(error.code)
          ? error.code
          : "prepared-content-invalid";
      if (
        [
          "prepared-input-stale",
          "prepared-source-changed",
          "prepared-base-stale",
        ].includes(reasonCode)
      )
        plan.regenerate.push({ key, reasonCode });
      else plan.rejected.push({ key, reasonCode });
    }
  }
  const owners = new Map();
  const fileConflicts = new Set();
  for (const candidate of accepted)
    for (const file of candidate.result.files) {
      const claimants = owners.get(file.path) ?? [];
      claimants.push({ key: candidate.key, file });
      owners.set(file.path, claimants);
    }
  for (const claimants of owners.values())
    if (
      claimants.some(
        (claimant) =>
          claimant.file.sha256 !== claimants[0].file.sha256 ||
          claimant.file.baseDigest !== claimants[0].file.baseDigest,
      )
    )
      for (const claimant of claimants) fileConflicts.add(claimant.key);
  const commits = accepted.filter(
    (candidate) => !fileConflicts.has(candidate.key),
  );
  for (const key of fileConflicts)
    plan.regenerate.push({ key, reasonCode: "prepared-path-conflict" });
  if (commits.length) {
    const files = new Map();
    for (const candidate of commits)
      for (const file of candidate.result.files) files.set(file.path, file);
    plan.actions.push({
      action: "commit",
      operationKeys: commits.map((candidate) => candidate.key),
      expectedMainSha: currentMainSha,
      files: [...files.values()].sort((a, b) => a.path.localeCompare(b.path)),
    });
  }
  return plan;
}
