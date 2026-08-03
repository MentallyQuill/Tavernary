import {
  TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
  validateTavernaryAssessment,
} from "./tavernkeeper-assessment-contract.mjs";

function safeRepairMessage(error) {
  const message = error instanceof Error ? error.message : "invalid output";
  return message
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069<>]/gu, " ")
    .slice(0, 300);
}

function modelFromMetadata(metadata, provider) {
  const model = metadata?.requestedModel ?? provider?.configuration?.model;
  if (
    typeof model !== "string" ||
    model.trim() !== model ||
    model.length < 1 ||
    model.length > 200
  ) {
    throw new Error("Tavernary synthesis model identity is invalid");
  }
  return model;
}

export async function synthesizeTavernKeeperReport(report, options) {
  const provider = options?.provider;
  if (!provider || typeof provider.generate !== "function") {
    throw new Error("Tavernary synthesis provider is required");
  }
  const maximumAttempts = options.maxAttempts ?? 3;
  if (!Number.isSafeInteger(maximumAttempts) || maximumAttempts < 1) {
    throw new Error("Tavernary synthesis attempt limit is invalid");
  }
  let repair;
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const generated = await provider.generate({ report, repair });
      const assessment = validateTavernaryAssessment(generated.output, report);
      const now = options.now?.() ?? new Date();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error("Tavernary synthesis completion time is invalid");
      }
      return {
        report_id: report.report_id,
        target_sha: report.target_sha,
        assessed_at: now.toISOString(),
        synthesis_policy_version: TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
        synthesis_model: modelFromMetadata(generated.metadata, provider),
        assessment,
      };
    } catch (error) {
      lastError = error;
      repair = safeRepairMessage(error);
    }
  }
  throw new Error(
    `Tavernary synthesis failed after ${maximumAttempts === 3 ? "three" : maximumAttempts} attempts`,
    { cause: lastError },
  );
}
