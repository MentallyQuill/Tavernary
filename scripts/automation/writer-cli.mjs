import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { classifyAutomationFailure } from "./failure.mjs";

import {
  loadGithubBackoff,
  persistGithubBackoff,
  runGithubWriterPass,
} from "./github-backoff.mjs";

const modes = new Set([
  "enrichment-request",
  "reconcile",
  "reconcile-project",
  "publish",
  "prepare",
  "confirm",
  "confirm-restore",
  "retain",
  "finalize",
  "advisory-notice",
  "backfill-identities",
  "verify-publisher",
]);
async function runWriterMode(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? console.log;
  const gh = options.gh;
  try {
    const repository = env.GITHUB_REPOSITORY;
    const event =
      options.event ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    assertCanonicalWriterContext(env, repository, event);
    const mode = event.inputs?.mode ?? "reconcile";
    if (!modes.has(mode)) throw new Error("Writer mode is invalid.");
    const handler = options.handlers?.[mode];
    if (handler) {
      write(JSON.stringify(await handler(event.inputs ?? {}, gh)));
      return 0;
    }
    if (mode === "reconcile") {
      const { runAutomationWriterReconciliation } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(await runAutomationWriterReconciliation({ env, gh })),
      );
      return 0;
    }
    if (mode === "enrichment-request") {
      const { runEnrichmentOwnerWriter } = await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runEnrichmentOwnerWriter({
            runId: Number(event.inputs?.result_run_id),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "backfill-identities") {
      const { runRepositoryIdentityWriter } =
        await import("./maintenance-writer.mjs");
      write(
        JSON.stringify(
          await runRepositoryIdentityWriter({
            sourceIds: event.inputs?.source_ids ?? "",
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "verify-publisher") {
      const { runPublisherWriterVerification } =
        await import("./maintenance-writer.mjs");
      write(
        JSON.stringify(
          await runPublisherWriterVerification({
            runId: Number(event.inputs?.result_run_id),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "publish") {
      const { runPreparedWriterPublication } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runPreparedWriterPublication({
            operationKey: event.inputs?.operation_key,
            runId: Number(event.inputs?.result_run_id),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "reconcile-project") {
      const { runProjectWriterReconciliation } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runProjectWriterReconciliation({
            operationKey: event.inputs?.operation_key,
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "confirm") {
      const { runDeploymentWriterConfirmation } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runDeploymentWriterConfirmation({
            operationKey: event.inputs?.operation_key || undefined,
            runId: Number(event.inputs?.result_run_id || 0),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "prepare") {
      const { runModelWriterPreparation } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runModelWriterPreparation({
            operationKey: event.inputs?.operation_key,
            requestRunId: Number(event.inputs?.result_run_id || 0),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "finalize" || mode === "advisory-notice") {
      const { runPublicationWriterFinalization } =
        await import("./writer-runtime.mjs");
      write(
        JSON.stringify(
          await runPublicationWriterFinalization({
            operationKey: event.inputs?.operation_key,
            noticeOnly: mode === "advisory-notice",
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    if (mode === "retain" || mode === "confirm-restore") {
      const { runSiteWriterRetention, runSiteWriterRestoreConfirmation } =
        await import("./site-writer-runtime.mjs");
      const handler =
        mode === "retain"
          ? runSiteWriterRetention
          : runSiteWriterRestoreConfirmation;
      write(
        JSON.stringify(
          await handler({
            runId: Number(event.inputs?.result_run_id),
            env,
            gh,
          }),
        ),
      );
      return 0;
    }
    throw new Error("Writer mode is not implemented.");
  } catch (error) {
    const httpStatus = githubFailureStatus(error);
    const message = String(error?.message ?? "");
    const diagnostic =
      Number.isSafeInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599
        ? {
            httpStatus,
            githubRateLimited:
              /(?:API rate limit exceeded|secondary rate limit)/iu.test(
                message,
              ),
            githubRequestPath:
              /\bgh api(?: --method [A-Z]+)? (repos\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_./-]{1,256})/u.exec(
                message,
              )?.[1],
          }
        : undefined;
    write(
      JSON.stringify({
        status: "unavailable",
        failure: classifyAutomationFailure({
          diagnosticCode: error?.code,
          httpStatus,
        }),
        ...(diagnostic ? { diagnostic } : {}),
      }),
    );
    return 1;
  }
}
export async function runAutomationWriterCli(options = {}) {
  if (
    options.handlers &&
    !options.loadCooldown &&
    !options.run &&
    !options.root &&
    !options.gh
  )
    return runWriterMode(options);
  const env = options.env ?? process.env;
  const write = options.write ?? console.log;
  try {
    const event =
      options.event ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    assertCanonicalWriterContext(env, env.GITHUB_REPOSITORY, event);
    const root = options.root ?? process.cwd();
    if (!options.loadCooldown) {
      const { synchronizeWriterCheckout } =
        await import("./writer-runtime.mjs");
      await synchronizeWriterCheckout({ root, env, run: options.run });
    }
    const output = [];
    const result = await runGithubWriterPass({
      nowMs: options.nowMs ?? Date.now(),
      now: () => options.nowMs ?? Date.now(),
      loadCooldown: options.loadCooldown ?? (() => loadGithubBackoff({ root })),
      gh:
        options.gh ??
        ((args, stdin) =>
          executeGh(args, stdin, { includeRateLimitHeaders: true })),
      download:
        options.download ??
        ((args) =>
          executeGh(args, undefined, {
            includeRateLimitHeaders: true,
            binary: true,
          })),
      requestLimit: options.requestLimit,
      persistCooldown:
        options.persistCooldown ??
        ((cooldown) =>
          persistGithubBackoff({ root, env, cooldown, run: options.run })),
      run: (gh) =>
        runWriterMode({
          ...options,
          env,
          event,
          gh,
          write: (value) => output.push(value),
        }),
    });
    if (typeof result === "number") {
      for (const value of output) write(value);
      return result;
    }
    write(JSON.stringify(result));
    return 0;
  } catch {
    write(JSON.stringify({ status: "unavailable" }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runAutomationWriterCli();
