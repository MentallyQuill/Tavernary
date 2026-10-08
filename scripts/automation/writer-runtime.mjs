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
} from "./model-budget.mjs";
import { reserveModelPreparation } from "./model-preparation.mjs";
import { isReportNarrativeRetry } from "./report-operations.mjs";
import {
  dispatchReservedModelPreparation,
  dispatchUnbudgetedPreparation,
} from "./model-budget-github.mjs";
import {
  observeMetadataSource,
  metadataObservationIsCached,
} from "./metadata-preparation.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import {
  assertCanonicalWriterContext,
  persistGithubAutomationReceipt,
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
import { runReconcileAutomationCli } from "./reconcile-cli.mjs";
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
  reconcileProjectValidations,
  githubRequest,
} from "../submissions/reconcile-project-validations.mjs";

const exec = promisify(execFile);
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
export async function runModelWriterPreparation({
  operationKey,
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
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  if (
    !/^[a-f0-9]{64}$/u.test(operationKey ?? "") ||
    !/^[1-9]\d*$/u.test(env.GITHUB_RUN_ID ?? "") ||
    env.GITHUB_RUN_ATTEMPT !== "1"
  )
    throw new Error("Model writer context is invalid.");
  try {
    const initial = await load();
    const operation = initial.operations.find(
      (current) => current.key === operationKey,
    );
    const workflows = {
      metadata: ".github/workflows/enrich-catalog.yml",
      advisory: ".github/workflows/review-catalog-policy.yml",
      "report-import": ".github/workflows/import-tavernkeeper-reports.yml",
    };
    const workflow = workflows[operation?.identity.kind];
    if (!operation) return { status: "superseded" };
    if (!workflow) throw new Error("Model preparation kind is invalid.");
    if (
      operation.identity.kind === "report-import" &&
      !isReportNarrativeRetry(operation)
    )
      throw new Error("Report facts do not require model preparation.");
    if (
      operation.identity.kind === "metadata" &&
      (await metadataCached({ state: initial, operation }))
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
    const request = (model, requestCount, requestedTokens) => ({
      model,
      requestCount,
      requestedTokens,
      ...(Object.hasOwn(prices, model)
        ? { price: { model, ...prices[model] } }
        : {}),
    });
    const requests = [
      request(env.UTILITY_MODEL, 3, 180000),
      ...(env.TAVERNARY_ENRICHMENT_MODEL
        ? [request(env.TAVERNARY_ENRICHMENT_MODEL, 1, 15000)]
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
      const current = state.operations.find(
        (value) => value.key === operationKey,
      );
      return {
        mainSha: state.local.revision,
        budget: validateModelBudgetState(budget),
        eligible: Boolean(
          current &&
          current.stage === "admitted" &&
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
      requestId: `writer-${env.GITHUB_RUN_ID}`,
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
          ...(operation.identity.kind === "advisory"
            ? { projectId: operation.identity.subject.split(":")[2] }
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
      await gh([
        "workflow",
        "run",
        operation.identity.kind === "project"
          ? "generate-project-submission.yml"
          : "generate-project-owner-request.yml",
        "--repo",
        repository,
        "--ref",
        "main",
        "-f",
        `issue_number=${operation.identity.subject.slice(6)}`,
        "-f",
        "force_regeneration=false",
      ]);
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
} = {}) {
  const repository = env.GITHUB_REPOSITORY;
  const publisherActorId = Number(env.TAVERNARY_PUBLISHER_BOT_ID);
  assertCanonicalWriterContext(env, repository);
  const load = async () => {
    await synchronizeWriterCheckout({ root, env });
    return loadAutomationInventory({
      root,
      gh,
      repository,
      publisherActorId,
      nowMs: Date.now(),
    });
  };
  let state = await load();
  const prepared = await reconcilePreparedOperations({
    state,
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
  const consumed = new Set(prepared.consumedKeys);
  let controller;
  const exitCode = await runReconcileAutomationCli({
    args: ["--apply", "--limit", String(20 - consumed.size)],
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
  return { prepared, controller, retention };
}
