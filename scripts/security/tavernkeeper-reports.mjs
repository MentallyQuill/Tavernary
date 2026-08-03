import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import Ajv from "ajv";

import reportIndexV1Schema from "../../data/schemas/tavernkeeper-report-index.schema.json" with { type: "json" };
import reportIndexV2Schema from "../../data/schemas/tavernkeeper-report-index.v2.schema.json" with { type: "json" };
import reportIndexV4Schema from "../../data/schemas/tavernkeeper-report-index.v4.schema.json" with { type: "json" };
import { fetchHardenedJson } from "./hardened-json-fetch.mjs";

export const TAVERNKEEPER_ORIGIN = "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX = "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL =
  "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION = "2";

const fullShaPattern = /^[0-9a-f]{40}$/u;
const reportIdPattern = /^[0-9a-f]{64}$/u;

const rfc3339DateTime =
  /^(?<year>\d{4})-(?<month>0[1-9]|1[0-2])-(?<day>0[1-9]|[12]\d|3[01])(?:T|t)(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d):(?<second>[0-5]\d|60)(?:\.\d+)?(?:Z|z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u;

function isLeapYear(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isRfc3339DateTime(value) {
  const match = rfc3339DateTime.exec(value);
  if (!match?.groups) {
    return false;
  }
  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const daysInMonth = [
    31,
    isLeapYear(year) ? 29 : 28,
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
  return day <= daysInMonth[month - 1];
}

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("date-time", {
  type: "string",
  validate: isRfc3339DateTime,
});
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
const validateV1Schema = ajv.compile(reportIndexV1Schema);
const validateV2Schema = ajv.compile(reportIndexV2Schema);
const validateV4Schema = ajv.compile(reportIndexV4Schema);

function schemaError(validateSchema) {
  const details = (validateSchema.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return new Error(
    `TavernKeeper report index schema validation failed: ${details}`,
  );
}

function assertSchema(index) {
  const validateSchema =
    index?.schema_version === 1
      ? validateV1Schema
      : index?.schema_version === 2
        ? validateV2Schema
        : index?.schema_version === 4
          ? validateV4Schema
          : null;
  if (!validateSchema) {
    throw new Error(
      "TavernKeeper report index schema validation failed: unsupported schema version",
    );
  }
  if (!validateSchema(index)) {
    throw schemaError(validateSchema);
  }
  if (index.schema_version === 1 && index.reports.length !== 0) {
    throw new Error(
      "TavernKeeper V1 report entries are not accepted during migration",
    );
  }
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function canonicalReportPath(report, schemaVersion) {
  const identity = `${TAVERNKEEPER_REPORTS_PATH_PREFIX}github/${report.repository_id}/${report.target_sha}/${report.scanner_policy_version}`;
  return schemaVersion === 4
    ? `${identity}/${report.report_version}/`
    : `${identity}/${report.mode}/${report.report_version}/`;
}

function assertSafeReportUrl(report, schemaVersion) {
  const reportUrl = report.report_url;
  let parsed;
  try {
    parsed = new URL(reportUrl);
  } catch {
    throw new Error("TavernKeeper report URL is invalid");
  }

  const canonicalPath = canonicalReportPath(report, schemaVersion);
  const canonicalUrl = `${TAVERNKEEPER_ORIGIN}${canonicalPath}`;
  if (
    reportUrl !== canonicalUrl ||
    parsed.href !== canonicalUrl ||
    parsed.protocol !== "https:" ||
    parsed.origin !== TAVERNKEEPER_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.pathname !== canonicalPath ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("TavernKeeper report URL is unsafe");
  }

  if (report.history_url !== undefined) {
    const canonicalHistoryUrl =
      `${TAVERNKEEPER_ORIGIN}${TAVERNKEEPER_REPORTS_PATH_PREFIX}` +
      `github/${report.repository_id}/history/`;
    if (report.history_url !== canonicalHistoryUrl) {
      throw new Error("TavernKeeper report history URL is unsafe");
    }
  }
}

function assertSafeSummary(report) {
  const values = [report.summary.headline, report.summary.detail];
  const unsafe = values.some(
    (value) =>
      value !== value.trim() ||
      /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/u.test(value),
  );
  if (unsafe) throw new Error("TavernKeeper report summary is unsafe");
}

function assertV4ReportCounts(report) {
  const counts = report.finding_counts;
  const severityTotal = sum(Object.values(counts.severity));
  const confidenceTotal = sum(Object.values(counts.confidence));
  const policyStatusTotal = sum(Object.values(counts.policy_status));
  const categoryTotal = sum(
    counts.categories.map((category) => category.count),
  );
  const reportableSeverityTotal = sum(
    Object.values(counts.reportable_severity),
  );
  const reviewConfidenceTotal =
    counts.confidence.high + counts.confidence.medium;
  const reviewSeverityTotal =
    counts.severity.critical + counts.severity.high + counts.severity.medium;
  const reportableSeverityWithinTotals = Object.entries(
    counts.reportable_severity,
  ).every(([severity, count]) => count <= counts.severity[severity]);
  const categoriesAreUniqueAndSorted = counts.categories.every(
    (category, index) =>
      index === 0 || counts.categories[index - 1].category < category.category,
  );
  if (
    counts.total !== counts.reportable + counts.informational ||
    counts.total !== severityTotal ||
    counts.total !== confidenceTotal ||
    counts.total !== policyStatusTotal ||
    counts.total !== categoryTotal ||
    counts.reportable !== counts.policy_status.reportable ||
    counts.informational !== counts.policy_status.informational ||
    counts.reportable !== reportableSeverityTotal ||
    counts.reportable > reviewConfidenceTotal ||
    counts.reportable > reviewSeverityTotal ||
    !reportableSeverityWithinTotals ||
    !categoriesAreUniqueAndSorted ||
    report.coverage.evidence_validated !== counts.total ||
    report.result !== (counts.reportable > 0 ? "red" : "teal")
  ) {
    throw new Error("TavernKeeper report finding totals do not match");
  }
}

function assertReportCounts(report, schemaVersion) {
  if (schemaVersion === 4) {
    assertV4ReportCounts(report);
    return;
  }
  const counts = report.finding_counts;
  const expectedTotal = sum(Object.values(counts.severity));
  const confidenceTotal = sum(Object.values(counts.confidence));
  const dispositionTotal = sum(Object.values(counts.disposition));
  const categoryTotal = sum(
    counts.categories.map((category) => category.count),
  );
  const actionableSeverityTotal = counts.actionable_severity
    ? sum(Object.values(counts.actionable_severity))
    : null;
  const actionableSeverityConsistent = counts.actionable_severity
    ? actionableSeverityTotal === counts.actionable &&
      counts.actionable_severity.critical <= counts.severity.critical &&
      counts.actionable_severity.high <= counts.severity.high &&
      counts.actionable_severity.medium <= counts.severity.medium
    : report.result === "green" || report.result === "yellow";
  const reviewSeverityTotal =
    counts.severity.critical + counts.severity.high + counts.severity.medium;
  const reviewConfidenceTotal =
    counts.confidence.high + counts.confidence.medium;
  const confirmedTotal = counts.disposition.confirmed;
  const actionableIntersectionConsistent = counts.actionable_severity
    ? counts.actionable >=
        Math.max(
          0,
          confirmedTotal +
            reviewSeverityTotal +
            reviewConfidenceTotal -
            2 * counts.total,
        ) &&
      counts.actionable <=
        Math.min(confirmedTotal, reviewSeverityTotal, reviewConfidenceTotal)
    : true;

  const dispositionConsistent =
    report.result === "green" || report.result === "yellow"
      ? counts.actionable === counts.disposition.active
      : counts.actionable <= counts.disposition.confirmed &&
        report.result === (counts.actionable > 0 ? "red" : "teal");

  if (
    counts.total !== expectedTotal ||
    counts.total !== confidenceTotal ||
    counts.total !== dispositionTotal ||
    counts.total !== categoryTotal ||
    !actionableSeverityConsistent ||
    !actionableIntersectionConsistent ||
    !dispositionConsistent
  ) {
    throw new Error("TavernKeeper report finding totals do not match");
  }
}

function assertReportSemantics(index) {
  const reportIds = new Set();
  const preferredIdentities = new Set();

  for (const report of index.reports) {
    if (
      !reportIdPattern.test(report.report_id) ||
      !fullShaPattern.test(report.target_sha)
    ) {
      throw new Error(
        "TavernKeeper report has an invalid immutable identifier",
      );
    }
    if (
      report.result !== "green" &&
      report.result !== "yellow" &&
      report.result !== "teal" &&
      report.result !== "red"
    ) {
      throw new Error("TavernKeeper report result is invalid");
    }
    assertSafeReportUrl(report, index.schema_version);
    assertReportCounts(report, index.schema_version);
    if (index.schema_version === 4) assertSafeSummary(report);

    if (reportIds.has(report.report_id)) {
      throw new Error(
        "TavernKeeper report index contains a duplicate report id",
      );
    }
    reportIds.add(report.report_id);

    const preferredIdentity = [
      report.repository_id,
      report.target_sha,
      report.scanner_policy_version,
    ].join("\u0000");
    if (preferredIdentities.has(preferredIdentity)) {
      throw new Error(
        "TavernKeeper report index contains a duplicate preferred identity",
      );
    }
    preferredIdentities.add(preferredIdentity);
  }
}

function registrySources(registry) {
  if (Array.isArray(registry)) {
    return registry;
  }
  if (Array.isArray(registry?.sources)) {
    return registry.sources;
  }
  throw new Error("TavernKeeper report registry is invalid");
}

function activeGithubSourcesByRepositoryId(registry) {
  const sources = new Map();
  for (const source of registrySources(registry)) {
    if (
      source?.type === "github" &&
      source.status === "active" &&
      Number.isSafeInteger(source.repository_id) &&
      source.repository_id > 0 &&
      typeof source.id === "string" &&
      typeof source.repository === "string"
    ) {
      if (sources.has(source.repository_id)) {
        throw new Error(
          "TavernKeeper report registry has duplicate active GitHub repository id",
        );
      }
      sources.set(source.repository_id, source);
    }
  }
  return sources;
}

function compareReports(left, right) {
  return (
    left.repository_id - right.repository_id ||
    left.target_sha.localeCompare(right.target_sha) ||
    left.scanner_policy_version.localeCompare(right.scanner_policy_version) ||
    (left.mode ?? "").localeCompare(right.mode ?? "") ||
    left.report_version - right.report_version
  );
}

export function validateReportIndex(index, registry) {
  assertSchema(index);
  assertReportSemantics(index);

  const sourcesByRepositoryId = activeGithubSourcesByRepositoryId(registry);
  const reports = index.reports
    .flatMap((report) => {
      const source = sourcesByRepositoryId.get(report.repository_id);
      if (!source) {
        return [];
      }
      if (
        report.source_id !== source.id ||
        report.repository !== source.repository
      ) {
        throw new Error(
          "TavernKeeper report identity does not match Tavernary",
        );
      }
      if (
        report.scanner_policy_version !==
        ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION
      ) {
        return [];
      }
      return [report];
    })
    .sort(compareReports);

  return {
    schema_version: index.schema_version,
    generated_at: index.generated_at,
    reports,
  };
}

export function validateStoredReportIndex(index, registry) {
  const validated = validateReportIndex(index, registry);
  if (!isDeepStrictEqual(index, validated)) {
    throw new Error(
      "Tracked TavernKeeper report summaries would be dropped or changed by validation",
    );
  }
  return validated;
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

function assertRedirectUrl(url) {
  if (
    url.protocol !== "https:" ||
    url.origin !== TAVERNKEEPER_ORIGIN ||
    url.username ||
    url.password ||
    url.port ||
    !url.pathname.startsWith(TAVERNKEEPER_REPORTS_PATH_PREFIX) ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "TavernKeeper report redirect has an invalid origin or path",
    );
  }
}

export async function fetchAndValidateTavernKeeperIndex(options = {}) {
  const index = await fetchHardenedJson({
    url: options.url ?? TAVERNKEEPER_REPORT_INDEX_URL,
    resourceLabel: "TavernKeeper report index",
    assertInitialUrl: assertInitialIndexUrl,
    assertRedirectUrl,
    timeoutMs: options.timeoutMs,
    dnsLookup: options.dnsLookup,
    requestImpl: options.requestImpl,
    fetchImpl: options.fetchImpl,
  });
  assertSchema(index);
  assertReportSemantics(index);
  return index;
}

export async function writeReportSummaries(index, outputPath) {
  const serialized = `${JSON.stringify(index, null, 2)}\n`;
  const temporaryPath = `${outputPath}.${process.pid}.tmp`;
  await mkdir(dirname(outputPath), { recursive: true });
  let handle;
  try {
    handle = await open(temporaryPath, "w");
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
