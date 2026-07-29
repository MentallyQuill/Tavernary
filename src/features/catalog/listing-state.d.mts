export interface ListingProject {
  listing_status: "active" | "quarantined" | "retired";
  listing_status_reason: string | null;
}

export interface ListingSource {
  status: "active" | "delisted";
  status_reason: "removed" | null;
}

export interface ListingSnapshot {
  source_health:
    "healthy" | "unavailable" | "identity-change" | "deleted" | "private";
}

export interface EffectiveListingState {
  public: boolean;
  reason: string | null;
}

export function effectiveListingState(input: {
  project: ListingProject;
  source: ListingSource;
  snapshot?: ListingSnapshot | null;
}): EffectiveListingState;
