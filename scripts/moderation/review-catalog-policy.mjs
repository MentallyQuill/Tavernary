import { CATALOG_POLICY_VERSION } from "../../src/features/catalog/catalog-policy.mjs";
import { loadEnrichmentSource } from "../catalog/enrichment-source.mjs";
import {
  createPolicyEvidenceFingerprint,
  validateCatalogPolicyReviewOutput,
} from "./catalog-policy-review-contract.mjs";
import { applyCatalogPolicyReviewState } from "./catalog-policy-review-state.mjs";

function sourceIdentity(source) {
  if (["github", "codeberg"].includes(source?.type)) {
    return `${source.type}:${source.repository.toLocaleLowerCase()}`;
  }
  return `url:${source?.url ?? ""}`;
}

function evidenceHead(snapshot) {
  return (
    snapshot?.repository?.head_sha ?? snapshot?.observed_at ?? "unavailable"
  );
}

export async function reviewCatalogPolicy(input) {
  const policyVersion = input.policyVersion ?? CATALOG_POLICY_VERSION;
  const identity = sourceIdentity(input.source);
  const fingerprint = createPolicyEvidenceFingerprint({
    projectId: input.project.id,
    sourceId: input.source.id,
    headSha: evidenceHead(input.snapshot),
    policyVersion,
  });
  if (
    input.previous?.evidence_fingerprint === fingerprint &&
    input.previous.status !== "review-unavailable"
  ) {
    return { status: "skipped", state: input.previous };
  }
  let output;
  let source = null;
  try {
    source = await (input.loadSource ?? loadEnrichmentSource)(
      input.project,
      input.source,
      input.snapshot,
      input.sourceOptions,
    );
    if (!source || !["ready", "description-only"].includes(source.status)) {
      throw new Error("evidence-unavailable");
    }
    const raw = await input.provider.review({
      project: {
        id: input.project.id,
        name: input.project.name,
        kind: input.project.kind,
        summary: input.project.summary,
        source_identity: identity,
      },
      policyVersion,
      readme: source.readmeText ?? "",
      repositoryDescription: source.repositoryDescription ?? "",
    });
    const validated = validateCatalogPolicyReviewOutput(raw);
    if (!validated.valid) throw new Error("output-invalid");
    output = validated.value;
  } catch {
    output = {
      status: "review-unavailable",
      category: null,
      explanation: null,
    };
  }
  const reviewedAt = new Date(input.now ?? Date.now()).toISOString();
  const applied = applyCatalogPolicyReviewState(input.previous ?? null, {
    projectId: input.project.id,
    sourceId: input.source.id,
    sourceIdentity: identity,
    evidenceFingerprint: fingerprint,
    policyVersion,
    output,
    reviewedAt,
    maintenanceIssueNumber: input.maintenanceIssueNumber,
  });
  return {
    status: output.status,
    output,
    state: applied.state,
    source,
    evidenceFingerprint: fingerprint,
  };
}
