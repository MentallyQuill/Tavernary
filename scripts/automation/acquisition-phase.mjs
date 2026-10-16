const safeAcquisitionPhases = [
  "operation-records",
  "observe-source",
  "source-setup",
  "source-repository-request",
  "source-readme-prepare",
  "source-readme-request",
  "source-normalize",
  "budget-guard",
  "provider-config",
  "provider-input",
  "provider-review",
  "provider-output",
  "acquisition-output",
];

export function isAcquisitionPhase(phase) {
  return typeof phase === "string" && safeAcquisitionPhases.includes(phase);
}

export function markAcquisitionPhase(target, phase) {
  try {
    if (!isAcquisitionPhase(phase)) return;
    const callback = target?.onAcquisitionPhase;
    if (typeof callback === "function") callback(phase);
  } catch {
    return;
  }
}
