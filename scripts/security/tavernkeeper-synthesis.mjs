import { EnrichmentProviderError } from "../catalog/enrichment-provider.mjs";
import {
  TAVERNKEEPER_SYNTHESIS_POLICY_VERSION,
  TavernaryAssessmentValidationError,
  tavernKeeperAssessmentRequirements,
  validateTavernaryAssessment,
} from "./tavernkeeper-assessment-contract.mjs";

const transientProviderCodes = new Set([
  "provider-timeout",
  "provider-rate-limited",
  "provider-server-error",
  "provider-network-error",
]);

export class TavernKeeperSynthesisError extends Error {
  constructor(kind, diagnostic) {
    super(`TavernKeeper synthesis failed: ${kind} (${diagnostic})`);
    this.name = "TavernKeeperSynthesisError";
    this.kind = kind;
    this.diagnostic = diagnostic;
  }
}

function modelFromMetadata(metadata, provider) {
  const model = metadata?.requestedModel ?? provider?.configuration?.model;
  if (
    typeof model !== "string" ||
    model.trim() !== model ||
    model.length < 1 ||
    model.length > 200
  ) {
    throw new TavernKeeperSynthesisError(
      "provider-security",
      "provider-model-mismatch",
    );
  }
  return model;
}

function invalidRepair(error, report) {
  if (error instanceof TavernaryAssessmentValidationError) {
    return {
      diagnostic: error.diagnostic,
      ...error.repair,
    };
  }
  if (
    error instanceof EnrichmentProviderError &&
    error.code === "provider-response-invalid"
  ) {
    const requirements = tavernKeeperAssessmentRequirements(report);
    return {
      diagnostic: "provider_response_invalid",
      allowed_candidate_ids: requirements.allowed_candidate_ids,
      required_counts: requirements.required_counts,
    };
  }
  return null;
}

function providerFailure(error) {
  if (!(error instanceof EnrichmentProviderError)) return null;
  if (error.code === "provider-response-invalid") return null;
  return new TavernKeeperSynthesisError(
    transientProviderCodes.has(error.code)
      ? "provider-transient"
      : "provider-security",
    error.code,
  );
}

function bindRequiredCitations(output, report) {
  if (
    output === null ||
    typeof output !== "object" ||
    Array.isArray(output) ||
    !Array.isArray(output.cited_finding_ids) ||
    !output.cited_finding_ids.every((id) => typeof id === "string")
  ) {
    return output;
  }
  const citedFindingIds = [...output.cited_finding_ids];
  for (const id of tavernKeeperAssessmentRequirements(report)
    .required_candidate_ids) {
    if (!citedFindingIds.includes(id)) citedFindingIds.push(id);
  }
  return { ...output, cited_finding_ids: citedFindingIds };
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
  let suppliedRepair = null;
  let lastDiagnostic = "response_schema";
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    try {
      const generated = await provider.generate({ report, repair });
      const assessment = validateTavernaryAssessment(
        bindRequiredCitations(generated.output, report),
        report,
      );
      const now = options.now?.() ?? new Date();
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new TavernKeeperSynthesisError(
          "provider-security",
          "synthesis-clock-invalid",
        );
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
      if (error instanceof TavernKeeperSynthesisError) throw error;
      const classifiedProviderFailure = providerFailure(error);
      if (classifiedProviderFailure) throw classifiedProviderFailure;
      const nextRepair = invalidRepair(error, report);
      if (nextRepair === null) {
        throw new TavernKeeperSynthesisError(
          "provider-security",
          "synthesis-boundary-failed",
        );
      }
      lastDiagnostic = nextRepair.diagnostic;
      const serialized = JSON.stringify(nextRepair);
      if (attempt === maximumAttempts || serialized === suppliedRepair) {
        throw new TavernKeeperSynthesisError("invalid-output", lastDiagnostic);
      }
      suppliedRepair = serialized;
      repair = nextRepair;
    }
  }
  throw new TavernKeeperSynthesisError("invalid-output", lastDiagnostic);
}
