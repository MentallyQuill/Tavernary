export type ProjectReportCategory =
  | "incorrect-information"
  | "source-moved-or-unavailable"
  | "duplicate-or-wrong-listing"
  | "unsafe-or-malicious"
  | "abusive-or-inappropriate"
  | "rights-concern"
  | "other-listing-concern";

export type WebsiteBugCategory =
  | "search-filter-sort"
  | "navigation-link"
  | "display-layout-theme"
  | "form-submission-handoff"
  | "kit-builder-catalog-interaction"
  | "accessibility"
  | "performance-loading"
  | "other-website-behavior";

export type KitReportCategory =
  | "compatibility-problem"
  | "unsafe-or-malicious-included-project"
  | "abusive-or-inappropriate-content"
  | "broken-removed-or-unavailable-project"
  | "misleading-title-or-description"
  | "duplicate-kit"
  | "author-or-attribution-concern"
  | "other-kit-concern";

export type OtherHelpCategory =
  | "using-tavernary"
  | "existing-request"
  | "suggest-improvement"
  | "documentation-policy"
  | "other";

export const PROJECT_REPORT_CATEGORIES: readonly ProjectReportCategory[];
export const WEBSITE_BUG_CATEGORIES: readonly WebsiteBugCategory[];
export const KIT_REPORT_CATEGORIES: readonly KitReportCategory[];
export const OTHER_HELP_CATEGORIES: readonly OtherHelpCategory[];

export interface HelpOrigin {
  page_url: string;
  site_revision: string;
}

export interface HelpEnvelope<K extends string, P> {
  schema_version: 1;
  request_kind: K;
  origin: HelpOrigin;
  payload: P;
}

export interface ProjectReportPayload {
  project_id: string;
  canonical_source: string;
  category: ProjectReportCategory;
  report: string;
  requested_outcome: string | null;
  evidence: string | null;
}

export interface WebsiteBugPayload {
  category: WebsiteBugCategory;
  page_url: string;
  actual_behavior: string;
  expected_behavior: string;
  reproduction_steps: string;
  browser: string | null;
  device: string | null;
  additional_context: string | null;
}

export interface KitReportPayload {
  kit_id: string;
  canonical_share_url: string;
  kit_revision: string;
  category: KitReportCategory;
  affected_project_ids: string[];
  details: string;
  evidence: string | null;
}

export interface OtherHelpPayload {
  category: OtherHelpCategory;
  subject: string;
  description: string;
  relevant_url: string | null;
}

export type PublicHelpManifest =
  | HelpEnvelope<"project-report", ProjectReportPayload>
  | HelpEnvelope<"website-bug", WebsiteBugPayload>
  | HelpEnvelope<"kit-report", KitReportPayload>
  | HelpEnvelope<"other-help", OtherHelpPayload>;

export type HelpManifestValidation =
  | { valid: true; manifest: PublicHelpManifest }
  | { valid: false; errors: string[] };

export function normalizeHelpManifest(value: unknown): HelpManifestValidation;
export function serializeHelpManifest(manifest: object): string;
