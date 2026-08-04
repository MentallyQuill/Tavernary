import { readFile } from "node:fs/promises";

const importErrorCodes = new Set([
  "REPORT_FETCH_FAILED",
  "REPORT_IDENTITY_CONFLICT",
  "REPORT_SYNTHESIS_FAILED",
  "REPORT_TRACKING_FAILED",
]);
const retryMinutes = [5, 30, 120, 360];
const digestPattern = /^[0-9a-f]{64}$/u;
const shaPattern = /^[0-9a-f]{40}$/u;

function assertExactKeys(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    JSON.stringify(Object.keys(value).sort()) !==
      JSON.stringify([...keys].sort())
  )
    throw new Error(`${label} has an invalid shape`);
}

function isTimestamp(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

export function initialTavernKeeperImportState(
  at = "1970-01-01T00:00:00.000Z",
) {
  return {
    schema_version: 1,
    updated_at: at,
    source_generated_at: at,
    next_ticket: 1,
    pending: [],
  };
}

export function validateTavernKeeperImportState(value) {
  assertExactKeys(
    value,
    [
      "schema_version",
      "updated_at",
      "source_generated_at",
      "next_ticket",
      "pending",
    ],
    "TavernKeeper import state",
  );
  if (
    value.schema_version !== 1 ||
    !isTimestamp(value.updated_at) ||
    !isTimestamp(value.source_generated_at) ||
    !Number.isSafeInteger(value.next_ticket) ||
    value.next_ticket < 1 ||
    !Array.isArray(value.pending)
  )
    throw new Error("TavernKeeper import state is invalid");

  const reportIds = new Set();
  const tickets = new Set();
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
      "TavernKeeper pending import",
    );
    if (
      !digestPattern.test(entry.report_id) ||
      !Number.isSafeInteger(entry.repository_id) ||
      entry.repository_id < 1 ||
      !shaPattern.test(entry.target_sha) ||
      !Number.isSafeInteger(entry.ticket) ||
      entry.ticket < 1 ||
      !Number.isSafeInteger(entry.consecutive_failures) ||
      entry.consecutive_failures < 0 ||
      !Number.isSafeInteger(entry.total_failures) ||
      entry.total_failures < entry.consecutive_failures ||
      (entry.not_before !== null && !isTimestamp(entry.not_before)) ||
      (entry.last_error_code !== null &&
        !importErrorCodes.has(entry.last_error_code)) ||
      (entry.last_failed_at !== null && !isTimestamp(entry.last_failed_at)) ||
      entry.chronic !== entry.consecutive_failures >= 5 ||
      entry.ticket >= value.next_ticket ||
      reportIds.has(entry.report_id) ||
      tickets.has(entry.ticket)
    )
      throw new Error("TavernKeeper pending import is invalid");
    if (
      entry.consecutive_failures === 0 &&
      (entry.not_before !== null ||
        entry.last_error_code !== null ||
        entry.last_failed_at !== null)
    )
      throw new Error("Fresh TavernKeeper import cannot retain failure state");
    if (
      entry.consecutive_failures > 0 &&
      (entry.not_before === null ||
        entry.last_error_code === null ||
        entry.last_failed_at === null)
    )
      throw new Error("Failed TavernKeeper import lacks retry state");
    reportIds.add(entry.report_id);
    tickets.add(entry.ticket);
  }
  return {
    ...value,
    pending: [...value.pending].sort(
      (left, right) => left.ticket - right.ticket,
    ),
  };
}

export async function readTavernKeeperImportState(path) {
  try {
    return validateTavernKeeperImportState(
      JSON.parse(await readFile(path, "utf8")),
    );
  } catch (error) {
    if (error?.code === "ENOENT") return initialTavernKeeperImportState();
    throw error;
  }
}

export function blankPendingImport(entry, ticket) {
  return {
    report_id: entry.report_id,
    repository_id: entry.repository_id,
    target_sha: entry.target_sha,
    ticket,
    consecutive_failures: 0,
    total_failures: 0,
    not_before: null,
    last_error_code: null,
    last_failed_at: null,
    chronic: false,
  };
}

export function rotatePendingImport(stateInput, entryInput, errorCode, at) {
  const state = validateTavernKeeperImportState(stateInput);
  if (!importErrorCodes.has(errorCode) || !isTimestamp(at))
    throw new Error("TavernKeeper import failure is invalid");
  const entry = state.pending.find(
    ({ report_id }) => report_id === entryInput.report_id,
  );
  if (!entry) throw new Error("TavernKeeper import failure is not queued");
  if (state.next_ticket >= Number.MAX_SAFE_INTEGER)
    throw new Error("TavernKeeper import ticket space is exhausted");
  const consecutiveFailures = entry.consecutive_failures + 1;
  const delay =
    retryMinutes[Math.min(consecutiveFailures, retryMinutes.length) - 1];
  const notBefore = new Date(Date.parse(at) + delay * 60 * 1_000).toISOString();
  return validateTavernKeeperImportState({
    ...state,
    updated_at: at,
    next_ticket: state.next_ticket + 1,
    pending: [
      ...state.pending.filter(({ report_id }) => report_id !== entry.report_id),
      {
        ...entry,
        ticket: state.next_ticket,
        consecutive_failures: consecutiveFailures,
        total_failures: entry.total_failures + 1,
        not_before: notBefore,
        last_error_code: errorCode,
        last_failed_at: at,
        chronic: consecutiveFailures >= 5,
      },
    ],
  });
}
