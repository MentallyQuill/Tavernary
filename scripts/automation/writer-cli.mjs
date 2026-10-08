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
