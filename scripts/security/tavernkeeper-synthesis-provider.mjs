import { createStructuredProviderTransport } from "../catalog/enrichment-provider.mjs";
import {
  TAVERNKEEPER_ASSESSMENT_JSON_SCHEMA,
  tavernKeeperAssessmentRequirements,
} from "./tavernkeeper-assessment-contract.mjs";

export function tavernKeeperSynthesisInstructions() {
  return `You are synthesizing validated assessments, not rescanning code. TavernKeeper has already run deterministic scanners and a file-centered contextual review over a SillyTavern AI community project at an exact Git commit.

Most projects in this open-source, often vibe-coded community are made in good faith, but rare projects have attempted API-key phishing or theft, trojan delivery, harmful payloads, and bot infection. Judge the validated evidence in that context without treating ordinary SillyTavern extension behavior or scanner keywords as malicious by themselves.

Produce a concise project-level assessment for nontechnical Tavernary visitors. Preserve material uncertainty and distinguish malicious evidence from ordinary security weaknesses. Cite only IDs listed in allowed_candidate_ids for every caution or concern. Observation IDs are never valid citations. Copy required_counts exactly. You may not lower the deterministic evidence floor. You may escalate beyond it only when two or more cited findings form a supported causal interaction, expressed in interaction_chains. Return only the required structured object.`;
}

function synthesisInput(input) {
  const report = input.report;
  return {
    task: "Synthesize the validated TavernKeeper V5 report into one Tavernary assessment.",
    repository: report.repository,
    target_sha: report.target_sha,
    report_id: report.report_id,
    scanner_policy_version: report.scanner_policy_version,
    contextual_review_policy_version: report.contextual_review_policy_version,
    ecosystem_context_version: report.ecosystem_context_version,
    counts: report.counts,
    ...tavernKeeperAssessmentRequirements(report),
    candidates: report.candidates.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      origin: candidate.origin,
      rule_id: candidate.rule_id,
      category: candidate.category,
      scanner_severity: candidate.scanner_severity,
      scanner_confidence: candidate.scanner_confidence,
      file_role: candidate.file_role,
      title: candidate.title,
      explanation: candidate.explanation,
    })),
    assessments: report.assessments.map((assessment) => ({
      candidate_id: assessment.candidate_id,
      disposition: assessment.disposition,
      impact: assessment.impact,
      exploitability: assessment.exploitability,
      confidence: assessment.confidence,
      recommended_risk: assessment.recommended_risk,
      layman_explanation: assessment.layman_explanation,
      developer_action: assessment.developer_action,
    })),
    observations: report.observations.map((observation) => ({
      related_candidate_ids: observation.related_candidate_ids,
      disposition: observation.disposition,
      impact: observation.impact,
      exploitability: observation.exploitability,
      confidence: observation.confidence,
      recommended_risk: observation.recommended_risk,
      title: observation.title,
      layman_explanation: observation.layman_explanation,
      developer_action: observation.developer_action,
    })),
    limitations: report.limitations,
    ...(input.repair ? { repair: input.repair } : {}),
  };
}

export function createTavernKeeperSynthesisProvider(options) {
  const transport = createStructuredProviderTransport(options);
  return {
    configuration: transport.configuration,
    async generate(input) {
      return transport.request({
        model: transport.configuration.model,
        messages: [
          { role: "system", content: tavernKeeperSynthesisInstructions() },
          { role: "user", content: JSON.stringify(synthesisInput(input)) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "tavernary_tavernkeeper_assessment_v1",
            strict: true,
            schema: TAVERNKEEPER_ASSESSMENT_JSON_SCHEMA,
          },
        },
      });
    },
  };
}
