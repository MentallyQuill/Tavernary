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
import { publishPreparedOperation } from "./prepared-publication.mjs";
import { buildPreparedCatalogPublication } from "./publication-build.mjs";
import { commitCanonicalData } from "./canonical-data.mjs";
import { reconcilePreparedOperations } from "./prepared-reconciliation.mjs";
import { runReconcileAutomationCli } from "./reconcile-cli.mjs";
import {
  revalidateAutomationOperation,
  dispatchAutomationOperation,
} from "./inventory.mjs";

const exec = promisify(execFile);
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
  root = process.cwd(),
  env = process.env,
  gh = executeGh,
}) {
  const repository = env.GITHUB_REPOSITORY;
  assertCanonicalWriterContext(env, repository);
  return publishPreparedOperation({
    operationKey,
    runId,
    load: async () => {
      await synchronizeWriterCheckout({ root, env });
      return loadAutomationInventory({
        root,
        gh,
        repository,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
        nowMs: Date.now(),
      });
    },
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
    persist: (receipt) =>
      persistGithubAutomationReceipt({ gh, repository, receipt }),
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
    publish: (wake) =>
      runPreparedWriterPublication({
        operationKey: wake.operationKey,
        runId: wake.runId,
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
