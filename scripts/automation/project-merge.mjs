import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  parseProjectPublicationTransaction,
  fingerprintProjectPublicationInput,
} from "../publication/project-publication-transaction.mjs";
import {
  planProjectPublication,
  isSafeProjectPublicationBaseDrift,
} from "../publication/project-publication-planner.mjs";
import { parseProjectSubmissionIssue } from "../submissions/parse-project-submission.mjs";
import { parseProjectOwnerManifestIssue } from "../help/triage-project-owner-request.mjs";
import { normalizeProjectOwnerManifest } from "../../src/features/help/project-owner-manifest.mjs";
import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "../../src/features/help/project-owner-record.mjs";
import { tagVocabularyHash } from "../catalog/tag-vocabulary.mjs";
import { verifyTrustedEditor } from "../maintenance/trusted-editor-authority.mjs";
import { validateAutomationOperation } from "./operation.mjs";
import { publishCanonicalBatch } from "./publish.mjs";

export async function loadProjectMergePlan({ state, operation, gh }) {
  validateAutomationOperation(operation);
  const deny = (reasonCode) => ({ action: "reject", reasonCode });
  if (
    !["project", "owner-request"].includes(operation.identity.kind) ||
    state.local.revision !== state.remote.mainHeadSha
  )
    return deny("project-context-invalid");
  const enabled = JSON.parse(
    await gh([
      "api",
      `repos/${state.repository}/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED`,
    ]),
  );
  if (enabled.value !== "true")
    return { action: "paused", reasonCode: "automatic-publication-disabled" };
  const issueNumber = Number(
    /^issue:([1-9]\d*)$/u.exec(operation.identity.subject)?.[1],
  );
  const producer =
    operation.identity.kind === "project"
      ? "project-submission"
      : "project-owner-request";
  const candidates = state.remote.pulls.filter(
    (pull) =>
      pull.state === "open" &&
      pull.head?.ref === `automation/${producer}-${issueNumber}`,
  );
  if (candidates.length !== 1) return deny("project-pull-custody-invalid");
  const pull = JSON.parse(
    await gh([
      "api",
      `repos/${state.repository}/pulls/${candidates[0].number}`,
    ]),
  );
  const transaction = parseProjectPublicationTransaction(pull.body ?? "");
  if (
    !transaction ||
    pull.user?.id !== state.publisherActorId ||
    pull.user.type !== "Bot" ||
    pull.base?.repo?.full_name !== state.repository ||
    pull.head?.repo?.full_name !== state.repository ||
    transaction.issue_number !== issueNumber ||
    transaction.producer !== producer ||
    transaction.policy_version !== operation.identity.policyVersion ||
    transaction.generated_head_sha !== operation.expectedSha ||
    fingerprintProjectPublicationInput({
      actor: transaction.actor,
      inputDigest: transaction.input_digest,
    }) !== operation.identity.inputDigest
  )
    return deny("project-transaction-custody-invalid");
  const issue = JSON.parse(
    await gh(["api", `repos/${state.repository}/issues/${issueNumber}`]),
  );
  const labels = (issue.labels ?? []).map((label) =>
    typeof label === "string" ? label : label.name,
  );
  if (
    issue.pull_request ||
    labels.some((label) =>
      [
        "submission-declined",
        "needs-information",
        "issue-limit-reached",
      ].includes(label),
    )
  )
    return deny("project-manual-decision");
  const actorMatches =
    issue.user?.id === transaction.actor.id &&
    issue.user?.type === transaction.actor.type &&
    issue.user?.login?.toLowerCase() === transaction.actor.login.toLowerCase();
  let repository = null;
  if (transaction.source_identity?.repository_id)
    repository = JSON.parse(
      await gh([
        "api",
        `repositories/${transaction.source_identity.repository_id}`,
      ]),
    );
  const authorityValid =
    actorMatches &&
    (transaction.authority_type === "community-submitter" ||
      (transaction.authority_type === "repository-owner" &&
        repository?.id === transaction.source_identity?.repository_id &&
        repository?.owner?.type === "User" &&
        repository.owner.id === issue.user.id) ||
      (transaction.authority_type === "tavernary-staff" &&
        verifyTrustedEditor({
          actor: issue.user,
          association: issue.author_association,
          registry: state.local.trustedEditors,
        }).authorized));
  const source =
    state.local.sources.find((source) => source.id === transaction.source_id) ??
    null;
  let parsed;
  if (producer === "project-submission")
    parsed = parseProjectSubmissionIssue(issue.body ?? "", {
      allowLegacyV3: labels.includes("issue-admitted"),
    });
  else {
    const input = parseProjectOwnerManifestIssue(issue.body ?? "");
    if (input.valid) {
      const names = [
        "frontends",
        "primary-functions",
        "tags",
        "model-families",
        "completion-formats",
      ];
      const values = await Promise.all(
        names.map((name) =>
          readFile(
            resolve(state.root, `data/vocabularies/${name}.json`),
            "utf8",
          ).then(JSON.parse),
        ),
      );
      parsed = normalizeProjectOwnerManifest(input.manifest, {
        frontends: values[0].frontends,
        primaryFunctions: values[1].primary_functions,
        tags: values[2].tags,
        tagVocabularyHash: tagVocabularyHash(values[2]),
        modelFamilies: values[3].model_families,
        completionFormats: values[4].completion_formats,
        source,
      });
    }
  }
  const validations = state.remote.runs
    .filter(
      (run) =>
        run.path === ".github/workflows/ci.yml" &&
        run.event === "workflow_dispatch" &&
        run.head_branch === pull.head.ref &&
        run.head_sha === pull.head.sha &&
        run.conclusion === "success",
    )
    .sort((a, b) => b.id - a.id);
  if (!validations.length)
    return { action: "retry", reasonCode: "ci-unavailable" };
  const run = JSON.parse(
    await gh([
      "api",
      `repos/${state.repository}/actions/runs/${validations[0].id}`,
    ]),
  );
  if (
    run.id !== validations[0].id ||
    run.name !== "Site: Validate changes" ||
    run.path !== ".github/workflows/ci.yml" ||
    run.event !== "workflow_dispatch" ||
    run.head_repository?.full_name !== state.repository ||
    run.head_branch !== pull.head.ref ||
    run.head_sha !== transaction.generated_head_sha ||
    run.status !== "completed" ||
    run.conclusion !== "success" ||
    !(
      (run.actor?.id === state.publisherActorId && run.actor.type === "Bot") ||
      (run.actor?.id === 2625904 && run.actor.type === "User")
    )
  )
    return deny("validation-run-custody-invalid");
  const pages = JSON.parse(
    await gh([
      "api",
      "--method",
      "GET",
      "--paginate",
      "--slurp",
      `repos/${state.repository}/pulls/${pull.number}/files`,
      "-f",
      "per_page=100",
    ]),
  );
  if (!Array.isArray(pages) || pages.some((page) => !Array.isArray(page)))
    return deny("project-path-inventory-invalid");
  let baseDriftSafe = state.local.revision === transaction.base_sha;
  if (!baseDriftSafe) {
    try {
      execFileSync(
        "git",
        [
          "merge-base",
          "--is-ancestor",
          transaction.base_sha,
          state.local.revision,
        ],
        { cwd: state.root, stdio: "ignore", timeout: 60_000 },
      );
      const changedPaths = execFileSync(
        "git",
        [
          "diff",
          "--name-only",
          "-z",
          transaction.base_sha,
          state.local.revision,
        ],
        { cwd: state.root, maxBuffer: 4_194_304, timeout: 60_000 },
      )
        .toString("utf8")
        .split("\0")
        .filter(Boolean);
      baseDriftSafe = isSafeProjectPublicationBaseDrift({
        transaction,
        changedPaths,
      });
    } catch {
      baseDriftSafe = false;
    }
  }
  return planProjectPublication({
    enabled: true,
    workflowRun: { ...run, name: "Site: Validate changes" },
    repository: state.repository,
    defaultBranch: "main",
    pull,
    transaction,
    issue,
    changedPaths: pages.flat().map((file) => file.filename),
    current: {
      mainSha: state.local.revision,
      baseDriftSafe,
      inputDigest: parsed?.valid
        ? fingerprintProjectPublicationInput(parsed.manifest)
        : null,
      authorityValid,
      sourceIdentityValid:
        !transaction.source_identity?.repository_id ||
        repository?.id === transaction.source_identity.repository_id,
      sourceFingerprint: source ? fingerprintSourceRecord(source) : null,
      projectFingerprints: Object.fromEntries(
        Object.keys(transaction.input_fingerprints.projects).map((id) => {
          const project = state.local.projects.find(
            (project) => project.id === id,
          );
          return [id, project ? fingerprintProjectRecord(project) : null];
        }),
      ),
    },
  });
}

export async function publishProjectOperation({
  operationKey,
  load,
  plan,
  merge,
  persist,
}) {
  if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Project operation key is invalid.");
  let inventory = await load();
  function currentProof() {
    return {
      mainSha: inventory.remote.mainHeadSha,
      operations: inventory.operations,
      receipts: inventory.receipts,
      canonicalRevisions: Object.fromEntries(
        inventory.operations
          .filter(
            (operation) =>
              ["project", "owner-request"].includes(operation.identity.kind) &&
              [
                "published",
                "deployment-requested",
                "deployment-confirmed",
                "finalized",
              ].includes(operation.stage) &&
              operation.expectedSha,
          )
          .map((operation) => [operation.key, operation.expectedSha]),
      ),
    };
  }
  const operation = inventory.operations.find(
    (operation) => operation.key === operationKey,
  );
  const publicationPlan = {
    actions: [],
    rejected: [],
    regenerate: [],
    waiting: [],
    satisfied: [],
  };
  if (!operation)
    publicationPlan.waiting.push({
      key: operationKey,
      reasonCode: "project-superseded",
    });
  else if (currentProof().canonicalRevisions[operationKey])
    publicationPlan.satisfied.push(operationKey);
  else {
    const decision = await plan({ state: inventory, operation });
    if (decision.action === "merge")
      publicationPlan.actions.push({
        ...decision,
        operationKeys: [operationKey],
        expectedMainSha: inventory.remote.mainHeadSha,
      });
    else if (decision.action === "regenerate")
      publicationPlan.regenerate.push({
        key: operationKey,
        reasonCode: decision.reasonCode,
      });
    else if (decision.action === "reject")
      publicationPlan.rejected.push({
        key: operationKey,
        reasonCode: decision.reasonCode,
      });
    else
      publicationPlan.waiting.push({
        key: operationKey,
        reasonCode: decision.reasonCode ?? "project-waiting",
      });
  }
  return publishCanonicalBatch({
    plan: publicationPlan,
    nowMs: inventory.nowMs,
    readState: async () => {
      inventory = await load();
      return currentProof();
    },
    persist,
    commit: async () => {
      throw new Error("Project operations must merge their validated PR.");
    },
    validate: async () => {
      const current = inventory.operations.find(
        (operation) => operation.key === operationKey,
      );
      if (!current)
        return { action: "regenerate", reasonCode: "project-superseded" };
      const decision = await plan({ state: inventory, operation: current });
      return decision.action === "merge"
        ? {
            action: "ready",
            publication: {
              ...decision,
              operationKeys: [operationKey],
              expectedMainSha: inventory.remote.mainHeadSha,
            },
          }
        : {
            action:
              decision.action === "regenerate"
                ? "regenerate"
                : decision.action === "reject"
                  ? "reject"
                  : "wait",
            reasonCode: decision.reasonCode ?? "project-waiting",
          };
    },
    merge: async (action) => {
      const current = inventory.operations.find(
        (operation) => operation.key === operationKey,
      );
      const decision =
        current && (await plan({ state: inventory, operation: current }));
      if (
        decision?.action !== "merge" ||
        decision.expectedHeadSha !== action.expectedHeadSha ||
        decision.pullNumber !== action.pullNumber
      )
        throw Object.assign(new Error("Project authority changed at merge."), {
          code: "input-superseded",
        });
      return merge(action);
    },
  });
}

export async function mergeExactProjectHead({ repository, gh, action }) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository ?? "") ||
    action?.action !== "merge" ||
    !Number.isSafeInteger(action.pullNumber) ||
    action.pullNumber < 1 ||
    !/^[a-f0-9]{40}$/u.test(action.expectedHeadSha ?? "")
  )
    throw new Error("Exact project merge context is invalid.");
  const response = JSON.parse(
    await gh(
      [
        "api",
        "--method",
        "PUT",
        `repos/${repository}/pulls/${action.pullNumber}/merge`,
        "--input",
        "-",
      ],
      JSON.stringify({
        merge_method: "squash",
        sha: action.expectedHeadSha,
        commit_title: `Publish project transaction PR #${action.pullNumber}`,
      }),
    ),
  );
  if (response.merged !== true || !/^[a-f0-9]{40}$/u.test(response.sha ?? ""))
    throw new Error("Exact project merge is unconfirmed.");
  return { sha: response.sha };
}
