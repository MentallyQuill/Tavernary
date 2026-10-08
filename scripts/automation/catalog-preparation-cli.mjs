import { readFile, writeFile, mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { executeGh } from "../submissions/kit-submission-reconciliation.mjs";
import { loadAutomationInventory } from "./inventory.mjs";
import {
  assertCatalogPreparationContext,
  prepareCatalogOperation,
  acquireCatalogData,
} from "./catalog-preparation.mjs";
import { classifyAutomationFailure } from "./failure.mjs";
import { githubFailureStatus } from "./github-inventory.mjs";
import { loadProducerBudgetGuard } from "./model-budget-github.mjs";

export async function runCatalogPreparationCli(options = {}) {
  const env = options.env ?? process.env;
  const write = options.write ?? console.log;
  const outputDirectory =
    options.outputDirectory ??
    (env.RUNNER_TEMP ? resolve(env.RUNNER_TEMP, "automation-prepared") : null);
  let operationKey;
  try {
    if (
      env.GITHUB_REF !== "refs/heads/main" ||
      env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
      !env.TAVERNARY_PUBLISHER_BOT_ID ||
      env.GITHUB_ACTOR_ID !== env.TAVERNARY_PUBLISHER_BOT_ID
    )
      throw new Error("Preparation requires a trusted publisher dispatch.");
    const event =
      options.event ??
      JSON.parse(await readFile(env.GITHUB_EVENT_PATH, "utf8"));
    operationKey = event.inputs?.operation_key;
    if (!/^[a-f0-9]{64}$/u.test(operationKey ?? ""))
      throw new Error("Preparation operation key is invalid.");
    const mode = event.inputs?.mode ?? "project";
    if (!["project", "forensic"].includes(mode))
      throw new Error("Preparation mode is invalid.");
    const state = await (
      options.load ??
      (() =>
        loadAutomationInventory({
          root: process.cwd(),
          gh: executeGh,
          repository: env.GITHUB_REPOSITORY,
          publisherActorId: Number(env.TAVERNARY_PUBLISHER_BOT_ID),
          nowMs: Date.now(),
        }))
    )();
    const operation = state.operations.find(
      (operation) => operation.key === operationKey,
    );
    if (!operation) {
      write(JSON.stringify({ status: "superseded", operationKey }));
      return 0;
    }
    const producer = assertCatalogPreparationContext({ state, operation, env });
    const result = await (options.prepare ?? prepareCatalogOperation)({
      state,
      operation,
      producer,
      acquire: (input) =>
        acquireCatalogData({
          ...input,
          mode,
          options: {
            env,
            budgetGuard: () =>
              loadProducerBudgetGuard({
                env,
                operationKey,
                ticketIds: String(event.inputs?.budget_ticket ?? "")
                  .split(",")
                  .filter(Boolean),
                gh: executeGh,
              }),
          },
        }),
    });
    if (result) {
      if (!outputDirectory)
        throw new Error("Preparation output directory is unavailable.");
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        resolve(outputDirectory, "result.json"),
        `${JSON.stringify(result)}\n`,
        { flag: "wx" },
      );
    }
    if (env.GITHUB_OUTPUT)
      await appendFile(
        env.GITHUB_OUTPUT,
        `operation_key=${operationKey}\nresult_available=${Boolean(result)}\n`,
      );
    write(
      JSON.stringify({
        status: result ? "prepared" : "unchanged",
        operationKey,
      }),
    );
    return 0;
  } catch (error) {
    const failure = classifyAutomationFailure({
      diagnosticCode: error?.code,
      httpStatus: githubFailureStatus(error),
    });
    if (outputDirectory && /^[a-f0-9]{64}$/u.test(operationKey ?? "")) {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        resolve(outputDirectory, "diagnostic.json"),
        `${JSON.stringify({ schema_version: 1, operation_key: operationKey, failure })}\n`,
      );
    }
    write(JSON.stringify({ status: "unavailable", failure }));
    return 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  process.exitCode = await runCatalogPreparationCli();
