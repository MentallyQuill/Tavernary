const CONFIGURATION_DIAGNOSTICS = new Set([
  "provider-authentication-failed",
  "publisher-authentication-failed",
  "provider-configuration-invalid",
  "provider-model-mismatch",
  "budget-exhausted",
]);

const TRANSIENT_DIAGNOSTICS = new Set([
  "provider-timeout",
  "provider-network-error",
  "provider-rate-limited",
  "provider-server-error",
]);

export const AUTOMATION_FAILURE_REASON_KINDS = Object.freeze({
  ...Object.fromEntries(
    [...CONFIGURATION_DIAGNOSTICS].map((code) => [code, "configuration"]),
  ),
  ...Object.fromEntries(
    [...TRANSIENT_DIAGNOSTICS].map((code) => [code, "transient"]),
  ),
  "authorization-lost": "permanent",
  "validation-failed": "permanent",
  "input-superseded": "superseded",
  "authentication-unavailable": "configuration",
  "provider-unavailable": "transient",
  "workflow-skipped": "transient",
  "workflow-timeout": "transient",
  "workflow-cancelled": "transient",
  "unclassified-failure": "unknown",
});
export const AUTOMATION_FAILURE_REASON_CODES = Object.freeze(
  Object.keys(AUTOMATION_FAILURE_REASON_KINDS),
);

export function classifyAutomationFailure(input = {}) {
  if (input.authorizationLost === true) {
    return { kind: "permanent", reasonCode: "authorization-lost" };
  }
  if (
    Array.isArray(input.validationErrors) &&
    input.validationErrors.length > 0
  ) {
    return { kind: "permanent", reasonCode: "validation-failed" };
  }
  if (input.superseded === true) {
    return { kind: "superseded", reasonCode: "input-superseded" };
  }
  if (CONFIGURATION_DIAGNOSTICS.has(input.diagnosticCode)) {
    return { kind: "configuration", reasonCode: input.diagnosticCode };
  }
  if (TRANSIENT_DIAGNOSTICS.has(input.diagnosticCode)) {
    return { kind: "transient", reasonCode: input.diagnosticCode };
  }
  if (input.httpStatus === 401 || input.httpStatus === 403) {
    return { kind: "configuration", reasonCode: "authentication-unavailable" };
  }
  if (input.httpStatus === 429) {
    return { kind: "transient", reasonCode: "provider-rate-limited" };
  }

  if (input.httpStatus >= 500 && input.httpStatus <= 599) {
    return { kind: "transient", reasonCode: "provider-unavailable" };
  }

  if (input.conclusion === "skipped") {
    return { kind: "transient", reasonCode: "workflow-skipped" };
  }

  if (input.conclusion === "timed_out") {
    return { kind: "transient", reasonCode: "workflow-timeout" };
  }

  return input.conclusion === "cancelled"
    ? { kind: "transient", reasonCode: "workflow-cancelled" }
    : { kind: "unknown", reasonCode: "unclassified-failure" };
}
