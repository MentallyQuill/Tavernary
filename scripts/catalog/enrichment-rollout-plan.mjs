import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertFullRolloutAllowed } from "./enrichment-run-state.mjs";
import { selectEnrichmentRecords } from "./enrich-readmes.mjs";

export function planEnrichmentRollout(input) {
  if (
    input.fullReport?.mode === "full" &&
    input.fullReport.status === "running"
  ) {
    if (input.fullReport.expected_model !== input.model) {
      throw new Error(
        "configured model does not match the running full rollout",
      );
    }
    return { action: "resume-full" };
  }
  if (input.eligibleCount === 0) {
    return { action: "complete" };
  }
  try {
    assertFullRolloutAllowed(input.canaryReport, input.model);
    return { action: "start-full" };
  } catch {
    // A missing or stale authorization falls through to canary recovery.
  }
  if (
    input.canaryReport?.mode === "canary" &&
    input.canaryReport.expected_model === input.model
  ) {
    if (input.canaryReport.status === "running") {
      return { action: "continue-canary" };
    }
    if (input.canaryReport.status === "awaiting-deployment") {
      return { action: "deploy-canary" };
    }
  }
  if (input.eligibleCount >= 5) {
    return { action: "start-canary" };
  }
  throw new Error(
    `a new rollout requires at least five enrichment candidates; found ${input.eligibleCount}`,
  );
}

export function createEnrichmentRolloutPlan(input) {
  const eligibleCount = selectEnrichmentRecords(input.records).length;
  return {
    ...planEnrichmentRollout({ ...input, eligibleCount }),
    eligible_count: eligibleCount,
  };
}

async function readOptionalJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

export async function runPlannerCli(options = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const model = options.model ?? process.env.TAVERNARY_ENRICHMENT_MODEL;
  if (typeof model !== "string" || model.length === 0 || /\s/u.test(model)) {
    throw new Error("configured model is required");
  }
  const records =
    options.records ??
    (await Promise.all(
      (await readdir(resolve(root, "data/registry/projects")))
        .filter((name) => name.endsWith(".json"))
        .map(async (name) =>
          readOptionalJson(resolve(root, "data/registry/projects", name)),
        ),
    ));
  const fullReport =
    options.fullReport !== undefined
      ? options.fullReport
      : await readOptionalJson(
          options.reportPath ??
            resolve(root, "data/reports/enrichment-report.json"),
        );
  const canaryReport =
    options.canaryReport !== undefined
      ? options.canaryReport
      : await readOptionalJson(
          options.canaryReportPath ??
            resolve(root, "data/reports/enrichment-canary.json"),
        );
  return createEnrichmentRolloutPlan({
    model,
    records,
    fullReport,
    canaryReport,
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runPlannerCli()
    .then((result) => console.log(JSON.stringify(result)))
    .catch((error) => {
      console.error(error.stack ?? error.message);
      process.exitCode = 1;
    });
}
