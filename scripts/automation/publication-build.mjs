import { createHash } from "node:crypto";
import { buildCatalog, projectCatalogV7 } from "../catalog/build.mjs";
import { validateCatalog } from "../catalog/validate.mjs";
import { validateStoredReportIndex } from "../security/tavernkeeper-reports.mjs";
import { validateTavernKeeperImportState } from "../security/tavernkeeper-import-state.mjs";
import { settlePreparedModelUsage } from "./model-budget.mjs";
import { validateEnrichmentReport } from "../catalog/enrichment-report.mjs";

function replace(records, value, key) {
  const values = records.filter((record) => record[key] !== value[key]);
  values.push(value);
  return values;
}
function publicFile(path, value) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return {
    path,
    type: "file",
    content,
    sha256: createHash("sha256").update(content).digest("hex"),
    bytes: Buffer.byteLength(content),
    baseDigest: null,
  };
}
export async function buildPreparedCatalogPublication({ action, state }) {
  const local = structuredClone(state.local);
  for (const file of action.files) {
    const value = JSON.parse(file.content);
    if (file.path.startsWith("data/registry/projects/"))
      local.projects = replace(local.projects, value, "id");
    else if (file.path.startsWith("data/registry/sources/"))
      local.sources = replace(local.sources, value, "id");
    else if (file.path.startsWith("data/registry/kits/"))
      local.kits = replace(local.kits, value, "id");
    else if (file.path.startsWith("data/snapshots/github/kits/"))
      local.kitSnapshots = replace(local.kitSnapshots, value, "kit_id");
    else if (file.path === "data/snapshots/github-refresh.json")
      local.refreshManifest = value;
    else if (/^data\/snapshots\/(github|codeberg)\//u.test(file.path))
      local.snapshots = replace(local.snapshots, value, "source_id");
    else if (file.path.startsWith("data/snapshots/install/"))
      local.installEvidence = replace(
        local.installEvidence,
        value,
        "source_id",
      );
    else if (file.path.startsWith("data/snapshots/policy-review/"))
      local.advisoryState = replace(local.advisoryState, value, "project_id");
    else if (file.path === "data/security/tavernkeeper-report-summaries.json")
      local.storedReports = validateStoredReportIndex(value, local.sources);
    else if (file.path === "data/security/tavernkeeper-import-state.json")
      validateTavernKeeperImportState(value);
    else if (
      [
        "data/reports/enrichment-canary.json",
        "data/reports/enrichment-report.json",
      ].includes(file.path)
    )
      validateEnrichmentReport(value);
    else if (!file.path.startsWith("data/maintenance/automation/metadata/"))
      throw new Error("Prepared catalog contains an unsupported data path.");
  }
  const inputs = {
    records: local.projects,
    sources: local.sources,
    snapshots: local.snapshots,
    installEvidence: local.installEvidence ?? [],
    kitRecords: local.kits,
    kitSnapshots: local.kitSnapshots ?? [],
    supportSnapshots: local.kitSnapshots ?? [],
    blockedUsers: local.blockedUsers,
    policyReviewStates: local.advisoryState,
    tavernKeeperReports: local.storedReports,
    ...(local.refreshManifest
      ? { refreshManifest: local.refreshManifest }
      : {}),
  };
  const validation = await validateCatalog(inputs);
  if (validation.errors.length)
    throw Object.assign(
      new Error("Prepared catalog cross-reference validation failed."),
      { code: "validation-failed" },
    );
  let files = action.files;
  if (action.modelSettlements?.length) {
    if (
      action.modelSettlements.some(
        (row) => !action.operationKeys.includes(row.operationKey),
      )
    )
      throw new Error("Model settlement operation is unrelated.");
    const budget = settlePreparedModelUsage(
      local.modelBudget,
      action.modelSettlements,
    );
    if (JSON.stringify(budget) !== JSON.stringify(local.modelBudget))
      files = [
        ...files,
        publicFile(
          "data/maintenance/automation/model-budgets/global.json",
          budget,
        ),
      ];
  }
  if (
    action.files.every((file) =>
      /^(?:data\/maintenance\/automation\/metadata|data\/snapshots\/policy-review)\//u.test(
        file.path,
      ),
    )
  )
    return files;
  const catalog = await buildCatalog({
    ...inputs,
    write: false,
    now: action.files.some((file) =>
      [
        "data/reports/enrichment-canary.json",
        "data/reports/enrichment-report.json",
      ].includes(file.path),
    )
      ? new Date(state.nowMs).toISOString()
      : (local.refreshManifest?.completed_at ??
        new Date(state.nowMs).toISOString()),
  });
  return [
    ...files,
    publicFile(
      "public/catalog/tavernary-catalog.json",
      projectCatalogV7(catalog),
    ),
    publicFile("public/catalog/tavernary-catalog-v8.json", catalog),
  ];
}
