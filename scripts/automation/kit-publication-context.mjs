import { canonicalFileDigests } from "./canonical-files.mjs";
import { discoverKitOperations } from "./kit-operations.mjs";
import {
  applyKitSubmission,
  findExistingKitForSubmission,
} from "../kits/apply-submission.mjs";
import {
  applyKitWithdrawal,
  parseKitWithdrawalIssue,
} from "../kits/apply-withdrawal.mjs";
import {
  parseKitIssueFields,
  assertKitSubmissionEligible,
} from "../submissions/triage-kit-issue.mjs";
import { validateKitSubmission } from "../submissions/validate-kit-submission.mjs";
import { effectiveListingState } from "../../src/features/catalog/listing-state.mjs";
import { fingerprintProjectPublicationInput } from "../publication/project-publication-transaction.mjs";

function kitAuthority({ state, operation }) {
  const issueNumber = Number(
    /^issue:([1-9]\d*)$/u.exec(operation.identity.subject)?.[1],
  );
  const issue = state.remote.issues.find(
    (issue) => issue.number === issueNumber,
  );
  const local = state.local;
  const fresh = discoverKitOperations({
    issues: issue ? [issue] : [],
    kits: local.kits,
    projects: local.projects,
    sourcesById: Object.fromEntries(
      local.sources.map((source) => [source.id, source]),
    ),
    snapshotsBySourceId: Object.fromEntries(
      local.snapshots.map((snapshot) => [snapshot.source_id, snapshot]),
    ),
    blockedUsers: local.blockedUsers,
    trustedEditors: local.trustedEditors,
    runs: [],
    receipts: [],
    nowMs: state.nowMs,
    publisherActorId: state.publisherActorId,
    canonicalRevision: local.revision,
  }).find((current) => current.key === operation.key);
  if (
    !fresh ||
    fresh.stage !== "validated" ||
    fresh.retry?.failure.kind === "permanent"
  )
    throw Object.assign(new Error("Kit authority or approved input changed."), {
      code: "authorization-lost",
    });
  return issue;
}
export function createPreparedKitRecord({
  state,
  operation,
  now = new Date(state.nowMs).toISOString(),
}) {
  const issue = kitAuthority({ state, operation });
  const local = state.local;
  if (operation.identity.kind === "withdrawal") {
    const parsed = parseKitWithdrawalIssue(issue.body ?? "");
    if (!parsed.valid) throw new Error("Kit withdrawal input is invalid.");
    return applyKitWithdrawal({
      kit: local.kits.find((kit) => kit.id === parsed.manifest.kit_id),
      actorId: issue.user.id,
      now,
    });
  }
  if (operation.identity.kind !== "kit")
    throw new Error("Prepared Kit kind is invalid.");
  assertKitSubmissionEligible(issue);
  const projects = local.projects.map((project) => {
    const source = local.sources.find(
      (source) => source.id === project.source_id,
    );
    const snapshot = local.snapshots.find(
      (snapshot) => snapshot.source_id === project.source_id,
    );
    return source && effectiveListingState({ project, source, snapshot }).public
      ? project
      : {
          ...project,
          listing_status: "quarantined",
          listing_status_reason: "source-unavailable",
        };
  });
  const validation = validateKitSubmission({
    ...parseKitIssueFields(issue.body ?? ""),
    actor: {
      id: issue.user.id,
      login: issue.user.login,
      association: issue.author_association,
    },
    projects,
    kits: local.kits,
    blockedUsers: local.blockedUsers,
    trustedEditors: local.trustedEditors,
    sourceIssueNumber: issue.number,
  });
  if (!validation.valid)
    throw Object.assign(new Error("Prepared Kit validation failed."), {
      code: "validation-failed",
    });
  const existingKit = findExistingKitForSubmission({
    manifest: validation.manifest,
    issueNumber: issue.number,
    kits: local.kits,
  });
  return applyKitSubmission({
    manifest: validation.manifest,
    issue,
    existingKit,
    editAuthority: validation.editAuthority,
    now,
  });
}
export async function createKitPreparedPublicationContext({
  state,
  operation,
  validators,
}) {
  const issue = kitAuthority({ state, operation });
  const expected = createPreparedKitRecord({ state, operation });
  const paths = [
    `data/registry/kits/${expected.id}.json`,
    `data/snapshots/github/kits/${expected.id}.json`,
  ];
  const fileDigests = canonicalFileDigests({
    root: state.root,
    revision: state.local.revision,
    paths,
  });
  const previousSupport = state.local.kitSnapshots.find(
    (snapshot) => snapshot.kit_id === expected.id,
  );
  const blocked = new Set(
    state.local.blockedUsers.blocked.map((user) => user.github_user_id),
  );
  function validTime(value) {
    const time = Date.parse(value ?? "");
    return Number.isFinite(time) && time <= state.nowMs + 300_000;
  }
  const validateContent = (path, value) => {
    if (
      !paths.includes(path) ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      return false;
    if (path === paths[0]) {
      if (
        !validators.kit(value) ||
        !validTime(value.updated_at) ||
        !validTime(value.published_at) ||
        (operation.identity.kind === "withdrawal" &&
          !validTime(value.withdrawn_at))
      )
        return false;
      const current = createPreparedKitRecord({
        state,
        operation,
        now:
          operation.identity.kind === "withdrawal"
            ? value.withdrawn_at
            : value.updated_at,
      });
      return (
        fingerprintProjectPublicationInput(current) ===
        fingerprintProjectPublicationInput(value)
      );
    }
    if (
      !validators.support(value) ||
      value.kit_id !== expected.id ||
      value.source_issue_number !== expected.source_issue_number ||
      !validTime(value.refreshed_at) ||
      new Set(value.supporters.map((user) => user.github_user_id)).size !==
        value.supporters.length ||
      value.supporters.some(
        (user) =>
          !validTime(user.first_reacted_at) ||
          (user.active && blocked.has(user.github_user_id)),
      )
    )
      return false;
    if (operation.identity.kind === "withdrawal")
      return (
        previousSupport != null &&
        value.stale_since === null &&
        fingerprintProjectPublicationInput(value.supporters) ===
          fingerprintProjectPublicationInput(
            previousSupport.supporters.map((user) => ({
              ...user,
              active: false,
            })),
          )
      );
    return true;
  };
  return {
    repository: state.repository,
    mainSha: state.local.revision,
    source: {
      id: expected.id,
      identity: `github-issue:${expected.source_issue_number}`,
    },
    authorId: issue.user.id,
    inputDigest: operation.identity.inputDigest,
    policyVersion: operation.identity.policyVersion,
    authorityValid: true,
    allowedPaths: paths,
    fileDigests,
    validateContent,
  };
}
