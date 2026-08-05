import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const diagnostics = new Set([
  "response_schema",
  "public_text_references",
  "unknown_candidate_ids",
  "missing_candidate_ids",
  "count_mismatch",
  "interaction_chain_ids",
  "below_evidence_floor",
  "unsupported_escalation",
  "provider_response_invalid",
  "provider-timeout",
  "provider-rate-limited",
  "provider-server-error",
  "provider-authentication-failed",
  "provider-request-failed",
  "provider-network-error",
  "provider-model-mismatch",
  "synthesis-clock-invalid",
  "synthesis-boundary-failed",
]);
const digestPattern = /^[0-9a-f]{64}$/u;
const shaPattern = /^[0-9a-f]{40}$/u;
const policyPattern = /^[A-Za-z0-9._-]{1,64}$/u;
const repositoryPattern = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

function assertExactKeys(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  ) {
    throw new Error(`${label} has an invalid shape`);
  }
}

function isTimestamp(value) {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function quarantineIdentity(entry) {
  return `${entry.report_digest}\0${entry.synthesis_policy_version}`;
}

function validateLegacyImportState(value) {
  assertExactKeys(
    value,
    [
      "schema_version",
      "updated_at",
      "source_generated_at",
      "next_ticket",
      "pending",
    ],
    "Legacy TavernKeeper import state",
  );
  if (
    value.schema_version !== 1 ||
    !isTimestamp(value.updated_at) ||
    !isTimestamp(value.source_generated_at) ||
    !Number.isSafeInteger(value.next_ticket) ||
    value.next_ticket < 1 ||
    !Array.isArray(value.pending)
  ) {
    throw new Error("Legacy TavernKeeper import state is invalid");
  }
  for (const entry of value.pending) {
    assertExactKeys(
      entry,
      [
        "report_id",
        "repository_id",
        "target_sha",
        "ticket",
        "consecutive_failures",
        "total_failures",
        "not_before",
        "last_error_code",
        "last_failed_at",
        "chronic",
      ],
      "Legacy TavernKeeper pending import",
    );
    if (
      !digestPattern.test(entry.report_id) ||
      !Number.isSafeInteger(entry.repository_id) ||
      entry.repository_id < 1 ||
      !shaPattern.test(entry.target_sha) ||
      !Number.isSafeInteger(entry.ticket) ||
      entry.ticket < 1 ||
      !Number.isSafeInteger(entry.consecutive_failures) ||
      entry.consecutive_failures < 1 ||
      !Number.isSafeInteger(entry.total_failures) ||
      entry.total_failures < entry.consecutive_failures ||
      !isTimestamp(entry.not_before) ||
      ![
        "REPORT_FETCH_FAILED",
        "REPORT_IDENTITY_CONFLICT",
        "REPORT_SYNTHESIS_FAILED",
        "REPORT_TRACKING_FAILED",
      ].includes(entry.last_error_code) ||
      !isTimestamp(entry.last_failed_at) ||
      entry.chronic !== entry.consecutive_failures >= 5
    ) {
      throw new Error("Legacy TavernKeeper pending import is invalid");
    }
  }
  return value;
}

export function initialTavernKeeperImportState(
  at = "1970-01-01T00:00:00.000Z",
) {
  return validateTavernKeeperImportState({
    schema_version: 2,
    updated_at: at,
    quarantines: [],
  });
}

export function validateTavernKeeperImportState(value) {
  assertExactKeys(
    value,
    ["schema_version", "updated_at", "quarantines"],
    "TavernKeeper import state",
  );
  if (
    value.schema_version !== 2 ||
    !isTimestamp(value.updated_at) ||
    !Array.isArray(value.quarantines)
  ) {
    throw new Error("TavernKeeper import state is invalid");
  }

  let priorIdentity = null;
  for (const entry of value.quarantines) {
    assertExactKeys(
      entry,
      [
        "report_id",
        "report_digest",
        "repository_id",
        "repository",
        "target_sha",
        "synthesis_policy_version",
        "diagnostic",
        "first_failed_at",
        "last_failed_at",
        "attempts",
      ],
      "TavernKeeper report quarantine",
    );
    const identity = quarantineIdentity(entry);
    if (
      !digestPattern.test(entry.report_id) ||
      entry.report_id !== entry.report_digest ||
      !Number.isSafeInteger(entry.repository_id) ||
      entry.repository_id < 1 ||
      typeof entry.repository !== "string" ||
      !repositoryPattern.test(entry.repository) ||
      !shaPattern.test(entry.target_sha) ||
      typeof entry.synthesis_policy_version !== "string" ||
      !policyPattern.test(entry.synthesis_policy_version) ||
      !diagnostics.has(entry.diagnostic) ||
      !isTimestamp(entry.first_failed_at) ||
      !isTimestamp(entry.last_failed_at) ||
      Date.parse(entry.first_failed_at) > Date.parse(entry.last_failed_at) ||
      !Number.isSafeInteger(entry.attempts) ||
      entry.attempts < 1 ||
      (priorIdentity !== null && identity <= priorIdentity)
    ) {
      throw new Error("TavernKeeper report quarantine is invalid");
    }
    priorIdentity = identity;
  }
  return value;
}

export async function readTavernKeeperImportState(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return value?.schema_version === 1
      ? validateLegacyImportState(value)
      : validateTavernKeeperImportState(value);
  } catch (error) {
    if (error?.code === "ENOENT") return initialTavernKeeperImportState();
    throw error;
  }
}

export function migrateTavernKeeperImportState(value, index, at) {
  if (value?.schema_version === 2)
    return validateTavernKeeperImportState(value);
  const legacy = validateLegacyImportState(value);
  if (!isTimestamp(at) || !Array.isArray(index?.reports)) {
    throw new Error("TavernKeeper import migration input is invalid");
  }
  const entries = new Map(
    index.reports.map((entry) => [entry.report_id, entry]),
  );
  const quarantines = legacy.pending
    .filter(
      ({ last_error_code }) => last_error_code === "REPORT_SYNTHESIS_FAILED",
    )
    .flatMap((pending) => {
      const entry = entries.get(pending.report_id);
      if (
        entry === undefined ||
        entry.repository_id !== pending.repository_id ||
        entry.target_sha !== pending.target_sha
      ) {
        return [];
      }
      return [
        {
          report_id: entry.report_id,
          report_digest: entry.report_digest,
          repository_id: entry.repository_id,
          repository: entry.repository,
          target_sha: entry.target_sha,
          synthesis_policy_version: "1",
          diagnostic: "provider_response_invalid",
          first_failed_at: pending.last_failed_at,
          last_failed_at: pending.last_failed_at,
          attempts: pending.total_failures,
        },
      ];
    })
    .sort((left, right) =>
      quarantineIdentity(left).localeCompare(quarantineIdentity(right)),
    );
  return validateTavernKeeperImportState({
    schema_version: 2,
    updated_at: at,
    quarantines,
  });
}

export function quarantineTavernKeeperReport(
  stateInput,
  entry,
  synthesisPolicyVersion,
  diagnostic,
  at,
) {
  const state = validateTavernKeeperImportState(stateInput);
  const identity = `${entry.report_digest}\0${synthesisPolicyVersion}`;
  const existing = state.quarantines.find(
    (quarantine) => quarantineIdentity(quarantine) === identity,
  );
  const next = {
    report_id: entry.report_id,
    report_digest: entry.report_digest,
    repository_id: entry.repository_id,
    repository: entry.repository,
    target_sha: entry.target_sha,
    synthesis_policy_version: synthesisPolicyVersion,
    diagnostic,
    first_failed_at: existing?.first_failed_at ?? at,
    last_failed_at: at,
    attempts: (existing?.attempts ?? 0) + 1,
  };
  return validateTavernKeeperImportState({
    schema_version: 2,
    updated_at: at,
    quarantines: [
      ...state.quarantines.filter(
        (quarantine) => quarantineIdentity(quarantine) !== identity,
      ),
      next,
    ].sort((left, right) =>
      quarantineIdentity(left).localeCompare(quarantineIdentity(right)),
    ),
  });
}

export function removeTavernKeeperQuarantine(
  stateInput,
  reportDigest,
  synthesisPolicyVersion,
  at,
) {
  const state = validateTavernKeeperImportState(stateInput);
  const identity = `${reportDigest}\0${synthesisPolicyVersion}`;
  const quarantines = state.quarantines.filter(
    (entry) => quarantineIdentity(entry) !== identity,
  );
  return validateTavernKeeperImportState({
    ...state,
    updated_at:
      quarantines.length === state.quarantines.length ? state.updated_at : at,
    quarantines,
  });
}

export function reportSynthesisIncidentKey(
  reportDigest,
  synthesisPolicyVersion,
) {
  if (
    !digestPattern.test(reportDigest) ||
    typeof synthesisPolicyVersion !== "string" ||
    !policyPattern.test(synthesisPolicyVersion)
  ) {
    throw new Error("TavernKeeper synthesis incident identity is invalid");
  }
  return createHash("sha256")
    .update(
      JSON.stringify([
        "tavernary-synthesis",
        reportDigest,
        synthesisPolicyVersion,
      ]),
    )
    .digest("hex");
}
