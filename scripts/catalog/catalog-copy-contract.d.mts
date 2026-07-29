export type CatalogCopyMode = "preserve" | "synthesize";
export type CatalogCopyResultStatus =
  | "accepted-unchanged"
  | "accepted-with-light-edits"
  | "accepted-with-policy-rewrite";
export type CatalogCopyChangeReason =
  | "emoji-removed"
  | "whitespace-normalized"
  | "punctuation-corrected"
  | "obvious-spelling-corrected"
  | "graphic-wording-neutralized"
  | "slur-removed"
  | "discriminatory-framing-neutralized";
export type CatalogCopyPolicySignal = "none" | "catalog-policy-rewrite";

export interface CatalogCopyResult {
  summary: string;
  result: CatalogCopyResultStatus;
  change_reasons: readonly CatalogCopyChangeReason[];
  policy_signal: CatalogCopyPolicySignal;
}

export interface CatalogCopyValidationContext {
  mode: CatalogCopyMode;
  submittedSummary: string;
  protectedTerms: readonly string[];
}

export type CatalogCopyValidation =
  { valid: true } | { valid: false; errors: string[]; repairHint: string };

export const CATALOG_COPY_CONTRACT_VERSION: 1;
export const CATALOG_COPY_RESULT_VALUES: readonly CatalogCopyResultStatus[];
export const CATALOG_COPY_CHANGE_REASON_VALUES: readonly CatalogCopyChangeReason[];
export const CATALOG_COPY_POLICY_SIGNAL_VALUES: readonly CatalogCopyPolicySignal[];

export function validateCatalogCopyResult(
  output: unknown,
  context: CatalogCopyValidationContext,
): CatalogCopyValidation;

export function validateCatalogCopyMetadata(
  metadata: unknown,
): CatalogCopyValidation;

export function catalogCopyInstructions(): string;
