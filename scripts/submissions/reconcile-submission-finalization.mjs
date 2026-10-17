import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { finalizeAutomationOperation } from "../automation/finalization.mjs";
import { projectAutomationLifecycle } from "../automation/lifecycle-github.mjs";
import { verifiedAutomationDeployments } from "../automation/data-digests.mjs";
import { discoverKitOperations } from "../automation/kit-operations.mjs";
import { isDirectSubmissionKind } from "../automation/submission-routing.mjs";
import { persistGithubAutomationReceipt } from "../automation/github-inventory.mjs";
import { commitCanonicalData } from "../automation/canonical-data.mjs";
import { executeGh } from "./kit-submission-reconciliation.mjs";
import { projectIssueMatchesTransaction } from "../automation/project-operations.mjs";
import { parseProjectPublicationTransaction } from "../publication/project-publication-transaction.mjs";
import { assertTrustedAutomationContext } from "../automation/github-inventory.mjs";
import { loadAutomationInventory } from "../automation/inventory.mjs";
import {
  synchronizeWriterCheckout,
  downloadPreparedArtifact,
} from "../automation/writer-runtime.mjs";
import { loadSiteWriterState } from "../automation/site-writer-runtime.mjs";
import { confirmCanonicalDeployment } from "../automation/deployment-writer.mjs";
import { loadGithubRevisionManifest } from "../automation/deployment-github.mjs";
import {
  confirmPublicDeployment,
  createPublicAssetReader,
} from "../automation/confirm-deployment.mjs";
import { validateRevisionManifest } from "../automation/revision-manifest.mjs";
import { reconcileSubmissionHandoffs } from "./reconcile-project-validations.mjs";

function ancestry(root, ancestor, descendant) {
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", ancestor, descendant], {
      cwd: root,
      stdio: "ignore",
      windowsHide: true,
      timeout: 30000,
    });
    return true;
  } catch (error) {
    return error.status === 1 ? false : null;
  }
}

export async function finalizeSubmissionTarget({
  issueNumber,
  operationKey,
  load,
  gh = executeGh,
  persist,
  isAncestor,
  commit,
}) {
  if (
    !Number.isSafeInteger(issueNumber) ||
    issueNumber < 1 ||
    (operationKey !== undefined && !/^[a-f0-9]{64}$/u.test(operationKey))
  )
    throw new Error("Submission finalization identity is invalid.");
  const scoped = async () => {
    const state = await load({ issueNumber, operationKey });
    if (state.local.revision !== state.remote.mainHeadSha)
      return { ...state, operations: [] };
    const ancestor = isAncestor ?? ((a, b) => ancestry(state.root, a, b));
    const confirmed = verifiedAutomationDeployments({
      deployments: state.local.deployments,
      activeDeployment: state.local.activeDeployment,
      nowMs: state.nowMs,
      revision: state.local.revision,
      catalogDigest: state.local.catalogDigest,
      targetDigest: state.local.targetDigest,
      isAncestor: (a, b) => ancestor(a, b) === true,
    });
    const operations = state.operations
      .filter(
        (operation) =>
          isDirectSubmissionKind(operation.identity.kind) &&
          operation.identity.subject === `issue:${issueNumber}` &&
          (!operationKey || operation.key === operationKey),
      )
      .flatMap((operation) => {
        const covered =
          operation.expectedSha &&
          confirmed.some(
            (sha) =>
              sha === operation.expectedSha ||
              ancestor(operation.expectedSha, sha) === true,
          );
        if (!covered)
          return [
            {
              ...operation,
              ...(["deployment-confirmed", "finalized"].includes(
                operation.stage,
              )
                ? { stage: "published" }
                : {}),
            },
          ];
        const issue = state.remote.issues.find(
          (issue) => issue.number === issueNumber,
        );
        if (["kit", "withdrawal"].includes(operation.identity.kind)) {
          const current = discoverKitOperations({
            issues: issue ? [issue] : [],
            kits: state.local.kits,
            projects: state.local.projects,
            sourcesById: Object.fromEntries(
              state.local.sources.map((source) => [source.id, source]),
            ),
            snapshotsBySourceId: Object.fromEntries(
              state.local.snapshots.map((snapshot) => [
                snapshot.source_id,
                snapshot,
              ]),
            ),
            blockedUsers: state.local.blockedUsers,
            trustedEditors: state.local.trustedEditors,
            runs: [],
            receipts: [],
            nowMs: state.nowMs,
            publisherActorId: state.publisherActorId,
            canonicalRevisions: state.local.canonicalKitRevisions,
            canonicalRevision: operation.expectedSha,
            confirmedRevisions: [operation.expectedSha],
          });
          if (
            !current.some(
              (value) =>
                value.key === operation.key &&
                value.stage === "deployment-confirmed",
            )
          )
            return [];
        } else {
          const pull = state.remote.pulls.find(
            (pull) => pull.merge_commit_sha === operation.expectedSha,
          );
          const transaction = parseProjectPublicationTransaction(
            pull?.body ?? "",
          );
          if (
            !issue ||
            !transaction ||
            !projectIssueMatchesTransaction({
              issue,
              transaction,
              catalog: state.local,
            })
          )
            return [];
        }
        return [operation];
      });
    return { ...state, operations };
  };
  const initial = await scoped();
  if (initial.operations.length !== 1) return { status: "superseded" };
  const operation = initial.operations[0];
  const repository = initial.repository;
  commit ??= (input) => commitCanonicalData({ ...input, gh });
  const project = (current, state) =>
    projectAutomationLifecycle({
      operation: current,
      state,
      gh,
      load: scoped,
      commit,
    });
  if (operation.stage === "finalized") {
    await project({ ...operation, stage: "deployment-confirmed" }, initial);
    return { status: "already-finalized" };
  }
  return finalizeAutomationOperation({
    operationKey: operation.key,
    load: scoped,
    project,
    persist:
      persist ??
      ((receipt) =>
        persistGithubAutomationReceipt({ gh, repository, receipt })),
  });
}

async function confirmSubmissionSite({ env, gh, runId }) {
  const root = process.cwd();
  if (!runId) {
    const bytes = await createPublicAssetReader({})("revision.json");
    const manifest = validateRevisionManifest(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    runId = Number(
      /^run-([1-9]\d*)-attempt-[1-9]\d*$/u.exec(manifest.buildId)?.[1],
    );
    if (!Number.isSafeInteger(runId) || runId < 1) return { status: "waiting" };
  }
  return confirmCanonicalDeployment({
    runId,
    load: () => loadSiteWriterState({ root, env }),
    isAncestor: (a, b) => ancestry(root, a, b),
    loadManifest: ({ runId, revision }) =>
      loadGithubRevisionManifest({
        gh,
        download: gh.download ?? downloadPreparedArtifact,
        repository: env.GITHUB_REPOSITORY,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
        runId,
        currentMainSha: revision,
        isAncestor: (a, b) => ancestry(root, a, b),
      }),
    probe: (input) => confirmPublicDeployment({ ...input, maxAttempts: 1 }),
    commit: (input) =>
      commitCanonicalData({ ...input, gh, repository: env.GITHUB_REPOSITORY }),
  });
}

export async function runSubmissionFinalizationCli(options = {}) {
  const env = options.env ?? process.env,
    gh = options.gh ?? executeGh,
    write = options.write ?? console.log;
  try {
    const event =
      options.event ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    const repository = env.GITHUB_REPOSITORY;
    assertTrustedAutomationContext(env, repository, event);
    if (
      repository !== "MentallyQuill/Tavernary" ||
      env.GITHUB_WORKFLOW_REF !==
        `${repository}/.github/workflows/reconcile-project-validations.yml@refs/heads/main` ||
      !/^[1-9]\d*$/u.test(env.TAVERNARY_PUBLISHER_BOT_ID ?? "")
    )
      throw new Error("Submission reconciliation context is invalid.");
    const integer = (value) => {
      if (value === undefined || value === "" || value === 0 || value === "0")
        return 0;
      if (
        !/^[1-9]\d*$/u.test(String(value)) ||
        !Number.isSafeInteger(Number(value))
      )
        throw new Error("Submission reconciliation input is invalid.");
      return Number(value);
    };
    const issueNumber = integer(event.inputs?.submission_issue_number),
      runId = integer(event.inputs?.site_run_id);
    const operationKey = event.inputs?.submission_operation_key || undefined;
    if (operationKey && (!issueNumber || !/^[a-f0-9]{64}$/u.test(operationKey)))
      throw new Error("Submission reconciliation operation is invalid.");
    const load =
      options.load ??
      (async ({ issueNumber, operationKey }) => {
        await synchronizeWriterCheckout({ root: process.cwd(), env });
        return loadAutomationInventory({
          root: process.cwd(),
          gh,
          repository,
          publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
          nowMs: Date.now(),
          submissionIssueNumber: issueNumber,
          finalizationOperationKey: operationKey,
          executingWriterRunId: Number(env.GITHUB_RUN_ID),
        });
      });
    let confirmation;
    try {
      confirmation = await (options.confirmSite ?? confirmSubmissionSite)({
        env,
        gh,
        runId,
      });
    } catch {
      confirmation = { status: "waiting" };
    }
    const ready = ["confirmed", "already-confirmed"].includes(
      confirmation.status,
    );
    // Failed public confirmation blocks every closure/terminal write. Intake
    // recovery remains independent and can dispatch unpublished submissions.
    const finalize = (target) =>
      ready
        ? finalizeSubmissionTarget({ ...target, load, gh })
        : Promise.resolve({ status: "waiting" });
    const result = issueNumber
      ? await finalize({ issueNumber, operationKey })
      : await reconcileSubmissionHandoffs({ repository, gh, load, finalize });
    write(JSON.stringify({ confirmation, ...result }));
    return 0;
  } catch (error) {
    write(
      JSON.stringify({
        status: "unavailable",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runSubmissionFinalizationCli();
