import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { confirmCanonicalDeployment } from "./deployment-writer.mjs";
import { finalizeAutomationOperation } from "./finalization.mjs";
import { projectAutomationLifecycle } from "./lifecycle-github.mjs";
import { loadGithubRevisionManifest } from "./deployment-github.mjs";
import { confirmPublicDeployment } from "./confirm-deployment.mjs";
import {
  createModelBudgetState,
  validateModelBudgetState,
  settlePreparedModelUsage,
} from "./model-budget.mjs";
import { reserveModelPreparation } from "./model-preparation.mjs";
import { isReportNarrativeRetry } from "./report-operations.mjs";
import { enrichmentCheckpointNeedsModel } from "./enrichment-preparation.mjs";
import {
  dispatchReservedModelPreparation,
  dispatchUnbudgetedPreparation,
  loadGenerationModelUsage,
} from "./model-budget-github.mjs";
import {
  observeMetadataSource,
  metadataObservationIsCached,
} from "./metadata-preparation.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import {
  assertCanonicalWriterContext,
  persistGithubAutomationReceipt,
  loadGenerationOwnerRequestRuns,
} from "./github-inventory.mjs";
import { loadAutomationInventory } from "./inventory.mjs";
import { createPreparedPublicationContext } from "./publication-context.mjs";
import {
  loadPreparedGithubResult,
  loadPreparedGithubArtifact,
  loadPreparedGithubDiagnostic,
} from "./prepared-github.mjs";
import { publishPreparedOperations } from "./prepared-publication.mjs";
import { buildPreparedCatalogPublication } from "./publication-build.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import { reconcilePreparedOperations } from "./prepared-reconciliation.mjs";
import { persistPreparedFailure } from "./prepared-failure.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { runReconcileAutomationCli } from "./reconcile-cli.mjs";
import { assessInventoryHealth, assessAutomationHealth } from "./health.mjs";
import { planIncidentUpdates, reconcileIncidentUpdates } from "./incidents.mjs";
import {
  revalidateAutomationOperation,
  dispatchAutomationOperation,
} from "./inventory.mjs";
import {
  loadProjectMergePlan,
  publishProjectOperation,
  mergeExactProjectHead,
} from "./project-merge.mjs";
import { createProjectReconciliationRequest } from "./project-reconciliation-request.mjs";
import {
  parseGenerationOwnerRequest,
  generationRequestOperation,
  generationRequestCompleted,
} from "./preparation-request.mjs";
import { enrichmentRequestAncestor } from "./enrichment-owner-request.mjs";
import { inspectProjectRetry } from "./project-retries.mjs";
import {
  reconcileProjectValidations,
  githubRequest,
} from "../submissions/reconcile-project-validations.mjs";

const exec = promisify(execFile);
export async function reconcileGenerationOwnerRequests({
  state,
  gh,
  prepare,
  isAncestor,
  limit = 1,
}) {
  if (!Number.isSafeInteger(limit) || limit < 0 || limit > 20)
    throw new Error("Generation request quota is invalid.");
  if (!limit) return { status: "idle", slots: 0, consumedKeys: [] };
  const requests = new Map();
  const runs = await loadGenerationOwnerRequestRuns({
    gh,
    repository: state.repository,
    issues: state.remote.issues,
    nowMs: state.nowMs,
  });
  for (const run of runs) {
    const request = parseGenerationOwnerRequest(
      run,
      state.repository,
      state.publisherActorId,
    );
    if (
      !request?.ownerAuthorized ||
      run.status !== "completed" ||
      !state.remote.issues.some(
        (issue) =>
          issue.number === request.issueNumber && issue.state === "open",
      )
    )
      continue;
    const subject = `${request.kind}:${request.issueNumber}`;
    if (!requests.has(subject) || requests.get(subject).runId < request.runId)
      requests.set(subject, request);
  }
  for (const request of [...requests.values()].sort(
    (a, b) => a.runId - b.runId,
  )) {
    const operation = generationRequestOperation(state, request);
    if (
      !operation ||
      operation.workerRunId !== null ||
      operation.retry?.failure.kind === "permanent" ||
      (operation.retry &&
        operation.nextEligibleAt &&
        Date.parse(operation.nextEligibleAt) > state.nowMs) ||
      isAncestor(request.sourceSha, state.local.revision) !== true ||
      (await generationRequestCompleted({ state, request, gh, isAncestor }))
    )
      continue;
    try {
      const outcome = await prepare({ requestRunId: request.runId });
      return {
        status: outcome.status,
        slots: 1,
        consumedKeys: [operation.key],
      };
    } catch {
      return {
        status: "unavailable",
        slots: 1,
        consumedKeys: [operation.key],
      };
    }
  }
  return { status: "idle", slots: 0, consumedKeys: [] };
}
export async function runEnrichmentOwnerWriter({
  runId,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
  commit = (input) => commitCanonicalData({ ...input, gh }),
  isAncestor,
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (!Number.isSafeInteger(runId) || runId < 1)
    throw new Error("Owner enrichment run is invalid.");
  const response = await gh([
    "api",
    `repos/${env.GITHUB_REPOSITORY}/actions/runs/${runId}`,
  ]);
  if (Buffer.byteLength(response) > 4194304)
    throw new Error("Owner enrichment run exceeds its bound.");
  const run = JSON.parse(response);
  if (run.id !== runId)
    throw new Error("Owner enrichment run identity is invalid.");
  const { admitEnrichmentOwnerRequest } =
    await import("./enrichment-owner-request.mjs");
  return admitEnrichmentOwnerRequest({
    state: await load(),
    run,
    model: env.UTILITY_MODEL,
    commit,
    isAncestor,
  });
}
export async function runPublicationWriterFinalization({
  operationKey,
  noticeOnly = false,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
  persist = (receipt) =>
    persistGithubAutomationReceipt({
      gh,
      repository: env.GITHUB_REPOSITORY,
      receipt,
    }),
  commit = (input) => commitCanonicalData({ ...input, gh }),
  project = (operation, state) =>
    projectAutomationLifecycle({ operation, state, gh, load, commit }),
}) {
  assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY);
  if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Finalization request is invalid.");
  try {
    if (noticeOnly) {
      const state = await load();
      const operation = state.operations.find(
        (value) => value.key === operationKey,
      );
      if (!operation) return { status: "superseded" };
      if (operation.identity.kind !== "advisory")
        throw new Error("Advisory notice kind is invalid.");
      if (
        operation.retry &&
        (operation.retry.failure.kind === "permanent" ||
          (operation.nextEligibleAt !== null &&
            Date.parse(operation.nextEligibleAt) > state.nowMs))
      )
        return { status: "waiting" };
      return await project(operation, state);
    }
    const result = await finalizeAutomationOperation({
      operationKey,
      load,
      project,
      persist,
    });
    if (result.status === "waiting")
      await persistPreparedFailure({
        operationKey,
        phase: "finalization",
        load,
        persist,
        error: { code: "provider-unavailable" },
      });
    return result;
  } catch (error) {
    await persistPreparedFailure({
      operationKey,
      phase: "finalization",
      load,
      persist,
      error,
    });
    throw error;
  }
}
const generationKinds = {
  ".github/workflows/generate-project-submission.yml": "project",
  ".github/workflows/generate-project-owner-request.yml": "owner-request",
};
export async function reconcileGenerationModelUsage({
  state,
  limit = 20,
  settle,
  onFailure,
}) {
  if (!Number.isInteger(limit) || limit < 0 || limit > 20)
    throw new Error("Generation settlement limit is invalid.");
  const result = { slots: 0, consumedKeys: [], failures: 0 };
  if (!state.local.modelBudget || !limit) return result;
  const budget = validateModelBudgetState(state.local.modelBudget);
  const keys = [
    ...new Set(
      budget.tickets
        .filter(
          (ticket) =>
            !ticket.settled &&
            Object.hasOwn(generationKinds, ticket.producer?.workflow ?? ""),
        )
        .sort((a, b) => b.producer.runId - a.producer.runId)
        .map((ticket) => ticket.operationKey),
    ),
  ].slice(0, Math.min(4, limit));
  for (const operationKey of keys) {
    result.slots++;
    let failure;
    try {
      const outcome = await settle({ operationKey });
      if (["settled", "recovered"].includes(outcome.status))
        result.consumedKeys.push(operationKey);
    } catch (error) {
      failure = error;
    }
    if (failure) {
      if (onFailure) await onFailure({ operationKey, error: failure });
      result.consumedKeys.push(operationKey);
      result.failures++;
    }
  }
  return result;
}
async function loadGenerationBudgetSnapshot({ env, gh }) {
  const repository = env.GITHUB_REPOSITORY;
  const reference = JSON.parse(
    await gh(["api", `repos/${repository}/git/ref/heads/main`]),
  );
  const revision = reference?.object?.sha;
  if (!/^[a-f0-9]{40}$/u.test(revision ?? ""))
    throw new Error("Generation budget revision is invalid.");
  const text = await gh([
    "api",
    `repos/${repository}/contents/data/maintenance/automation/model-budgets/global.json?ref=${revision}`,
    "--header",
    "Accept: application/vnd.github.raw+json",
  ]);
  if (typeof text !== "string" || Buffer.byteLength(text) > 8_388_608)
    throw new Error("Generation budget snapshot exceeds its bound.");
  return {
    publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
    local: {
      revision,
      modelBudget: validateModelBudgetState(JSON.parse(text)),
    },
  };
}
export async function runGenerationModelWriterSettlement({
  operationKey,
  env = process.env,
  gh = executeGh,
  load = () => loadGenerationBudgetSnapshot({ env, gh }),
  download = downloadPreparedArtifact,
  commit = (input) => commitCanonicalData({ ...input, gh }),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  const state = await load();
  if (!state.local.modelBudget) return { status: "idle" };
  const budget = validateModelBudgetState(state.local.modelBudget);
  const ticket = budget.tickets
    .filter(
      (value) =>
        value.operationKey === operationKey &&
        Object.hasOwn(generationKinds, value.producer?.workflow ?? "") &&
        !value.settled,
    )
    .sort((a, b) => b.producer.runId - a.producer.runId)[0];
  if (!ticket) return { status: "idle" };
  const operation = {
    key: operationKey,
    identity: { kind: generationKinds[ticket.producer.workflow] },
  };
  const usage = await loadGenerationModelUsage({
    gh,
    download,
    repository,
    operation,
    publisherActorId: state.publisherActorId,
    runId: ticket.producer.runId,
  });
  if (!usage) return { status: "waiting" };
  const fresh = await load();
  const updated = settlePreparedModelUsage(
    validateModelBudgetState(fresh.local.modelBudget),
    [usage],
  );
  const content = `${JSON.stringify(updated, null, 2)}\n`;
  try {
    await commit({
      repository,
      expectedMainSha: fresh.local.revision,
      message: "chore(automation): settle verified generation usage",
      files: [
        {
          path: "data/maintenance/automation/model-budgets/global.json",
          type: "file",
          content,
          bytes: Buffer.byteLength(content),
          sha256: createHash("sha256").update(content).digest("hex"),
        },
      ],
    });
    return { status: "settled" };
  } catch (error) {
    const recovered = await load();
    try {
      if (
        JSON.stringify(
          settlePreparedModelUsage(
            validateModelBudgetState(recovered.local.modelBudget),
            [usage],
          ),
        ) === JSON.stringify(recovered.local.modelBudget)
      )
        return { status: "recovered" };
    } catch {
      /* Changed or absent usage cannot prove a successful commit. */
    }
    throw error;
  }
}
export async function runModelWriterPreparation({
  operationKey,
  requestRunId = 0,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
  commit = (input) => commitCanonicalData({ ...input, gh }),
  dispatch = (input) => dispatchReservedModelPreparation({ ...input, gh }),
  dispatchCached = (input) => dispatchUnbudgetedPreparation({ ...input, gh }),
  persistFailure = async (error) => {
    await persistPreparedFailure({
      operationKey,
      load,
      error,
      persist: (receipt) =>
        persistGithubAutomationReceipt({
          gh,
          repository: env.GITHUB_REPOSITORY,
          receipt,
        }),
    });
  },
  metadataCached = async (input) =>
    metadataObservationIsCached({
      ...input,
      observation: await observeMetadataSource(input),
    }),
  enrichmentCached = async (input) =>
    !(await enrichmentCheckpointNeedsModel({
      ...input,
      model: env.UTILITY_MODEL,
    })),
  projectGenerationEligible = async ({ state, operation }) => {
    if (operation.identity.kind === "project") {
      const issue = state.remote.issues.find(
        (value) => value.number === Number(operation.identity.subject.slice(6)),
      );
      if (!issue) return false;
      const retry = await inspectProjectRetry({ state, issue, gh });
      if (retry.notBefore && Date.parse(retry.notBefore) > state.nowMs)
        return false;
    }
    return (
      operation.stage === "admitted" ||
      (["generated", "validated"].includes(operation.stage) &&
        (await loadProjectMergePlan({ state, operation, gh })).action ===
          "regenerate")
    );
  },
  isRequestAncestor = (ancestor, descendant) =>
    enrichmentRequestAncestor(root, ancestor, descendant),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (
    (!requestRunId && !/^[a-f0-9]{64}$/u.test(operationKey ?? "")) ||
    !Number.isSafeInteger(requestRunId) ||
    requestRunId < 0 ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "") ||
    env.GITHUB_RUN_ATTEMPT !== "1"
  )
    throw new Error("Model writer context is invalid.");
  try {
    const initial = await load();
    const request = requestRunId
      ? parseGenerationOwnerRequest(
          JSON.parse(
            await gh([
              "api",
              `repos/${repository}/actions/runs/${requestRunId}`,
            ]),
          ),
          repository,
          initial.publisherActorId,
        )
      : null;
    if (
      requestRunId &&
      (!request ||
        request.runId !== requestRunId ||
        isRequestAncestor(request.sourceSha, initial.local.revision) !== true)
    )
      throw Object.assign(
        new Error("Generation request authority is unavailable."),
        { code: "authorization-lost" },
      );
    if (
      request &&
      (await generationRequestCompleted({
        state: initial,
        request,
        gh,
        isAncestor: isRequestAncestor,
      }))
    )
      return { status: "already-requested", runId: request.runId };
    const operation = request
      ? generationRequestOperation(initial, request)
      : initial.operations.find((current) => current.key === operationKey);
    if (request && operationKey && operation?.key !== operationKey)
      return { status: "superseded" };
    if (operation) operationKey = operation.key;
    const workflows = {
      project: ".github/workflows/generate-project-submission.yml",
      "owner-request": ".github/workflows/generate-project-owner-request.yml",
      metadata: ".github/workflows/enrich-catalog.yml",
      enrichment: ".github/workflows/enrich-catalog.yml",
      advisory: ".github/workflows/review-catalog-policy.yml",
      "report-import": ".github/workflows/import-tavernkeeper-reports.yml",
    };
    const workflow = workflows[operation?.identity.kind];
    if (!operation) return { status: "superseded" };
    if (!workflow) throw new Error("Model preparation kind is invalid.");
    if (operation.workerRunId !== null) return { status: "superseded" };
    if (
      operation.identity.kind === "report-import" &&
      !isReportNarrativeRetry(operation)
    )
      throw new Error("Report facts do not require model preparation.");
    if (
      (operation.identity.kind === "metadata" &&
        (await metadataCached({ state: initial, operation }))) ||
      (operation.identity.kind === "enrichment" &&
        (await enrichmentCached({ state: initial, operation })))
    ) {
      const fresh = await load();
      const current = fresh.operations.find(
        (value) => value.key === operationKey,
      );
      if (
        !current ||
        current.stage !== "admitted" ||
        current.retry?.failure.kind === "permanent" ||
        (current.retry &&
          current.nextEligibleAt &&
          Date.parse(current.nextEligibleAt) > fresh.nowMs)
      )
        return { status: "superseded" };
      const run = await dispatchCached({
        repository,
        publisherActorId: fresh.publisherActorId,
        operationKey,
        workflow,
        sourceSha: fresh.local.revision,
        nowMs: fresh.nowMs,
      });
      return { status: "cache-dispatched", runId: run.runId };
    }
    let prices;
    try {
      prices = env.TAVERNARY_MODEL_PRICES
        ? JSON.parse(env.TAVERNARY_MODEL_PRICES)
        : {};
    } catch {
      throw Object.assign(new Error("Model prices are invalid."), {
        code: "provider-configuration-invalid",
      });
    }
    if (!prices || typeof prices !== "object" || Array.isArray(prices))
      throw Object.assign(new Error("Model prices are invalid."), {
        code: "provider-configuration-invalid",
      });
    const monthlyUsd = env.TAVERNARY_MODEL_MONTHLY_USD
      ? Number(env.TAVERNARY_MODEL_MONTHLY_USD)
      : undefined;
    const modelRequest = (model, requestCount, requestedTokens) => ({
      model,
      requestCount,
      requestedTokens,
      ...(Object.hasOwn(prices, model)
        ? { price: { model, ...prices[model] } }
        : {}),
    });
    const requests = [
      modelRequest(env.UTILITY_MODEL, 3, 180000),
      ...(env.TAVERNARY_ENRICHMENT_MODEL
        ? [modelRequest(env.TAVERNARY_ENRICHMENT_MODEL, 1, 15000)]
        : []),
    ];
    const path = "data/maintenance/automation/model-budgets/global.json";
    const budgetState = async (state) => {
      let budget = state.local.modelBudget;
      if (!budget) {
        try {
          budget = JSON.parse(await readFile(resolve(root, path), "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
          budget = createModelBudgetState(0);
        }
      }
      const current = request
        ? generationRequestOperation(state, request)
        : state.operations.find((value) => value.key === operationKey);
      return {
        mainSha: state.local.revision,
        budget: validateModelBudgetState(budget),
        eligible: Boolean(
          current &&
          (["project", "owner-request"].includes(current.identity.kind)
            ? await projectGenerationEligible({ state, operation: current })
            : current.stage === "admitted") &&
          current.retry?.failure.kind !== "permanent" &&
          (!current.retry ||
            !current.nextEligibleAt ||
            Date.parse(current.nextEligibleAt) <= state.nowMs),
        ),
      };
    };
    const outcome = await reserveModelPreparation({
      operationKey,
      workflow,
      requestId: request
        ? `generation-request-${request.runId}`
        : `writer-${env.GITHUB_RUN_ID}`,
      requests,
      monthlyUsd,
      nowMs: initial.nowMs,
      load: async () => budgetState(await load()),
      persist: async ({ mainSha, budget }) => {
        const content = `${JSON.stringify(budget, null, 2)}\n`;
        return commit({
          repository,
          expectedMainSha: mainSha,
          message: "chore(automation): reserve verified model allowance",
          files: [
            {
              path,
              type: "file",
              content,
              bytes: Buffer.byteLength(content),
              sha256: createHash("sha256").update(content).digest("hex"),
            },
          ],
        });
      },
      dispatch: (input) =>
        dispatch({
          ...input,
          repository,
          publisherActorId: initial.publisherActorId,
          operationKey,
          workflow,
          nowMs: initial.nowMs,
          ...(request
            ? {
                requestRunId: request.runId,
                forceRegeneration: request.forceRegeneration,
              }
            : {}),
          ...(operation.identity.kind === "advisory"
            ? { projectId: operation.identity.subject.split(":")[2] }
            : {}),
          ...(["project", "owner-request"].includes(operation.identity.kind)
            ? { issueNumber: Number(operation.identity.subject.slice(6)) }
            : {}),
          ...(operation.identity.kind === "owner-request"
            ? {
                checkpointRunIds: [
                  ...new Set(
                    (initial.local.modelBudget?.tickets ?? [])
                      .filter(
                        (ticket) =>
                          ticket.operationKey === operationKey &&
                          ticket.producer?.workflow === workflow,
                      )
                      .map((ticket) => ticket.producer.runId),
                  ),
                ]
                  .sort((a, b) => b - a)
                  .slice(0, 10),
              }
            : {}),
        }),
    });
    if (outcome.status === "waiting")
      await persistFailure(
        Object.assign(
          new Error("Model preparation allowance is unavailable."),
          { code: "budget-exhausted" },
        ),
      );
    return outcome;
  } catch (error) {
    await persistFailure(error);
    throw error;
  }
}
function writerInventoryLoader({ root, env, gh }) {
  return async () => {
    await synchronizeWriterCheckout({ root, env });
    return loadAutomationInventory({
      root,
      gh,
      repository: env.GITHUB_REPOSITORY,
      publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
      nowMs: Date.now(),
    });
  };
}

export async function runDeploymentWriterConfirmation({
  operationKey,
  runId = 0,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
  download = downloadPreparedArtifact,
  probe = (input) => confirmPublicDeployment(input),
  commit = (input) => commitCanonicalData({ ...input, gh }),
  isAncestor = (ancestor, descendant) => {
    try {
      execFileSync(
        "git",
        ["merge-base", "--is-ancestor", ancestor, descendant],
        { cwd: root, stdio: "ignore", timeout: 30000, windowsHide: true },
      );
      return true;
    } catch (error) {
      return error.status === 1 ? false : null;
    }
  },
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (
    (operationKey && !/^[a-f0-9]{64}$/u.test(operationKey)) ||
    !Number.isSafeInteger(runId) ||
    runId < 0
  )
    throw new Error("Deployment confirmation request is invalid.");
  try {
    const initial = await load();
    const operation = operationKey
      ? initial.operations.find((value) => value.key === operationKey)
      : null;
    if (operationKey && !operation) return { status: "superseded" };
    if (runId === 0) {
      if (!/^[a-f0-9]{40}$/u.test(operation?.expectedSha ?? ""))
        throw new Error("Confirmation has no trusted published revision.");
      const candidates = initial.remote.runs
        .filter((run) => {
          const sourceSha = String(run.display_title ?? "").match(
            /^Site: Deploy ([a-f0-9]{40})$/u,
          )?.[1];
          return (
            run.path === ".github/workflows/deploy-pages.yml" &&
            run.status === "completed" &&
            sourceSha &&
            (operation.expectedSha === sourceSha ||
              isAncestor(operation.expectedSha, sourceSha) === true) &&
            (sourceSha === initial.local.revision ||
              isAncestor(sourceSha, initial.local.revision) === true)
          );
        })
        .sort(
          (a, b) =>
            Date.parse(b.created_at) - Date.parse(a.created_at) || b.id - a.id,
        );
      runId = candidates[0]?.id ?? 0;
      if (runId === 0)
        throw Object.assign(
          new Error("Validated deployment metadata is not available yet."),
          { code: "provider-unavailable" },
        );
    }
    let first = true;
    const project = (state) => {
      if (!Array.isArray(state.local.deployments))
        throw new Error("Deployment proof inventory is invalid.");
      return {
        revision: state.local.revision,
        nowMs: state.nowMs,
        deployments: state.local.deployments,
        activeDeployment:
          state.local.activeDeployment ??
          state.local.deployments.find(
            (record) => record.mode && record.deployment,
          ) ??
          null,
      };
    };
    const result = await confirmCanonicalDeployment({
      runId,
      isAncestor,
      load: async () => {
        if (first) {
          first = false;
          return project(initial);
        }
        return project(await load());
      },
      loadManifest: async ({ runId, revision }) => {
        const data = await loadGithubRevisionManifest({
          gh,
          download,
          repository,
          publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
          runId,
          currentMainSha: revision,
          isAncestor,
        });
        if (
          operation &&
          operation.expectedSha !== data.manifest.sourceSha &&
          isAncestor(operation.expectedSha, data.manifest.sourceSha) !== true
        )
          throw Object.assign(
            new Error("Deployment no longer covers the published operation."),
            { code: "input-superseded" },
          );
        return data;
      },
      probe,
      commit: (input) => commit({ ...input, repository }),
    });
    if (result.status === "waiting" || result.status === "incident")
      throw Object.assign(new Error("Public deployment remains unconfirmed."), {
        code:
          result.status === "waiting"
            ? "provider-unavailable"
            : "validation-failed",
      });
    if (env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED === "true") {
      try {
        const fresh = await load();
        const { recoverSiteBundleRetention } =
          await import("./site-writer-runtime.mjs");
        const retention = await recoverSiteBundleRetention({
          gh,
          env,
          isAncestor,
          state: {
            revision: fresh.local.revision,
            nowMs: fresh.nowMs,
            activeDeployment: fresh.local.activeDeployment ?? null,
          },
        });
        return { ...result, retention };
      } catch {
        return { ...result, retention: { status: "unavailable" } };
      }
    }
    return result;
  } catch (error) {
    if (operationKey)
      await persistPreparedFailure({
        operationKey,
        load,
        error,
        persist: (receipt) =>
          persistGithubAutomationReceipt({ gh, repository, receipt }),
      });
    throw error;
  }
}

export async function runProjectWriterPublication({
  operationKey,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  const result = await publishProjectOperation({
    operationKey,
    load,
    plan: (input) => loadProjectMergePlan({ ...input, gh }),
    merge: (action) => mergeExactProjectHead({ repository, gh, action }),
    persist: (receipt) =>
      persistGithubAutomationReceipt({ gh, repository, receipt }),
  });
  if (result.regenerated) {
    const state = await load();
    const operation = state.operations.find(
      (operation) => operation.key === operationKey,
    );
    if (
      operation &&
      (await loadProjectMergePlan({ state, operation, gh })).action ===
        "regenerate"
    )
      await runModelWriterPreparation({ operationKey, root, env, gh, load });
  }
  return result;
}

export async function runProjectWriterReconciliation({
  operationKey,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = writerInventoryLoader({ root, env, gh }),
  request = (path, options) => githubRequest(path, options, env.GITHUB_TOKEN),
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (!env.GITHUB_TOKEN || !/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
    throw new Error("Project reconciliation credentials or key are invalid.");
  const state = await load();
  const operation = state.operations.find(
    (operation) => operation.key === operationKey,
  );
  if (!operation || operation.retry?.failure.kind === "permanent")
    return { status: "superseded" };
  if (!["project", "owner-request"].includes(operation.identity.kind))
    throw new Error("Project reconciliation kind is invalid.");
  if (
    [
      "validated",
      "published",
      "deployment-requested",
      "deployment-confirmed",
      "finalized",
    ].includes(operation.stage)
  )
    return runProjectWriterPublication({ operationKey, root, env, gh, load });
  const producer =
    operation.identity.kind === "project"
      ? "project-submission"
      : "project-owner-request";
  const pulls = state.remote.pulls.filter(
    (pull) =>
      pull.state === "open" &&
      pull.head?.ref ===
        `automation/${producer}-${operation.identity.subject.slice(6)}` &&
      pull.head.sha === operation.expectedSha &&
      pull.user?.id === state.publisherActorId &&
      pull.user.type === "Bot",
  );
  if (pulls.length !== 1) return { status: "superseded" };
  const bridge = createProjectReconciliationRequest({
    repository,
    request,
    gh,
    publish: () =>
      runProjectWriterPublication({ operationKey, root, env, gh, load }),
    issueNumber: Number(operation.identity.subject.slice(6)),
    generationWorkflow:
      operation.identity.kind === "project"
        ? "generate-project-submission.yml"
        : "generate-project-owner-request.yml",
    prepareGeneration: () =>
      runModelWriterPreparation({ operationKey, root, env, gh, load }),
  });
  const summary = await reconcileProjectValidations({
    repository,
    selectedPullNumber: pulls[0].number,
    publisherActorId: state.publisherActorId,
    nowMs: state.nowMs,
    request: bridge,
    loadAutomaticPublicationEnabled: async () =>
      JSON.parse(
        await gh([
          "api",
          `repos/${repository}/actions/variables/PROJECT_AUTO_PUBLICATION_ENABLED`,
        ]),
      ).value === "true",
  });
  if (summary.results.some((result) => result.action === "error"))
    throw new Error("Project reconciliation is unavailable.");
  return {
    scannedPulls: summary.scannedPulls,
    results: summary.results.map(({ pullNumber, action, outcome }) => ({
      pullNumber,
      action,
      outcome,
    })),
  };
}
async function command(executable, args, options) {
  return (await exec(executable, args, { windowsHide: true, ...options }))
    .stdout;
}
export async function synchronizeWriterCheckout({
  root,
  env = process.env,
  run = command,
}) {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(env.GITHUB_REPOSITORY ?? "") ||
    !env.GH_TOKEN
  )
    throw new Error("Writer credentials or repository are unavailable.");
  const commandEnv = {
    ...process.env,
    ...env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "credential.helper",
    GIT_CONFIG_VALUE_0: "",
  };
  if (
    (
      await run("git", ["status", "--porcelain", "--untracked-files=no"], {
        cwd: root,
        encoding: "utf8",
        env: commandEnv,
        timeout: 60_000,
      })
    ).trim()
  )
    throw new Error("Writer checkout contains unpublished tracked changes.");
  const askpass = resolve(
    env.RUNNER_TEMP ?? root,
    `automation-writer-askpass-${randomUUID()}.sh`,
  );
  await writeFile(
    askpass,
    "#!/bin/sh\ncase \"$1\" in *Username*) printf '%s\\n' 'x-access-token' ;; *) printf '%s\\n' \"$GH_TOKEN\" ;; esac\n",
    { mode: 0o700, flag: "wx" },
  );
  try {
    const options = {
      cwd: root,
      encoding: "utf8",
      env: { ...commandEnv, GIT_ASKPASS: askpass },
      timeout: 120_000,
    };
    await run(
      "git",
      [
        "fetch",
        "--no-tags",
        `https://github.com/${env.GITHUB_REPOSITORY}.git`,
        "main",
      ],
      options,
    );
    const changedTrustedCode = await run(
      "git",
      [
        "diff",
        "--name-only",
        "--no-renames",
        "HEAD",
        "FETCH_HEAD",
        "--",
        "scripts",
        "src",
        ".github",
        "package.json",
        "package-lock.json",
        "next.config.ts",
        "tsconfig.json",
        "data/schemas",
        "data/vocabularies",
        "data/moderation",
        "data/maintenance/trusted-tavernary-editors.json",
      ],
      options,
    );
    if (changedTrustedCode.trim())
      throw Object.assign(
        new Error(
          "Trusted writer code or policy advanced; a fresh process is required.",
        ),
        { code: "input-superseded" },
      );
    await run("git", ["checkout", "--detach", "FETCH_HEAD"], options);
  } finally {
    await rm(askpass, { force: true });
  }
}
export async function downloadPreparedArtifact(args, { run = command } = {}) {
  if (
    args.length !== 2 ||
    args[0] !== "api" ||
    !/^repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/actions\/artifacts\/[1-9]\d*\/zip$/u.test(
      args[1],
    )
  )
    throw new Error("Prepared artifact API is invalid.");
  const archive = await run("gh", args, {
    encoding: "buffer",
    maxBuffer: 33_554_432,
    timeout: 120_000,
  });
  if (
    !(Buffer.isBuffer(archive) || archive instanceof Uint8Array) ||
    archive.byteLength > 33_554_432
  )
    throw new Error("Prepared artifact download exceeds its limit.");
  return new Uint8Array(archive);
}
export async function runPreparedWriterPublication({
  operationKey,
  runId,
  ...input
}) {
  return runPreparedWriterBatch({ ...input, wakes: [{ operationKey, runId }] });
}
export async function runPreparedWriterBatch({
  wakes,
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  const load = writerInventoryLoader({ root, env, gh });
  const persist = (receipt) =>
    persistGithubAutomationReceipt({ gh, repository, receipt });
  const onFailure = (input) =>
    persistPreparedFailure({ ...input, load, persist }).then(() => {});
  return publishPreparedOperations({
    wakes,
    load,
    onFailure,
    context: (state, operation) =>
      createPreparedPublicationContext({ state, operation }),
    loadResult: async ({ operation, currentState, runId }) => {
      const result = await loadPreparedGithubResult({
        gh,
        download: downloadPreparedArtifact,
        repository,
        runId,
        operation,
        currentState,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
      });
      const run = JSON.parse(
        await gh(["api", `repos/${repository}/actions/runs/${runId}`]),
      );
      return { result, run };
    },
    build: (action, state) =>
      buildPreparedCatalogPublication({ action, state }),
    commit: (action) =>
      commitCanonicalData({
        gh,
        repository,
        expectedMainSha: action.expectedMainSha,
        files: action.files,
        message: "chore(automation): publish validated canonical data",
      }),
    persist,
  }).catch(async (error) => {
    for (const wake of wakes)
      await onFailure({ operationKey: wake.operationKey, error });
    throw error;
  });
}
export async function runAutomationWriterReconciliation({
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
  load = async () => {
    await synchronizeWriterCheckout({ root, env });
    return loadAutomationInventory({
      root,
      gh,
      repository: env.GITHUB_REPOSITORY,
      publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
      nowMs: Date.now(),
    });
  },
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID);
  assertCanonicalWriterContext(env, repository);
  let state = await load();
  let enrichment = { status: "idle" },
    enrichmentSlot = 0;
  try {
    const { loadLatestEnrichmentOwnerRequest } =
      await import("./enrichment-owner-request.mjs");
    const request = await loadLatestEnrichmentOwnerRequest({ gh, repository });
    const admittedId = Number(
      /^owner-enrichment-([1-9]\d*)$/u.exec(
        state.local.enrichmentCanary?.run_id ?? "",
      )?.[1] ?? 0,
    );
    if (request && request.id > admittedId) {
      enrichment = await runEnrichmentOwnerWriter({
        runId: request.id,
        root,
        env,
        gh,
        load,
      });
      if (enrichment.status === "admitted") {
        enrichmentSlot = 1;
        state = await load();
      }
    }
  } catch (error) {
    enrichment = {
      status: "unavailable",
      failure: classifyAutomationFailure({ diagnosticCode: error?.code }),
    };
  }
  const generation = await reconcileGenerationModelUsage({
    state,
    limit: 20 - enrichmentSlot,
    settle: ({ operationKey }) =>
      runGenerationModelWriterSettlement({ operationKey, env, gh }),
    onFailure: (input) =>
      persistPreparedFailure({
        ...input,
        load,
        persist: (receipt) =>
          persistGithubAutomationReceipt({ gh, repository, receipt }),
      }),
  });
  if (generation.consumedKeys.length) state = await load();
  let generationRequests = { status: "idle", slots: 0, consumedKeys: [] };
  try {
    generationRequests = await reconcileGenerationOwnerRequests({
      state,
      gh,
      limit: 20 - enrichmentSlot - generation.slots,
      isAncestor: (a, b) => enrichmentRequestAncestor(root, a, b),
      prepare: ({ requestRunId }) =>
        runModelWriterPreparation({ requestRunId, root, env, gh, load }),
    });
    if (generationRequests.consumedKeys.length) state = await load();
  } catch {
    generationRequests = { status: "unavailable", slots: 0, consumedKeys: [] };
  }
  const prepared = await reconcilePreparedOperations({
    state: {
      ...state,
      operations: state.operations.filter(
        (operation) =>
          !generation.consumedKeys.includes(operation.key) &&
          !generationRequests.consumedKeys.includes(operation.key),
      ),
    },
    limit: 20 - enrichmentSlot - generation.slots - generationRequests.slots,
    readDiagnostic: (wake) =>
      loadPreparedGithubDiagnostic({
        gh,
        download: downloadPreparedArtifact,
        repository,
        runId: wake.runId,
        publisherActorId,
        operation: state.operations.find(
          (operation) => operation.key === wake.operationKey,
        ),
      }),
    onFailure: (input) =>
      persistPreparedFailure({
        ...input,
        load,
        persist: (receipt) =>
          persistGithubAutomationReceipt({ gh, repository, receipt }),
      }).then(() => {}),
    hasResult: async (wake) =>
      Boolean(
        await loadPreparedGithubArtifact({
          gh,
          repository,
          runId: wake.runId,
          operation: state.operations.find(
            (operation) => operation.key === wake.operationKey,
          ),
          publisherActorId,
          allowMissing: true,
        }),
      ),
    publish: (wakes) =>
      runPreparedWriterBatch({
        wakes,
        root,
        env,
        gh,
      }),
  });
  if (prepared.consumedKeys.length) state = await load();
  const consumed = new Set([
    ...prepared.consumedKeys,
    ...generation.consumedKeys,
    ...generationRequests.consumedKeys,
  ]);
  const usedSlots =
    prepared.consumedKeys.length + generation.slots + generationRequests.slots;
  let runtime = { status: "disabled" },
    runtimeSlot = 0;
  if (
    state.local.runtimePolicy !== undefined &&
    usedSlots + enrichmentSlot < 20
  ) {
    try {
      const { runRuntimeWriter } = await import("./runtime-maintenance.mjs");
      runtime = await runRuntimeWriter({ root, env, gh, availableSlots: 1 });
      if (["proposed", "updated", "merged"].includes(runtime.status)) {
        runtimeSlot = 1;
        state = await load();
      }
    } catch {
      runtime = { status: "unavailable", reason: "runtime-schedule-invalid" };
      runtimeSlot = 1;
    }
  }
  const { selectDependencyPullNumbers } =
    await import("./dependency-update.mjs");
  const dependencyPullNumbers = selectDependencyPullNumbers(state.remote.pulls);
  const dependencySlot =
    usedSlots + runtimeSlot + enrichmentSlot < 20 &&
    dependencyPullNumbers.length
      ? 1
      : 0;
  const healthInput = (state) => ({
    findings: [
      ...assessInventoryHealth(state),
      ...assessAutomationHealth({
        nowMs: state.nowMs,
        runtime:
          runtime.status === "disabled"
            ? undefined
            : {
                reason:
                  runtime.decision?.action === "incident"
                    ? runtime.decision.reason
                    : runtime.reason === "runtime-verification-failed" ||
                        runtime.status === "unavailable"
                      ? runtime.reason
                      : runtime.decision?.reason,
              },
      }),
    ],
    existingIssues: state.remote.issues,
    publisherActorId: state.publisherActorId,
  });
  let health = { status: "idle" },
    initialHealth,
    healthSlot = 0;
  try {
    initialHealth = healthInput(state);
    const proposals = planIncidentUpdates(initialHealth);
    healthSlot =
      usedSlots + runtimeSlot + dependencySlot + enrichmentSlot < 20 &&
      proposals.length
        ? 1
        : 0;
    if (proposals.length && !healthSlot)
      health = { status: "waiting", reason: "operation-limit" };
  } catch {
    health = { status: "unavailable" };
  }
  let controller;
  const exitCode = await runReconcileAutomationCli({
    args: [
      "--apply",
      "--limit",
      String(
        20 -
          usedSlots -
          runtimeSlot -
          dependencySlot -
          healthSlot -
          enrichmentSlot,
      ),
    ],
    env,
    event: {},
    gh,
    nowMs: state.nowMs,
    receipts: state.receipts,
    inventory: async () =>
      state.operations.filter((operation) => !consumed.has(operation.key)),
    revalidate: (operation) =>
      revalidateAutomationOperation({
        state,
        operation,
        gh,
        repository,
        nowMs: Date.now(),
        env,
      }),
    dispatch: (operation) =>
      dispatchAutomationOperation({ operation, gh, repository, env }),
    write: (value) => {
      controller = JSON.parse(value);
    },
  });
  if (exitCode) throw new Error("Canonical reconciliation is unavailable.");
  let retention = { status: "disabled" };
  if (env.TAVERNARY_IMMUTABLE_RELEASES_ENABLED === "true") {
    try {
      const { recoverSiteBundleRetention } =
        await import("./site-writer-runtime.mjs");
      retention = await recoverSiteBundleRetention({
        gh,
        env,
        state: {
          revision: state.local.revision,
          nowMs: state.nowMs,
          activeDeployment: state.local.activeDeployment ?? null,
        },
        isAncestor: (a, b) => {
          try {
            execFileSync("git", ["merge-base", "--is-ancestor", a, b], {
              cwd: root,
              stdio: "ignore",
              timeout: 30000,
              windowsHide: true,
            });
            return true;
          } catch (error) {
            return error.status === 1 ? false : null;
          }
        },
      });
    } catch {
      retention = { status: "unavailable" };
    }
  }
  if (healthSlot) {
    let useInitial = true;
    try {
      health = await reconcileIncidentUpdates({
        env,
        gh,
        availableSlots: healthSlot,
        load: async () => {
          if (useInitial) {
            useInitial = false;
            return initialHealth;
          }
          return healthInput(await load());
        },
      });
    } catch {
      health = { status: "unavailable" };
    }
  }
  let dependencies = { status: "idle" };
  if (dependencySlot) {
    try {
      const { runDependencyWriter } = await import("./dependency-update.mjs");
      dependencies = await runDependencyWriter({
        root,
        env,
        gh,
        availableSlots: dependencySlot,
        pullNumbers: dependencyPullNumbers,
      });
    } catch {
      dependencies = { status: "unavailable" };
    }
  }
  return {
    prepared,
    controller,
    retention,
    dependencies,
    runtime,
    health,
    enrichment,
    generation,
    generationRequests,
  };
}
