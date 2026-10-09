import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { reconcileAutomation } from "./reconcile.mjs";
import {
  assertCanonicalWriterContext,
  githubFailureStatus,
  persistGithubAutomationReceipt,
} from "./github-inventory.mjs";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";

function parseArgs(args) {
  const options = { apply: false, limit: 20 };
  for (let index = 0; index < args.length; index++) {
    if (args[index] === "--apply") options.apply = true;
    else if (args[index] === "--limit") {
      options.limit = Number(args[++index]);
      if (
        !Number.isSafeInteger(options.limit) ||
        options.limit < 0 ||
        options.limit > 20
      )
        throw new Error("Automation limit must be between zero and twenty.");
    } else throw new Error("Unknown reconciliation argument.");
  }
  return options;
}

export async function runReconcileAutomationCli(options = {}) {
  const write = options.write ?? console.log;
  const env = options.env ?? process.env;
  const gh = options.gh ?? executeGh;
  try {
    const args = parseArgs(options.args ?? process.argv.slice(2));
    const repository = env.GITHUB_REPOSITORY ?? "MentallyQuill/Tavernary";
    const event =
      options.event ??
      (env.GITHUB_EVENT_PATH
        ? JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"))
        : {});
    if (args.apply) assertCanonicalWriterContext(env, repository, event);
    const nowMs = options.nowMs ?? Date.now();
    let inventory = options.inventory;
    let receipts = options.receipts ?? [];
    let revalidate = options.revalidate;
    let dispatch = options.dispatch;
    if (!inventory) {
      const {
        loadAutomationInventory,
        revalidateAutomationOperation,
        dispatchAutomationOperation,
      } = await import("./inventory.mjs");
      const state = await loadAutomationInventory({
        root: options.root ?? process.cwd(),
        gh,
        repository,
        publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
        nowMs,
      });
      inventory = async () => state.operations;
      receipts = state.receipts;
      revalidate ??= (operation) =>
        revalidateAutomationOperation({
          state,
          operation,
          gh,
          repository,
          nowMs,
          env,
        });
      dispatch ??= (operation) =>
        dispatchAutomationOperation({ operation, gh, repository, env });
    }
    const result = await reconcileAutomation({
      inventory,
      receipts,
      nowMs,
      limit: args.limit,
      dryRun: !args.apply,
      revalidate,
      dispatch:
        dispatch ??
        (async () => {
          throw new Error("Automation dispatch adapter is missing.");
        }),
      persist:
        options.persist ??
        ((receipt) =>
          persistGithubAutomationReceipt({ gh, repository, receipt })),
    });
    write(JSON.stringify({ ...result, dryRun: !args.apply }, null, 2));
    return 0;
  } catch (error) {
    const failure = classifyAutomationFailure({
      httpStatus: githubFailureStatus(error),
      diagnosticCode: error?.code,
    });
    write(JSON.stringify({ status: "unavailable", failure }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runReconcileAutomationCli();
