import { expect, test } from "vitest";

import { effectiveListingState } from "@/features/catalog/listing-state.mjs";

const listingCases = [
  ["active", "active", "healthy", true, null],
  ["retired", "active", "healthy", false, "retired"],
  ["quarantined", "active", "healthy", false, "safety-review"],
  ["active", "delisted", "healthy", false, "removed"],
  ["active", "active", "identity-change", false, "identity-change"],
  ["active", "active", "deleted", false, "deleted"],
  ["active", "active", "private", false, "private"],
  ["active", "active", "unavailable", true, null],
] as const;

test.each(listingCases)(
  "%s card on %s source with %s health",
  (listing, sourceStatus, health, visible, reason) => {
    expect(
      effectiveListingState({
        project: {
          listing_status: listing,
          listing_status_reason:
            listing === "quarantined" ? "safety-review" : null,
        },
        source: {
          status: sourceStatus,
          status_reason: sourceStatus === "delisted" ? "removed" : null,
        },
        snapshot: { source_health: health },
      }),
    ).toEqual({ public: visible, reason });
  },
);

test("treats a missing snapshot as public for an active non-repository source", () => {
  expect(
    effectiveListingState({
      project: { listing_status: "active", listing_status_reason: null },
      source: { status: "active", status_reason: null },
      snapshot: null,
    }),
  ).toEqual({ public: true, reason: null });
});
