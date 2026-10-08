// @vitest-environment node
import { expect, test } from "vitest";

import { classifyAutomationFailure } from "../../scripts/automation/failure.mjs";
import { planAutomationRetry } from "../../scripts/automation/retry.mjs";

test("cancellation remains recoverable after seventy-two hours", () => {
  const failure = classifyAutomationFailure({ conclusion: "cancelled" });
  const result = planAutomationRetry({
    failure,
    transientAttempts: 20,
    immediateAttempts: 0,
    nowMs: 72 * 60 * 60_000,
    jitterSeed: "source-42",
  });
  expect(failure.kind).toBe("transient");
  expect(result.action).toBe("retry");
  expect(Date.parse(result.nextEligibleAt!)).toBeGreaterThan(72 * 60 * 60_000);
});

test("lost authority overrides an infrastructure cancellation", () => {
  const failure = classifyAutomationFailure({
    conclusion: "cancelled",
    authorizationLost: true,
  });
  expect(failure).toEqual({
    kind: "permanent",
    reasonCode: "authorization-lost",
  });
});

function retryDecision(
  evidence: Parameters<typeof classifyAutomationFailure>[0],
  overrides: Partial<Parameters<typeof planAutomationRetry>[0]> = {},
) {
  return planAutomationRetry({
    failure: classifyAutomationFailure(evidence),
    transientAttempts: 0,
    immediateAttempts: 0,
    nowMs: 0,
    jitterSeed: "",
    ...overrides,
  });
}

test("deterministic validation failure stops mutation for unchanged input", () => {
  expect(
    retryDecision({ validationErrors: ["invalid-manifest"] }),
  ).toMatchObject({
    action: "stop",
    nextEligibleAt: null,
    reasonCode: "validation-failed",
  });
});

test("changed input supersedes the old operation instead of retrying it", () => {
  expect(retryDecision({ superseded: true, conclusion: "failure" })).toEqual({
    action: "recompute",
    nextEligibleAt: null,
    reasonCode: "input-superseded",
  });
});

test("transient recovery follows bounded delays without exhausting the operation", () => {
  for (const [attempts, delayMs] of [
    [0, 300_000],
    [1, 900_000],
    [2, 3_600_000],
    [3, 21_600_000],
    [4, 86_400_000],
    [20, 86_400_000],
  ]) {
    const decision = retryDecision(
      { conclusion: "cancelled" },
      { transientAttempts: attempts },
    );
    expect(Date.parse(decision.nextEligibleAt!)).toBe(delayMs);
    expect(decision.action).toBe("retry");
  }
});

test("rate-limited requests remain recoverable", () => {
  expect(classifyAutomationFailure({ httpStatus: 429 })).toEqual({
    kind: "transient",
    reasonCode: "provider-rate-limited",
  });
});

test("provider server failures remain infrastructure failures", () => {
  expect(classifyAutomationFailure({ httpStatus: 503 })).toEqual({
    kind: "transient",
    reasonCode: "provider-unavailable",
  });
});

test("skipped workflows do not become deterministic validation failures", () => {
  expect(classifyAutomationFailure({ conclusion: "skipped" })).toEqual({
    kind: "transient",
    reasonCode: "workflow-skipped",
  });
});

test("workflow timeout remains recoverable", () => {
  expect(classifyAutomationFailure({ conclusion: "timed_out" })).toEqual({
    kind: "transient",
    reasonCode: "workflow-timeout",
  });
});

test("provider credentials open a bounded dependency circuit", () => {
  expect(
    retryDecision({ diagnosticCode: "provider-authentication-failed" }),
  ).toEqual({
    action: "probe",
    nextEligibleAt: "1970-01-02T00:00:00.000Z",
    reasonCode: "provider-authentication-failed",
    incident: true,
  });
});

test("unknown failures become incidents after three immediate attempts", () => {
  expect(
    retryDecision({ conclusion: "failure" }, { immediateAttempts: 3 }),
  ).toEqual({
    action: "probe",
    nextEligibleAt: "1970-01-02T00:00:00.000Z",
    reasonCode: "unclassified-failure",
    incident: true,
  });
  expect(
    retryDecision({ conclusion: "failure" }, { immediateAttempts: 2 }).action,
  ).toBe("retry");
});

test("Retry-After delays respect provider limits without accepting malformed metadata", () => {
  for (const [retryAfterMs, expectedDelay] of [
    [600_000, 600_000],
    [172_800_000, 86_400_000],
    [-1, 300_000],
    [Number.NaN, 300_000],
    ["600000", 300_000],
  ] as const) {
    expect(
      Date.parse(
        retryDecision({ httpStatus: 429 }, { retryAfterMs }).nextEligibleAt!,
      ),
    ).toBe(expectedDelay);
  }
});

test("deterministic jitter spreads retries without violating delay bounds", () => {
  const input = { jitterSeed: "source-42" };
  const first = retryDecision({ conclusion: "cancelled" }, input);
  const again = retryDecision({ conclusion: "cancelled" }, input);
  expect(first.nextEligibleAt).toBe(again.nextEligibleAt);
  expect(Date.parse(first.nextEligibleAt!)).toBeGreaterThan(300_000);
  expect(Date.parse(first.nextEligibleAt!)).toBeLessThanOrEqual(330_000);
  const finalDelay = retryDecision(
    { conclusion: "cancelled" },
    { ...input, transientAttempts: 50 },
  );
  expect(Date.parse(finalDelay.nextEligibleAt!)).toBeLessThanOrEqual(
    86_400_000,
  );
});

test("existing provider outage diagnostics remain transient through worker handoff", () => {
  for (const diagnosticCode of [
    "provider-timeout",
    "provider-network-error",
    "provider-rate-limited",
    "provider-server-error",
  ]) {
    expect(
      classifyAutomationFailure({ diagnosticCode, conclusion: "failure" }),
    ).toEqual({
      kind: "transient",
      reasonCode: diagnosticCode,
    });
  }
});

test("configuration failures open circuits without rejecting source content", () => {
  for (const evidence of [
    { httpStatus: 401 },
    { httpStatus: 403 },
    { diagnosticCode: "publisher-authentication-failed" },
    { diagnosticCode: "provider-configuration-invalid" },
    { diagnosticCode: "provider-model-mismatch" },
    { diagnosticCode: "budget-exhausted" },
  ]) {
    expect(classifyAutomationFailure(evidence).kind).toBe("configuration");
    expect(retryDecision(evidence).action).toBe("probe");
  }
  const untrusted = classifyAutomationFailure({
    diagnosticCode: "secret provider response",
    conclusion: "failure",
  });
  expect(untrusted).toEqual({
    kind: "unknown",
    reasonCode: "unclassified-failure",
  });
});

test("invalid clocks do not dispatch retries or throw out of reconciliation", () => {
  for (const nowMs of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    8_640_000_000_000_000,
  ]) {
    expect(retryDecision({ conclusion: "cancelled" }, { nowMs })).toEqual({
      action: "probe",
      nextEligibleAt: null,
      reasonCode: "invalid-retry-clock",
      incident: true,
    });
  }
});

test("malformed retry counters open an incident instead of resetting allowance", () => {
  for (const overrides of [
    { transientAttempts: -1 },
    { transientAttempts: 1.5 },
    { immediateAttempts: Number.NaN },
    { immediateAttempts: -1 },
  ]) {
    expect(retryDecision({ conclusion: "failure" }, overrides)).toEqual({
      action: "probe",
      nextEligibleAt: "1970-01-02T00:00:00.000Z",
      reasonCode: "invalid-retry-state",
      incident: true,
    });
  }
});
