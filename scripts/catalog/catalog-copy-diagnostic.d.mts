export type CopyReviewFailurePhase =
  "initial-provider" | "repair-provider" | "repaired-output-validation";

export type CopyReviewFailureCode =
  | import("./enrichment-provider.mjs").ProviderErrorCode
  | "provider-error"
  | "copy-output-invalid";

export type CopyReviewDiagnosticCode =
  | "tool-calls-present"
  | "content-parts-invalid"
  | "content-missing"
  | "json-invalid"
  | "json-not-object"
  | "unsupported_value:temperature";

export interface CopyReviewDiagnostic {
  failure_phase: CopyReviewFailurePhase;
  failure_code: CopyReviewFailureCode;
  diagnostic_code: CopyReviewDiagnosticCode | null;
  attempt_count: 1 | 2;
  latency_ms: number | null;
}

export function providerCopyReviewDiagnostic(
  error: unknown,
  failurePhase: "initial-provider" | "repair-provider",
  attemptCount: 1 | 2,
): CopyReviewDiagnostic;

export function normalizeCopyReviewDiagnostic(
  value: unknown,
): CopyReviewDiagnostic | null;

export function renderCopyReviewDiagnosticSummary(
  values: readonly unknown[],
): string;
