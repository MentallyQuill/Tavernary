import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
} from "./github-inventory.mjs";
import { classifyAutomationFailure } from "./failure.mjs";

const modes = new Set([
  "reconcile",
  "reconcile-project",
  "publish",
  "prepare",
  "confirm",
  "confirm-restore",
  "retain",
  "finalize",
  "advisory-notice",
]);
export async function runAutomationWriterCli(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? console.log;
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
      write(JSON.stringify(await handler(event.inputs ?? {})));
      return 0;
    }
    if (mode === "reconcile") {
      const { runAutomationWriterReconciliation } =
        await import("./writer-runtime.mjs");
      write(JSON.stringify(await runAutomationWriterReconciliation({ env })));
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
            env,
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
          await handler({ runId: Number(event.inputs?.result_run_id), env }),
        ),
      );
      return 0;
    }
    throw new Error("Writer mode is not implemented.");
  } catch (error) {
    write(
      JSON.stringify({
        status: "unavailable",
        failure: classifyAutomationFailure({
          diagnosticCode: error?.code,
          httpStatus: githubFailureStatus(error),
        }),
      }),
    );
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runAutomationWriterCli();
