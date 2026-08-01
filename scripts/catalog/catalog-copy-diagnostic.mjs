const failurePhaseLabels = new Map([
  ["initial-provider", "Initial provider call"],
  ["repair-provider", "Repair provider call"],
  ["repaired-output-validation", "Repaired output validation"],
]);

const failureCodeLabels = new Map([
  ["provider-timeout", "Provider timeout"],
  ["provider-rate-limited", "Provider rate limit"],
  ["provider-server-error", "Provider server error"],
  ["provider-authentication-failed", "Provider authentication failure"],
  ["provider-request-failed", "Provider request failure"],
  ["provider-network-error", "Provider network error"],
  ["provider-response-invalid", "Provider response invalid"],
  ["provider-model-mismatch", "Provider model mismatch"],
  ["provider-error", "Provider error"],
  ["copy-output-invalid", "Copy output invalid"],
]);

const providerCodes = new Set([
  "provider-timeout",
  "provider-rate-limited",
  "provider-server-error",
  "provider-authentication-failed",
  "provider-request-failed",
  "provider-network-error",
  "provider-response-invalid",
  "provider-model-mismatch",
]);

const diagnosticCodes = new Set([
  "tool-calls-present",
  "content-parts-invalid",
  "content-missing",
  "json-invalid",
  "json-not-object",
  "unsupported_value:temperature",
]);

function record(value) {
  return value && typeof value === "object" ? value : {};
}

export function providerCopyReviewDiagnostic(
  error,
  failurePhase,
  attemptCount,
) {
  const details = record(error);
  return {
    failure_phase: ["initial-provider", "repair-provider"].includes(
      failurePhase,
    )
      ? failurePhase
      : "initial-provider",
    failure_code: providerCodes.has(details.code)
      ? details.code
      : "provider-error",
    diagnostic_code: diagnosticCodes.has(details.diagnosticCode)
      ? details.diagnosticCode
      : null,
    attempt_count: attemptCount === 2 ? 2 : 1,
    latency_ms:
      Number.isSafeInteger(details.latencyMs) && details.latencyMs >= 0
        ? details.latencyMs
        : null,
  };
}

export function invalidOutputCopyReviewDiagnostic() {
  return {
    failure_phase: "repaired-output-validation",
    failure_code: "copy-output-invalid",
    diagnostic_code: null,
    attempt_count: 2,
    latency_ms: null,
  };
}

export function normalizeCopyReviewDiagnostic(value) {
  if (
    !value ||
    typeof value !== "object" ||
    !failurePhaseLabels.has(value.failure_phase) ||
    !failureCodeLabels.has(value.failure_code) ||
    (value.diagnostic_code !== null &&
      !diagnosticCodes.has(value.diagnostic_code)) ||
    ![1, 2].includes(value.attempt_count) ||
    (value.latency_ms !== null &&
      (!Number.isSafeInteger(value.latency_ms) || value.latency_ms < 0))
  ) {
    return null;
  }
  return {
    failure_phase: value.failure_phase,
    failure_code: value.failure_code,
    diagnostic_code: value.diagnostic_code,
    attempt_count: value.attempt_count,
    latency_ms: value.latency_ms,
  };
}

export function renderCopyReviewDiagnosticSummary(values) {
  if (!Array.isArray(values) || values.length === 0) return "";
  const rows = values.map((value, index) => {
    const diagnostic = normalizeCopyReviewDiagnostic(value);
    if (!diagnostic) {
      return `| Review ${index + 1} | Copy review unavailable | Copy review unavailable | None | Unknown | Unknown |`;
    }
    return [
      `| Review ${index + 1}`,
      failurePhaseLabels.get(diagnostic.failure_phase),
      failureCodeLabels.get(diagnostic.failure_code),
      diagnostic.diagnostic_code ?? "None",
      diagnostic.attempt_count,
      diagnostic.latency_ms === null
        ? "Unknown"
        : `${diagnostic.latency_ms.toLocaleString("en-US")} ms`,
    ]
      .join(" | ")
      .concat(" |");
  });
  return [
    "## Catalog-copy review diagnostic",
    "",
    "| Review | Failure phase | Failure code | Diagnostic | Attempts | Latency |",
    "| --- | --- | --- | --- | ---: | ---: |",
    ...rows,
    "",
  ].join("\n");
}
