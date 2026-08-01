import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";
import { isDeepStrictEqual } from "node:util";

import Ajv from "ajv";

import reportIndexSchema from "../../data/schemas/tavernkeeper-report-index.schema.json" with { type: "json" };
import { fetchHardenedJson } from "./hardened-json-fetch.mjs";

export const TAVERNKEEPER_ORIGIN = "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX = "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL =
  "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION = "1";

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
const validateSchema = ajv.compile(reportIndexSchema);

function schemaError() {
  const details = (validateSchema.errors ?? [])
    .map((error) => `${error.instancePath || "/"} ${error.message}`)
    .join("; ");
  return new Error(
    `TavernKeeper report index schema validation failed: ${details}`,
  );
}

function assertSchema(index) {
  if (!validateSchema(index)) {
    throw schemaError();
  }
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function canonicalReportPath(report) {
  return `${TAVERNKEEPER_REPORTS_PATH_PREFIX}github/${report.repository_id}/${report.target_sha}/${report.scanner_policy_version}/${report.mode}/${report.report_version}/`;
}

function assertSafeReportUrl(report) {
  const reportUrl = report.report_url;
  let parsed;
  try {
    parsed = new URL(reportUrl);
  } catch {
    throw new Error("TavernKeeper report URL is invalid");
  }

  const canonicalPath = canonicalReportPath(report);
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
}

function assertReportCounts(report) {
  const counts = report.finding_counts;
  const expectedTotal = sum(Object.values(counts.severity));
  const confidenceTotal = sum(Object.values(counts.confidence));
  const dispositionTotal = sum(Object.values(counts.disposition));
  const categoryTotal = sum(
    counts.categories.map((category) => category.count),
  );

  if (
    counts.total !== expectedTotal ||
    counts.total !== confidenceTotal ||
    counts.total !== dispositionTotal ||
    counts.total !== categoryTotal ||
    counts.actionable !== counts.disposition.active
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
    if (report.result !== "green" && report.result !== "yellow") {
      throw new Error("TavernKeeper report result is invalid");
    }
    assertSafeReportUrl(report);
    assertReportCounts(report);

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
    left.mode.localeCompare(right.mode) ||
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
