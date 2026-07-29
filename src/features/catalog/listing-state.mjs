const HIDDEN_SOURCE_HEALTH = new Set(["identity-change", "deleted", "private"]);

export function effectiveListingState({ project, source, snapshot }) {
  if (project.listing_status !== "active") {
    return {
      public: false,
      reason:
        project.listing_status_reason ??
        project.listing_status ??
        "quarantined",
    };
  }
  if (source.status !== "active") {
    return {
      public: false,
      reason: source.status_reason ?? source.status ?? "removed",
    };
  }
  if (snapshot && HIDDEN_SOURCE_HEALTH.has(snapshot.source_health)) {
    return { public: false, reason: snapshot.source_health };
  }
  return { public: true, reason: null };
}
