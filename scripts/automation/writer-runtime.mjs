import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
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
  return { prepared, controller };
}
