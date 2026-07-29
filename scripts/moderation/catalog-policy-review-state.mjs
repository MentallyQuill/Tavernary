export function applyCatalogPolicyReviewState(previous, result) {
  if (
    previous?.evidence_fingerprint === result.evidenceFingerprint &&
    previous.status !== "review-unavailable"
  ) {
    return { action: "noop", state: previous };
  }
  const unavailable = result.output.status === "review-unavailable";
  return {
    action: "write",
    state: {
      schema_version: 1,
      project_id: result.projectId,
      source_id: result.sourceId,
      source_identity: result.sourceIdentity,
      evidence_fingerprint: result.evidenceFingerprint,
      policy_version: result.policyVersion,
      status: result.output.status,
      category: result.output.category,
      reviewed_at: result.reviewedAt,
      retry: {
        attempts: unavailable ? (previous?.retry?.attempts ?? 0) + 1 : 0,
        last_failure_at: unavailable ? result.reviewedAt : null,
      },
      maintenance_issue_number:
        result.maintenanceIssueNumber ??
        (result.output.status === "review-suggested" &&
        previous?.evidence_fingerprint === result.evidenceFingerprint
          ? (previous.maintenance_issue_number ?? null)
          : null),
    },
  };
}
