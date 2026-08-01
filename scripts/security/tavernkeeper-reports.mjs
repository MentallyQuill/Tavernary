import { lookup as defaultDnsLookup } from "node:dns/promises";
import { mkdir, open, rename, unlink } from "node:fs/promises";
import { dirname } from "node:path";

import Ajv from "ajv";

import reportIndexSchema from "../../data/schemas/tavernkeeper-report-index.schema.json" with { type: "json" };

export const TAVERNKEEPER_ORIGIN = "https://mentallyquill.github.io";
export const TAVERNKEEPER_REPORTS_PATH_PREFIX = "/TavernKeeper/reports/";
export const TAVERNKEEPER_REPORT_INDEX_URL =
  "https://mentallyquill.github.io/TavernKeeper/reports/index.json";
export const ACTIVE_TAVERNKEEPER_SCANNER_POLICY_VERSION = "1";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 10_000;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const fullShaPattern = /^[0-9a-f]{40}$/u;
const reportIdPattern = /^[0-9a-f]{64}$/u;

const ajv = new Ajv({ allErrors: true, strict: false });
ajv.addFormat("date-time", {
  type: "string",
  validate(value) {
    const parsed = new Date(value);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString() === value &&
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u.test(value)
    );
  },
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

function assertSafeReportUrl(reportUrl) {
  let parsed;
  try {
    parsed = new URL(reportUrl);
  } catch {
    throw new Error("TavernKeeper report URL is invalid");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.origin !== TAVERNKEEPER_ORIGIN ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    !parsed.pathname.startsWith(TAVERNKEEPER_REPORTS_PATH_PREFIX) ||
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
    assertSafeReportUrl(report.report_url);
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
      return [report];
    })
    .sort(compareReports);

  return {
    schema_version: index.schema_version,
    generated_at: index.generated_at,
    reports,
  };
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

function isPublicAddress(address) {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return !(
      !/^[0-9a-f:]+$/u.test(normalized) ||
      normalized === "::" ||
      normalized === "::1" ||
      normalized.startsWith("fe80:") ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("2001:db8:") ||
      normalized.startsWith("::ffff:127.") ||
      normalized.startsWith("::ffff:10.") ||
      normalized.startsWith("::ffff:192.168.") ||
      /^::ffff:172\.(?:1[6-9]|2\d|3[01])\./u.test(normalized)
    );
  }

  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return false;
  }
  const [first, second] = octets;
  return !(
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 192 && second === 88 && octets[2] === 99) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && octets[2] === 100) ||
    (first === 203 && second === 0 && octets[2] === 113)
  );
}

async function assertPublicDns(url, dnsLookup) {
  const records = await dnsLookup(url.hostname, { all: true });
  const addresses = Array.isArray(records) ? records : [records];
  if (
    addresses.length === 0 ||
    addresses.some((record) => !record || !isPublicAddress(record.address))
  ) {
    throw new Error("TavernKeeper report host does not resolve publicly");
  }
}

function contentLength(response) {
  const value = response.headers.get("content-length");
  if (value === null) {
    return null;
  }
  if (!/^\d+$/u.test(value)) {
    throw new Error("TavernKeeper report response size is invalid");
  }
  const length = Number(value);
  if (!Number.isSafeInteger(length) || length > MAX_RESPONSE_BYTES) {
    throw new Error("TavernKeeper report response exceeds the size limit");
  }
  return length;
}

async function readBoundedResponse(response) {
  contentLength(response);
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("TavernKeeper report response exceeds the size limit");
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function jsonContentType(response) {
  const contentType = response.headers.get("content-type") ?? "";
  return /^application\/json(?:\s*;|$)/iu.test(contentType);
}

export async function fetchAndValidateTavernKeeperIndex(options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const dnsLookup = options.dnsLookup ?? defaultDnsLookup;
  let current = new URL(options.url ?? TAVERNKEEPER_REPORT_INDEX_URL);
  assertInitialIndexUrl(current);
  let redirects = 0;

  while (true) {
    await assertPublicDns(current, dnsLookup);
    const response = await fetchImpl(current.toString(), {
      headers: { accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (redirectStatuses.has(response.status)) {
      if (redirects >= 2) {
        throw new Error("TavernKeeper report redirect limit exceeded");
      }
      const location = response.headers.get("location");
      if (!location) {
        throw new Error("TavernKeeper report redirect has no location");
      }
      current = new URL(location, current);
      assertRedirectUrl(current);
      redirects += 1;
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new Error(
        `TavernKeeper report index request returned HTTP ${response.status}`,
      );
    }
    if (!jsonContentType(response)) {
      throw new Error("TavernKeeper report index response is not JSON");
    }

    let index;
    try {
      index = JSON.parse(await readBoundedResponse(response));
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error("TavernKeeper report index response is not valid JSON");
      }
      throw error;
    }
    assertSchema(index);
    assertReportSemantics(index);
    return index;
  }
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
