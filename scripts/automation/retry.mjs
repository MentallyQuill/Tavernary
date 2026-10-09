import { createHash } from "node:crypto";

const RETRY_DELAYS_MS = [300_000, 900_000, 3_600_000, 21_600_000, 86_400_000];

export function planAutomationRetry({
  failure,
  transientAttempts,
  immediateAttempts,
  nowMs,
  retryAfterMs,
  jitterSeed,
}) {
  if (failure.kind === "superseded") {
    return {
      action: "recompute",
      nextEligibleAt: null,
      reasonCode: failure.reasonCode,
    };
  }
  if (failure.kind === "permanent") {
    return {
      action: "stop",
      nextEligibleAt: null,
      reasonCode: failure.reasonCode,
    };
  }
  if (
    !Number.isFinite(nowMs) ||
    !Number.isFinite(new Date(nowMs + 86_400_000).getTime())
  ) {
    return {
      action: "probe",
      nextEligibleAt: null,
      reasonCode: "invalid-retry-clock",
      incident: true,
    };
  }
  if (
    !Number.isSafeInteger(transientAttempts) ||
    transientAttempts < 0 ||
    !Number.isSafeInteger(immediateAttempts) ||
    immediateAttempts < 0
  ) {
    return {
      action: "probe",
      nextEligibleAt: new Date(nowMs + 86_400_000).toISOString(),
      reasonCode: "invalid-retry-state",
      incident: true,
    };
  }
  if (
    failure.kind === "configuration" ||
    (failure.kind === "unknown" && immediateAttempts >= 3)
  ) {
    return {
      action: "probe",
      nextEligibleAt: new Date(nowMs + 86_400_000).toISOString(),
      reasonCode: failure.reasonCode,
      incident: true,
    };
  }
  const providerDelay =
    typeof retryAfterMs === "number" &&
    Number.isFinite(retryAfterMs) &&
    retryAfterMs > 0
      ? Math.min(retryAfterMs, 86_400_000)
      : 0;
  const baseDelay = Math.max(
    RETRY_DELAYS_MS[Math.min(transientAttempts, 4)],
    providerDelay,
  );
  const ratio = jitterSeed
    ? createHash("sha256").update(jitterSeed).digest().readUInt32BE(0) /
      0xffffffff
    : 0;
  const delay = Math.min(86_400_000, Math.round(baseDelay * (1 + ratio * 0.1)));
  return {
    action: "retry",
    nextEligibleAt: new Date(nowMs + delay).toISOString(),
    reasonCode: failure.reasonCode,
  };
}
