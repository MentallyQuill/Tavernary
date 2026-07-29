export const CATALOG_POLICY_VERSION: "2026-07-29";
export const CATALOG_POLICY_ROUTE: "/catalog-policy/";
export const CATALOG_DESCRIPTION_GUIDANCE: string;
export const CATALOG_EMOJI_REMOVED_NOTICE: string;

export const CATALOG_COPY_RESULTS: readonly [
  "accepted-unchanged",
  "accepted-with-light-edits",
  "accepted-with-policy-rewrite",
];
export type CatalogCopyResult = (typeof CATALOG_COPY_RESULTS)[number];

export const CATALOG_COPY_CHANGE_REASONS: readonly [
  "emoji-removed",
  "whitespace-normalized",
  "punctuation-corrected",
  "obvious-spelling-corrected",
  "graphic-wording-neutralized",
  "slur-removed",
  "discriminatory-framing-neutralized",
];
export type CatalogCopyChangeReason =
  (typeof CATALOG_COPY_CHANGE_REASONS)[number];

export const CATALOG_POLICY_REVIEW_CATEGORIES: readonly [
  "potential-hate-or-discrimination",
  "potential-sexual-content-involving-minors",
  "potential-other-catalog-policy-conflict",
];
export type CatalogPolicyReviewCategory =
  (typeof CATALOG_POLICY_REVIEW_CATEGORIES)[number];
