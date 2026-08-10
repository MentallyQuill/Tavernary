import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assertFullRolloutAllowed } from "./enrichment-run-state.mjs";
import {
  isPreHardeningTerminalFullReport,
  validateEnrichmentReport,
} from "./enrichment-report.mjs";
import { selectEnrichmentRecords } from "./enrich-readmes.mjs";
import { manualEnrichmentExclusions } from "./enrichment-policy.mjs";

export function planEnrichmentRollout(input) {
  const selectionMode = input.selectionMode ?? "pending";
  if (!["pending", "all-automatic"].includes(selectionMode)) {
    throw new Error(`unsupported enrichment selection mode: ${selectionMode}`);
  }
  const reportSelectionMode = (report) => report?.selection_mode ?? "pending";
  if (
    input.fullReport?.mode === "full" &&
    input.fullReport.status === "running"
  ) {
    if (reportSelectionMode(input.fullReport) !== selectionMode) {
      throw new Error("selection mode does not match the running full rollout");
    }
    if (input.fullReport.expected_model !== input.model) {
      throw new Error(
        "configured model does not match the running full rollout",
      );
    }
    return { action: "resume-full" };
  }
  if (
    input.fullReport?.mode === "full" &&
    input.fullReport.status === "failed" &&
    reportSelectionMode(input.fullReport) === selectionMode
  ) {
    if (input.fullReport.expected_model !== input.model) {
      throw new Error(
        "configured model does not match the failed full rollout",
      );
    }
    if (input.eligibleCount === 0) {
      throw new Error("failed full rollout has no recoverable candidates");
    }
    assertFullRolloutAllowed(input.canaryReport, input.model, selectionMode);
    return { action: "restart-full" };
  }
  if (
    input.fullReport?.mode === "full" &&
    ["complete", "complete-with-errors"].includes(input.fullReport.status) &&
    reportSelectionMode(input.fullReport) === selectionMode
  ) {
    if (input.fullReport.expected_model !== input.model) {
      throw new Error(
        "configured model does not match the completed full rollout",
      );
    }
    const checkpoint =
      input.fullReport.publication?.checkpoint_commit_sha ?? null;
    const deployment = input.fullReport.deployment;
    if (
      !/^[0-9a-f]{40}$/u.test(checkpoint ?? "") ||
      deployment?.commit_sha !== checkpoint ||
      !Number.isInteger(deployment?.run_id) ||
      deployment.run_id < 1 ||
      typeof deployment?.verified_at !== "string"
    ) {
      return { action: "deploy-full" };
    }
  }
  if (input.eligibleCount === 0) {
    return { action: "complete" };
  }
  try {
    assertFullRolloutAllowed(input.canaryReport, input.model, selectionMode);
    return { action: "start-full" };
  } catch (error) {
    if (
      input.canaryReport?.status === "passed" &&
      reportSelectionMode(input.canaryReport) === selectionMode
    ) {
      throw error;
    }
    // A missing or stale authorization falls through to canary recovery.
  }
  if (
    input.canaryReport?.mode === "canary" &&
    input.canaryReport.expected_model === input.model &&
    reportSelectionMode(input.canaryReport) === selectionMode
  ) {
    if (input.canaryReport.status === "running") {
      return { action: "continue-canary" };
    }
    if (input.canaryReport.status === "awaiting-deployment") {
      return { action: "deploy-canary" };
    }
  }
  if (
    input.canaryReport?.mode === "canary" &&
    input.canaryReport.status === "running" &&
    reportSelectionMode(input.canaryReport) !== selectionMode
  ) {
    throw new Error("selection mode does not match the running canary rollout");
  }
  if (input.eligibleCount >= 5) {
    return { action: "start-canary" };
  }
  throw new Error(
    `a new rollout requires at least five enrichment candidates; found ${input.eligibleCount}`,
  );
}

export function createEnrichmentRolloutPlan(input) {
  const selectionMode = input.selectionMode ?? "pending";
  const force = selectionMode === "all-automatic";
  const eligibleCount = selectEnrichmentRecords(
    input.records,
    input.sourcesById,
    { force },
  ).length;
  const manualExclusionCount = manualEnrichmentExclusions(input.records).length;
  return {
    ...planEnrichmentRollout({ ...input, selectionMode, eligibleCount }),
    eligible_count: eligibleCount,
    manual_exclusion_count: manualExclusionCount,
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

function validateFullReportForPlanning(fullReport) {
  if (fullReport === null) return null;
  try {
    return validateEnrichmentReport(fullReport);
  } catch (error) {
    if (!isPreHardeningTerminalFullReport(fullReport)) throw error;
    return null;
  }
}

export async function runPlannerCli(options = {}) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
  const model = options.model ?? process.env.UTILITY_MODEL;
  const selectionMode =
    options.selectionMode ?? process.env.ENRICHMENT_SELECTION_MODE ?? "pending";
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
  const sources =
    options.sources ??
    (await Promise.all(
      (await readdir(resolve(root, "data/registry/sources")))
        .filter((name) => name.endsWith(".json"))
        .map(async (name) =>
          readOptionalJson(resolve(root, "data/registry/sources", name)),
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
  const validatedFullReport = validateFullReportForPlanning(fullReport);
  const validatedCanaryReport =
    canaryReport === null ? null : validateEnrichmentReport(canaryReport);
  return createEnrichmentRolloutPlan({
    model,
    selectionMode,
    records,
    sourcesById: Object.fromEntries(
      sources.map((source) => [source.id, source]),
    ),
    fullReport: validatedFullReport,
    canaryReport: validatedCanaryReport,
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
