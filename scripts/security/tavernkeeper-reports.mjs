import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import Ajv from "ajv";

import reportIndexV5Schema from "../../data/schemas/tavernkeeper-report-index.v5.schema.json" with { type: "json" };
import scanReportV5Schema from "../../data/schemas/tavernkeeper-scan-report.v5.schema.json" with { type: "json" };
import { validateStoredAssessmentShape } from "./tavernkeeper-assessment-contract.mjs";
import { fetchHardenedJson } from "./hardened-json-fetch.mjs";

export const TAVERNKEEPER_ORIGIN = "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX = "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL =
  "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION = "5";

const digestPattern = /^[0-9a-f]{64}$/u;
const fullShaPattern = /^[0-9a-f]{40}$/u;
const versionPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/u;
const supportedScannerPolicyVersions = new Set(["3", "4", "5"]);
const supportedContextualReviewPolicyVersions = new Set([
  "1",
  "2",
  "3",
  "4",
  "5",
]);
const incompleteJavascriptLimitation =
  "JavaScript analysis was incomplete, so this first-filter scan supports no clean conclusion about unobserved behavior.";
const metadataOnlyEvidenceLimitation =
  "One or more scanner candidates refer to non-text artifacts. Their size, digest, and scanner metadata were verified, but raw contents were not provided to the contextual model.";
const rfc3339DateTime =
  /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d):(?<second>[0-5]\d)(?:\.\d+)?Z$/u;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRfc3339DateTime(value) {
  const match = rfc3339DateTime.exec(value);
  if (!match?.groups) return false;
  const daysInMonth = [
    31,
    isLeapYear(Number(match.groups.year)) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    Number(match.groups.day) <= daysInMonth[Number(match.groups.month) - 1]
  );
}

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("date-time", { type: "string", validate: isRfc3339DateTime });
ajv.addFormat("uri", {
  type: "string",
  validate(value) {
    try {
      new URL(value);
      return true;
    } catch {
      return false;
    }
  },
});
const validateIndexSchema = ajv.compile(reportIndexV5Schema);
const validateReportSchema = ajv.compile(scanReportV5Schema);

function schemaError(label, validator) {
  const details = (validator.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return new Error(`${label} schema validation failed: ${details}`);
}

function assertV5(value, label) {
  if (value?.schema_version !== 5) {
    throw new Error(
      `${label} schema validation failed: unsupported schema version`,
    );
  }
}

function assertIndexSchema(index) {
  assertV5(index, "TavernKeeper report index");
  if (!validateIndexSchema(index)) {
    throw schemaError("TavernKeeper report index", validateIndexSchema);
  }
}

function assertReportSchema(report) {
  assertV5(report, "TavernKeeper scan report");
  if (!validateReportSchema(report)) {
    throw schemaError("TavernKeeper scan report", validateReportSchema);
  }
}

function policy3RecommendedRisk(item) {
  if (
    item.disposition === "expected_behavior" ||
    item.disposition === "minor_weakness"
  ) {
    return "low";
  }
  if (item.disposition === "credible_malicious_behavior") return "high";
  const demonstratedMaterial =
    item.risk_exposure === "demonstrated" &&
    item.confidence === "high" &&
    ["medium", "high", "critical"].includes(item.impact) &&
    ["plausible", "readily_exploitable"].includes(item.exploitability);
  if (!demonstratedMaterial) return "low";
  return item.impact === "critical" &&
    item.exploitability === "readily_exploitable"
    ? "high"
    : "material";
}

function assertSupportedContextualReviewPolicy(entry) {
  if (
    !supportedContextualReviewPolicyVersions.has(
      entry.contextual_review_policy_version,
    )
  ) {
    throw new Error(
      "TavernKeeper has an unsupported contextual review policy version",
    );
  }
}

function assertContextualReviewPolicy(report) {
  assertSupportedContextualReviewPolicy(report);
  const items = [...report.assessments, ...report.observations];
  const demonstratedRiskPolicy = ["3", "4", "5"].includes(
    report.contextual_review_policy_version,
  );
  if (!demonstratedRiskPolicy) {
    if (items.some((item) => Object.hasOwn(item, "risk_exposure"))) {
      throw new Error(
        "TavernKeeper legacy contextual-policy report contains risk exposure",
      );
    }
    return;
  }
  const expectedPromptVersion = ["4", "5"].includes(
    report.contextual_review_policy_version,
  )
    ? "contextual-review-v7"
    : "contextual-review-v6";
  if (
    report.prompt_version !== expectedPromptVersion ||
    report.assessment_schema_version !== "contextual-assessment-v2"
  ) {
    throw new Error(
      `TavernKeeper policy-${report.contextual_review_policy_version} report has invalid demonstrated-risk contract versions`,
    );
  }
  const invalid = items.some(
    (item) =>
      !["not_demonstrated", "demonstrated"].includes(item.risk_exposure) ||
      (item.disposition === "credible_malicious_behavior" &&
        (item.confidence !== "high" ||
          item.risk_exposure !== "demonstrated")) ||
      item.recommended_risk !== policy3RecommendedRisk(item),
  );
  if (invalid) {
    throw new Error(
      `TavernKeeper policy-${report.contextual_review_policy_version} report violates demonstrated-risk rules`,
    );
  }
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalValue(item)]),
    );
  }
  return value;
}

export function computeReportDigest(reportBody) {
  const body = { ...reportBody };
  delete body.report_id;
  delete body.report_digest;
  return createHash("sha256")
    .update(JSON.stringify(canonicalValue(body)))
    .digest("hex");
}

function canonicalReportUrl(entry) {
  return (
    `${TAVERNKEEPER_ORIGIN}${TAVERNKEEPER_REPORTS_PATH_PREFIX}github/` +
    `${entry.repository_id}/${entry.target_sha}/${entry.scanner_policy_version}/` +
    `${entry.report_id}/`
  );
}

function canonicalHistoryUrl(entry) {
  return (
    `${TAVERNKEEPER_ORIGIN}${TAVERNKEEPER_REPORTS_PATH_PREFIX}github/` +
    `${entry.repository_id}/history/`
  );
}

function assertCanonicalIndexEntry(entry) {
  assertSupportedContextualReviewPolicy(entry);
  if (
    !digestPattern.test(entry.report_id) ||
    entry.report_id !== entry.report_digest ||
    !fullShaPattern.test(entry.target_sha)
  ) {
    throw new Error("TavernKeeper report has an invalid immutable identity");
  }
  if (entry.source_id !== `github-${entry.repository_id}`) {
    throw new Error("TavernKeeper report source identity is invalid");
  }
  if (
    entry.report_url !== canonicalReportUrl(entry) ||
    entry.history_url !== canonicalHistoryUrl(entry)
  ) {
    throw new Error("TavernKeeper report URL is unsafe");
  }
  if (
    entry.coverage.review_required !== entry.counts.candidates ||
    entry.coverage.review_completed !== entry.counts.assessments ||
    entry.coverage.review_required !== entry.coverage.review_completed ||
    entry.coverage.evidence_validated !== entry.counts.candidates ||
    entry.coverage.metadata_only_candidates > entry.coverage.evidence_validated
  ) {
    throw new Error("TavernKeeper report review coverage is incomplete");
  }
  if (
    (["4", "5"].includes(entry.scanner_policy_version) &&
      entry.coverage.javascript_analysis_status === "legacy") ||
    (entry.scanner_policy_version === "3" &&
      entry.coverage.javascript_analysis_status !== "legacy")
  ) {
    throw new Error(
      "TavernKeeper report JavaScript coverage does not match scanner policy",
    );
  }
}

function registrySources(registry) {
  if (Array.isArray(registry)) return registry;
  if (Array.isArray(registry?.sources)) return registry.sources;
  throw new Error("TavernKeeper report registry is invalid");
}

function activeGithubSourcesByRepositoryId(
  registry,
  { includeDelisted = false } = {},
) {
  const sources = new Map();
  for (const source of registrySources(registry)) {
    if (
      source?.type === "github" &&
      (source.status === "active" ||
        (includeDelisted && source.status === "delisted")) &&
      Number.isSafeInteger(source.repository_id) &&
      source.repository_id > 0 &&
      typeof source.id === "string" &&
      typeof source.repository === "string"
    ) {
      if (sources.has(source.repository_id)) {
        throw new Error(
          "TavernKeeper report registry has a duplicate active GitHub repository id",
        );
      }
      sources.set(source.repository_id, source);
    }
  }
  return sources;
}

function assertSourceIdentity(entry, sources) {
  const source = sources.get(entry.repository_id);
  if (!source) {
    throw new Error(
      "TavernKeeper report does not identify an active Tavernary source",
    );
  }
  if (
    entry.source_id !== source.id ||
    entry.repository !== source.repository ||
    entry.provider !== "github"
  ) {
    throw new Error("TavernKeeper report identity does not match Tavernary");
  }
}

function assertSupportedScannerPolicy(entry) {
  if (!supportedScannerPolicyVersions.has(entry.scanner_policy_version)) {
    throw new Error("TavernKeeper scanner policy version is unsupported");
  }
}

function assertIndexSemantics(index, registry, { pruneDelisted = false } = {}) {
  const reportIds = new Set();
  const repositoryIds = new Set();
  const sources = activeGithubSourcesByRepositoryId(registry, {
    includeDelisted: pruneDelisted,
  });
  const reports = [];
  for (const entry of index.reports) {
    assertCanonicalIndexEntry(entry);
    assertSourceIdentity(entry, sources);
    assertSupportedScannerPolicy(entry);
    if (
      reportIds.has(entry.report_id) ||
      repositoryIds.has(entry.repository_id)
    ) {
      throw new Error(
        "TavernKeeper index contains a duplicate preferred identity",
      );
    }
    reportIds.add(entry.report_id);
    repositoryIds.add(entry.repository_id);
    if (sources.get(entry.repository_id).status === "active") {
      reports.push(entry);
    }
  }
  return reports;
}

function normalizeLegacyReportIndex(index) {
  return Array.isArray(index?.reports)
    ? {
        ...index,
        reports: index.reports.map(migrateLegacyCoverage),
      }
    : index;
}

export function validateReportIndex(index, registry, options = {}) {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options) ||
    Object.keys(options).some((key) => key !== "pruneDelisted") ||
    (options.pruneDelisted !== undefined &&
      typeof options.pruneDelisted !== "boolean")
  ) {
    throw new Error("TavernKeeper report index validation options are invalid");
  }
  const normalizedIndex = normalizeLegacyReportIndex(index);
  assertIndexSchema(normalizedIndex);
  const pruneDelisted = options.pruneDelisted === true;
  const reports = assertIndexSemantics(normalizedIndex, registry, {
    pruneDelisted,
  });
  return pruneDelisted ? { ...normalizedIndex, reports } : normalizedIndex;
}

const itemCountKeys = {
  disposition: [
    "expected_behavior",
    "minor_weakness",
    "material_vulnerability",
    "credible_malicious_behavior",
  ],
  impact: ["none", "low", "medium", "high", "critical"],
  exploitability: ["unlikely", "plausible", "readily_exploitable"],
  confidence: ["low", "medium", "high"],
  recommended_risk: ["low", "material", "high"],
};

function contextualCounts(report) {
  const items = [...report.assessments, ...report.observations];
  const result = {
    candidates: report.candidates.length,
    assessments: report.assessments.length,
    observations: report.observations.length,
    items: items.length,
  };
  for (const [field, keys] of Object.entries(itemCountKeys)) {
    result[field] = Object.fromEntries(keys.map((key) => [key, 0]));
    for (const item of items) result[field][item[field]] += 1;
  }
  return result;
}

function assertReportReferences(report) {
  const candidates = new Map();
  const evidence = new Map();
  for (const candidate of report.candidates) {
    if (
      candidates.has(candidate.candidate_id) ||
      evidence.has(candidate.evidence_id)
    ) {
      throw new Error("TavernKeeper report candidate identities are duplicate");
    }
    candidates.set(candidate.candidate_id, candidate);
    evidence.set(candidate.evidence_id, candidate);
  }

  const assessed = new Set();
  for (const assessment of report.assessments) {
    const candidate = candidates.get(assessment.candidate_id);
    if (!candidate || assessed.has(assessment.candidate_id)) {
      throw new Error(
        "TavernKeeper report assessment cites an unknown candidate",
      );
    }
    assessed.add(assessment.candidate_id);
    if (!assessment.evidence_ids.includes(candidate.evidence_id)) {
      throw new Error(
        "TavernKeeper report assessment omits its candidate evidence",
      );
    }
    assertItemEvidence(assessment, evidence);
  }
  if (
    assessed.size !== candidates.size ||
    [...candidates.keys()].some((id) => !assessed.has(id))
  ) {
    throw new Error(
      "TavernKeeper report candidate assessment coverage is incomplete",
    );
  }
  for (const observation of report.observations) {
    if (observation.related_candidate_ids.some((id) => !candidates.has(id))) {
      throw new Error(
        "TavernKeeper report observation cites an unknown candidate",
      );
    }
    assertItemEvidence(observation, evidence);
  }
}

function assertItemEvidence(item, evidence) {
  const paths = new Set();
  for (const evidenceId of item.evidence_ids) {
    const candidate = evidence.get(evidenceId);
    if (!candidate) {
      throw new Error("TavernKeeper report item cites unknown evidence");
    }
    paths.add(candidate.path);
  }
  if (item.locations.some((location) => !paths.has(location.path))) {
    throw new Error("TavernKeeper report item location is not evidence-bound");
  }
}

const originTools = {
  tavernkeeper: "tavernkeeper-static",
  gitleaks: "gitleaks",
  opengrep: "opengrep",
  "osv-scanner": "osv-scanner",
  zizmor: "zizmor",
  malcontent: "malcontent",
  "javascript-analysis": "javascript-analysis",
};

function assertPolicy5Triage(report) {
  const scannerPolicy5 = report.scanner_policy_version === "5";
  const contextualPolicy5 = report.contextual_review_policy_version === "5";
  if (scannerPolicy5 !== contextualPolicy5) {
    throw new Error(
      "TavernKeeper scanner and contextual policy-5 versions do not match",
    );
  }
  if (!scannerPolicy5) {
    if (
      report.review_triage !== undefined ||
      report.assessments.some(
        (assessment) =>
          Object.hasOwn(assessment, "assessment_source") ||
          Object.hasOwn(assessment, "triage_reason_code"),
      )
    ) {
      throw new Error(
        "TavernKeeper historical report contains policy-5 triage provenance",
      );
    }
    return;
  }
  if (
    report.rule_catalog_version !== "2" ||
    report.prompt_version !== "contextual-review-v7" ||
    report.assessment_schema_version !== "contextual-assessment-v2" ||
    report.review_triage?.policy_version !== "1" ||
    report.candidates.some(
      (candidate) => candidate.execution_scope === undefined,
    )
  ) {
    throw new Error("TavernKeeper policy-5 report identity is invalid");
  }

  const triage = report.review_triage;
  const reasonCounts = new Map();
  let deterministic = 0;
  let contextual = 0;
  for (const assessment of report.assessments) {
    if (assessment.assessment_source === "deterministic-policy") {
      deterministic += 1;
    } else if (assessment.assessment_source === "contextual-model") {
      contextual += 1;
    } else {
      throw new Error("TavernKeeper policy-5 assessment source is invalid");
    }
    if (
      typeof assessment.triage_reason_code !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(assessment.triage_reason_code)
    ) {
      throw new Error("TavernKeeper policy-5 triage reason is invalid");
    }
    reasonCounts.set(
      assessment.triage_reason_code,
      (reasonCounts.get(assessment.triage_reason_code) ?? 0) + 1,
    );
  }
  const expectedReasons = [...reasonCounts]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([reason_code, count]) => ({ reason_code, count }));
  const reusedCandidates = report.review_reuse?.candidates.reused ?? 0;
  const reusedCases = report.review_reuse?.groups.reused ?? 0;
  const batches = report.review_batches ?? [];
  const actual = triage.model_budget.actual;
  const configured = triage.model_budget.configured;
  const estimatedInputTokens = batches.reduce(
    (total, batch) => total + (batch.estimated_input_tokens ?? 0),
    0,
  );

  if (
    triage.candidates.total !== report.candidates.length ||
    triage.candidates.deterministic + triage.candidates.contextual !==
      triage.candidates.total ||
    triage.candidates.deterministic !== deterministic ||
    triage.candidates.contextual !== contextual ||
    triage.candidates.reused_contextual !== reusedCandidates ||
    triage.candidates.reused_contextual > triage.candidates.contextual
  ) {
    throw new Error("TavernKeeper policy-5 candidate triage is inconsistent");
  }
  if (
    triage.cases.contextual > triage.cases.total ||
    triage.cases.reused_contextual > triage.cases.contextual ||
    triage.cases.reused_contextual !== reusedCases ||
    (triage.candidates.total > 0 && triage.cases.total === 0)
  ) {
    throw new Error(
      "TavernKeeper policy-5 behavior-case triage is inconsistent",
    );
  }
  if (JSON.stringify(triage.reasons) !== JSON.stringify(expectedReasons)) {
    throw new Error("TavernKeeper policy-5 triage reasons are inconsistent");
  }
  if (
    actual.fresh_behavior_cases !==
      triage.cases.contextual - triage.cases.reused_contextual ||
    actual.provider_calls !== batches.length ||
    actual.estimated_input_tokens !== estimatedInputTokens ||
    actual.input_tokens !== report.review_usage.input_tokens ||
    actual.output_tokens !== report.review_usage.output_tokens ||
    actual.fresh_behavior_cases > configured.max_fresh_behavior_cases ||
    actual.provider_calls > configured.max_provider_calls ||
    actual.estimated_input_tokens > configured.max_estimated_input_tokens ||
    actual.input_tokens > configured.max_actual_input_tokens ||
    actual.output_tokens > configured.max_actual_output_tokens
  ) {
    throw new Error("TavernKeeper policy-5 model budget is inconsistent");
  }
  if (
    (contextual > 0 || actual.provider_calls > 0) &&
    report.contextual_reviewer === undefined
  ) {
    throw new Error("TavernKeeper contextual candidates lack a reviewer");
  }
  if (contextual === 0 && report.observations.length > 0) {
    throw new Error(
      "TavernKeeper all-deterministic report contains model observations",
    );
  }
}

function assertReportCoverage(report) {
  assertPolicy5Triage(report);
  const evidenceValidation = report.coverage.evidence_validation;
  const metadataOnlyEvidence =
    evidenceValidation.status === "completed-with-limitations";
  if (
    report.review_coverage.required !== report.candidates.length ||
    report.review_coverage.completed !== report.assessments.length ||
    report.review_coverage.required !== report.review_coverage.completed ||
    evidenceValidation.validated_candidates !== report.candidates.length ||
    (evidenceValidation.status !== "completed" && !metadataOnlyEvidence) ||
    (metadataOnlyEvidence &&
      (evidenceValidation.metadata_only_candidates < 1 ||
        evidenceValidation.metadata_only_candidates >
          evidenceValidation.validated_candidates))
  ) {
    throw new Error("TavernKeeper report review coverage is incomplete");
  }
  if (
    metadataOnlyEvidence !==
    report.limitations.includes(metadataOnlyEvidenceLimitation)
  ) {
    throw new Error(
      "TavernKeeper metadata-only evidence limitation is invalid",
    );
  }
  const tools = new Map();
  for (const tool of report.coverage.tools) {
    if (tools.has(tool.name)) {
      throw new Error("TavernKeeper report tool coverage is duplicate");
    }
    tools.set(tool.name, tool.status);
  }
  if (
    report.candidates.some(
      (candidate) => tools.get(originTools[candidate.origin]) !== "completed",
    )
  ) {
    throw new Error(
      "TavernKeeper report candidate lacks completed tool coverage",
    );
  }
  if (
    report.review_batches &&
    [
      "input_tokens",
      "output_tokens",
      "cache_read_tokens",
      "reasoning_tokens",
    ].some(
      (field) =>
        report.review_batches.reduce((sum, batch) => sum + batch[field], 0) !==
        report.review_usage[field],
    )
  ) {
    throw new Error(
      "TavernKeeper review batch usage does not reconcile with its totals",
    );
  }
  if (report.review_reuse) {
    const sourceIds = report.review_reuse.source_report_ids;
    const expectedReusableCandidates =
      report.contextual_review_policy_version === "5"
        ? report.review_triage.candidates.contextual
        : report.candidates.length;
    if (
      report.review_reuse.candidates.fresh +
        report.review_reuse.candidates.reused !==
        expectedReusableCandidates ||
      (report.review_reuse.groups.reused === 0) !== (sourceIds.length === 0) ||
      new Set(sourceIds).size !== sourceIds.length ||
      sourceIds.some(
        (sourceId, index) => index > 0 && sourceIds[index - 1] >= sourceId,
      )
    ) {
      throw new Error("TavernKeeper review reuse provenance is inconsistent");
    }
  }
  const javascript = report.coverage.javascript_analysis;
  if (
    ["4", "5"].includes(report.scanner_policy_version) &&
    javascript === undefined
  ) {
    throw new Error(
      "TavernKeeper policy-4 report lacks JavaScript analysis coverage",
    );
  }
  if (
    javascript &&
    Object.hasOwn(javascript, "warning_occurrences") !==
      Object.hasOwn(javascript, "warning_families")
  ) {
    throw new Error(
      "TavernKeeper JavaScript warning occurrence and family counts must appear together",
    );
  }
  if (
    javascript?.warning_occurrences !== undefined &&
    javascript.warning_families > javascript.warning_occurrences
  ) {
    throw new Error(
      "TavernKeeper JavaScript warning families cannot exceed warning occurrences",
    );
  }
  const incomplete = javascript?.status === "incomplete";
  const hasUnrecoveredJavascript =
    javascript?.unresolved.some(({ recovered }) => !recovered) ?? false;
  if (javascript && incomplete !== hasUnrecoveredJavascript) {
    throw new Error(
      "TavernKeeper JavaScript coverage does not match its unrecovered JavaScript stages",
    );
  }
  if (
    incomplete !== report.limitations.includes(incompleteJavascriptLimitation)
  ) {
    throw new Error(
      "TavernKeeper incomplete JavaScript coverage limitation is invalid",
    );
  }
}

const reportIdentityFields = [
  "report_id",
  "report_digest",
  "report_version",
  "supersedes_report_id",
  "scanner_version",
  "scanner_policy_version",
  "rule_catalog_version",
  "package_schema_version",
  "contextual_review_policy_version",
  "ecosystem_context_version",
  "prompt_version",
  "assessment_schema_version",
  "source_id",
  "provider",
  "repository_id",
  "repository",
  "target_sha",
  "completed_at",
  "assessment_method",
];

function projectedCoverage(report) {
  const completed = report.coverage.tools.filter(
    ({ status }) => status === "completed",
  ).length;
  return {
    history_commits: report.history.commits,
    inventory_files: report.coverage.inventory.files,
    inventory_bytes: report.coverage.inventory.bytes,
    tools_completed: completed,
    tools_not_applicable: report.coverage.tools.length - completed,
    evidence_validated:
      report.coverage.evidence_validation.validated_candidates,
    metadata_only_candidates:
      report.coverage.evidence_validation.status ===
      "completed-with-limitations"
        ? report.coverage.evidence_validation.metadata_only_candidates
        : 0,
    review_required: report.review_coverage.required,
    review_completed: report.review_coverage.completed,
    javascript_analysis_status:
      report.coverage.javascript_analysis?.status ?? "legacy",
  };
}

function assertReportMatchesIndex(report, entry) {
  if (
    reportIdentityFields.some((field) => report[field] !== entry[field]) ||
    JSON.stringify(report.counts) !== JSON.stringify(entry.counts) ||
    JSON.stringify(projectedCoverage(report)) !== JSON.stringify(entry.coverage)
  ) {
    throw new Error(
      "TavernKeeper scan report does not match its index identity",
    );
  }
  if (report.canonical_url !== `https://github.com/${report.repository}`) {
    throw new Error("TavernKeeper scan report canonical repository is invalid");
  }
}

export function validateScanReport(report, indexEntry) {
  assertReportSchema(report);
  assertContextualReviewPolicy(report);
  assertCanonicalIndexEntry(indexEntry);
  if (
    report.report_id !== report.report_digest ||
    computeReportDigest(report) !== report.report_digest
  ) {
    throw new Error("TavernKeeper scan report digest does not match its body");
  }
  assertReportCoverage(report);
  assertReportMatchesIndex(report, indexEntry);
  assertReportReferences(report);
  if (
    JSON.stringify(contextualCounts(report)) !== JSON.stringify(report.counts)
  ) {
    throw new Error("TavernKeeper scan report contextual counts do not match");
  }
  return report;
}

function assertInitialIndexUrl(url) {
  if (
    url.protocol !== "https:" ||
    url.origin !== TAVERNKEEPER_ORIGIN ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/TavernKeeper/reports/index.json" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TavernKeeper report index URL has an invalid origin or path",
    );
  }
}

function assertReportsUrl(url, expectedPath = null) {
  if (
    url.protocol !== "https:" ||
    url.origin !== TAVERNKEEPER_ORIGIN ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith(TAVERNKEEPER_REPORTS_PATH_PREFIX) ||
    (expectedPath !== null && url.pathname !== expectedPath) ||
    url.search ||
    url.hash
  ) {
    throw new Error("TavernKeeper report URL has an invalid origin or path");
  }
}

function hardenedOptions(options, resourceLabel, url, assertInitialUrl) {
  return {
    url,
    resourceLabel,
    assertInitialUrl,
    assertRedirectUrl: (redirect) => assertReportsUrl(redirect),
    timeoutMs: options.timeoutMs,
    dnsLookup: options.dnsLookup,
    requestImpl: options.requestImpl,
    fetchImpl: options.fetchImpl,
  };
}

export async function fetchAndValidateTavernKeeperIndex(options = {}) {
  const index = normalizeLegacyReportIndex(
    await fetchHardenedJson(
      hardenedOptions(
        options,
        "TavernKeeper report index",
        options.url ?? TAVERNKEEPER_REPORT_INDEX_URL,
        assertInitialIndexUrl,
      ),
    ),
  );
  assertIndexSchema(index);
  return index;
}

export async function fetchAndValidateTavernKeeperReport(entry, options = {}) {
  assertCanonicalIndexEntry(entry);
  const reportJsonUrl = `${entry.report_url}report.json`;
  const expectedPath = new URL(reportJsonUrl).pathname;
  const report = await fetchHardenedJson(
    hardenedOptions(
      options,
      "TavernKeeper immutable scan report",
      reportJsonUrl,
      (url) => assertReportsUrl(url, expectedPath),
    ),
  );
  return validateScanReport(report, entry);
}

function assertExactKeys(value, expected, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...expected].sort())
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

const storedEntryExtraKeys = [
  "assessed_at",
  "synthesis_policy_version",
  "synthesis_model",
  "danger_basis",
  "assessment_source",
  "assessment",
];
const priorStoredEntryExtraKeys = [
  "assessed_at",
  "synthesis_policy_version",
  "synthesis_model",
  "assessment",
];
const indexEntryKeys = reportIndexV5Schema.properties.reports.items.required;

function migrateLegacyCoverage(entry) {
  if (entry?.coverage === null || typeof entry?.coverage !== "object")
    return entry;
  const javascriptCoverage =
    entry.scanner_policy_version === "3" &&
    !("javascript_analysis_status" in entry.coverage)
      ? { javascript_analysis_status: "legacy" }
      : {};
  const contextualCoverage =
    "metadata_only_candidates" in entry.coverage
      ? {}
      : { metadata_only_candidates: 0 };
  if (
    Object.keys(javascriptCoverage).length === 0 &&
    Object.keys(contextualCoverage).length === 0
  )
    return entry;
  return {
    ...entry,
    coverage: {
      ...entry.coverage,
      ...javascriptCoverage,
      ...contextualCoverage,
    },
  };
}

function migrateStoredSnapshot(snapshot) {
  if (snapshot?.schema_version === 6 && Array.isArray(snapshot.reports)) {
    return {
      ...snapshot,
      reports: snapshot.reports.map(migrateLegacyCoverage),
    };
  }
  if (snapshot?.schema_version !== 5) return snapshot;
  assertExactKeys(
    snapshot,
    ["schema_version", "generated_at", "preferred_report_ids", "reports"],
    "Tracked TavernKeeper assessment snapshot",
  );
  if (!Array.isArray(snapshot.reports)) {
    throw new Error("Tracked TavernKeeper assessment snapshot is invalid");
  }
  return {
    ...snapshot,
    schema_version: 6,
    reports: snapshot.reports.map((entry) => {
      assertExactKeys(
        entry,
        [...indexEntryKeys, ...priorStoredEntryExtraKeys],
        "Tracked TavernKeeper assessment",
      );
      return migrateLegacyCoverage({
        ...entry,
        danger_basis: "none",
        assessment_source: "model",
      });
    }),
  };
}

export function validateStoredReportIndex(snapshotInput, registry) {
  const snapshot = migrateStoredSnapshot(snapshotInput);
  if (snapshot?.schema_version !== 6) {
    throw new Error(
      "Tracked TavernKeeper assessment snapshot schema validation failed: unsupported schema version",
    );
  }
  assertExactKeys(
    snapshot,
    ["schema_version", "generated_at", "preferred_report_ids", "reports"],
    "Tracked TavernKeeper assessment snapshot",
  );
  if (
    !isRfc3339DateTime(snapshot.generated_at) ||
    !Array.isArray(snapshot.preferred_report_ids) ||
    !Array.isArray(snapshot.reports)
  ) {
    throw new Error("Tracked TavernKeeper assessment snapshot is invalid");
  }
  const sources = activeGithubSourcesByRepositoryId(registry, {
    includeDelisted: true,
  });
  const reportIds = new Set();
  for (const entry of snapshot.reports) {
    assertExactKeys(
      entry,
      [...indexEntryKeys, ...storedEntryExtraKeys],
      "Tracked TavernKeeper assessment",
    );
    const indexEntry = Object.fromEntries(
      indexEntryKeys.map((key) => [key, entry[key]]),
    );
    const syntheticIndex = {
      schema_version: 5,
      generated_at: snapshot.generated_at,
      reports: [indexEntry],
    };
    assertIndexSchema(syntheticIndex);
    assertCanonicalIndexEntry(indexEntry);
    assertSourceIdentity(indexEntry, sources);
    if (reportIds.has(entry.report_id)) {
      throw new Error(
        "Tracked TavernKeeper assessment history has a duplicate report id",
      );
    }
    reportIds.add(entry.report_id);
    if (
      !isRfc3339DateTime(entry.assessed_at) ||
      !versionPattern.test(entry.synthesis_policy_version) ||
      typeof entry.synthesis_model !== "string" ||
      entry.synthesis_model.trim() !== entry.synthesis_model ||
      entry.synthesis_model.length < 1 ||
      entry.synthesis_model.length > 200 ||
      ![
        "none",
        "malicious_or_compromised",
        "critical_exploitable_vulnerability",
        "mixed",
      ].includes(entry.danger_basis) ||
      !["model", "deterministic_fallback", "deterministic_regrade"].includes(
        entry.assessment_source,
      )
    ) {
      throw new Error("Tracked TavernKeeper synthesis identity is invalid");
    }
    validateStoredAssessmentShape(entry.assessment);
    const numericSynthesisPolicy = /^\d+$/u.test(entry.synthesis_policy_version)
      ? Number(entry.synthesis_policy_version)
      : Number.NaN;
    const legacyCoverageFloor =
      Number.isSafeInteger(numericSynthesisPolicy) &&
      numericSynthesisPolicy <= 4;
    if (
      legacyCoverageFloor &&
      entry.assessment.risk_level === "low" &&
      entry.coverage.javascript_analysis_status === "incomplete"
    ) {
      throw new Error(
        "Tracked TavernKeeper low-risk assessment has incomplete JavaScript coverage",
      );
    }
    if (
      legacyCoverageFloor &&
      entry.assessment.risk_level === "low" &&
      entry.coverage.metadata_only_candidates > 0
    ) {
      throw new Error(
        "Tracked TavernKeeper low-risk assessment has metadata-only evidence",
      );
    }
    if (
      (entry.assessment.risk_level === "high") !==
      (entry.danger_basis !== "none")
    ) {
      throw new Error("Tracked TavernKeeper danger basis is invalid");
    }
  }
  if (
    new Set(snapshot.preferred_report_ids).size !==
    snapshot.preferred_report_ids.length
  ) {
    throw new Error("Tracked TavernKeeper preferred report IDs are duplicate");
  }
  const preferredRepositories = new Set();
  for (const id of snapshot.preferred_report_ids) {
    const report = snapshot.reports.find((entry) => entry.report_id === id);
    if (!report) {
      throw new Error("Tracked TavernKeeper preferred report ID is unknown");
    }
    assertSupportedScannerPolicy(report);
    if (preferredRepositories.has(report.repository_id)) {
      throw new Error(
        "Tracked TavernKeeper preferred repositories are duplicate",
      );
    }
    preferredRepositories.add(report.repository_id);
  }
  return snapshot;
}

export async function readStoredReportIndex(path, registry) {
  const contents = await readFile(path, "utf8");
  return validateStoredReportIndex(JSON.parse(contents), registry);
}

export async function writeReportSummaries(index, outputPath) {
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  const temporaryPath = `${outputPath}.${process.pid}.${randomUUID()}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  let handle;
  try {
    handle = await open(temporaryPath, "wx");
    await handle.writeFile(serialized, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, outputPath);
  } catch (error) {
    await handle?.close();
    await unlink(temporaryPath).catch(() => {});
    throw error;
  }
}
