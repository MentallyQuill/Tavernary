import { expect, test } from "vitest";

import {
  providerCopyReviewDiagnostic,
  renderCopyReviewDiagnosticSummary,
} from "../../scripts/catalog/catalog-copy-diagnostic.mjs";

test("renders only allowlisted copy-review diagnostics", () => {
  const summary = renderCopyReviewDiagnosticSummary([
    {
      failure_phase: "initial-provider",
      failure_code: "provider-timeout",
      diagnostic_code: null,
      attempt_count: 1,
      latency_ms: 1250,
    },
  ]);

  expect(summary).toContain("Catalog-copy review diagnostic");
  expect(summary).toContain("Initial provider call");
  expect(summary).toContain("Provider timeout");
  expect(summary).toContain("1,250 ms");
});

test("sanitizes provider failures before reports or summaries", () => {
  const diagnostic = providerCopyReviewDiagnostic(
    {
      code: "provider-request-failed",
      diagnosticCode: "secret:prompt-text",
      latencyMs: 250,
      message: "do-not-publish",
    },
    "repair-provider",
    2,
  );

  expect(diagnostic).toEqual({
    failure_phase: "repair-provider",
    failure_code: "provider-request-failed",
    diagnostic_code: null,
    attempt_count: 2,
    latency_ms: 250,
  });
  expect(JSON.stringify(diagnostic)).not.toMatch(/secret|prompt|publish/iu);
  expect(renderCopyReviewDiagnosticSummary([diagnostic])).not.toMatch(
    /secret|prompt|publish/iu,
  );
});

test("renders malformed diagnostics as a fixed generic result", () => {
  const summary = renderCopyReviewDiagnosticSummary([
    { failure_code: "do-not-publish-secret" },
  ]);

  expect(summary).toContain("Copy review unavailable");
  expect(summary).not.toContain("do-not-publish-secret");
});

test("retains explicitly allowlisted provider diagnostics", () => {
  expect(
    providerCopyReviewDiagnostic(
      {
        code: "provider-response-invalid",
        diagnosticCode: "json-invalid",
        latencyMs: 20,
      },
      "initial-provider",
      1,
    ),
  ).toMatchObject({ diagnostic_code: "json-invalid", latency_ms: 20 });
});

test("does not render malformed diagnostic fields or extra secrets", () => {
  const summary = renderCopyReviewDiagnosticSummary([
    {
      failure_phase: "secret-phase",
      failure_code: "secret-code",
      diagnostic_code: "secret-diagnostic",
      attempt_count: 99,
      latency_ms: 8_675_309,
      message: "secret provider output",
    },
  ]);

  expect(summary).toContain("Copy review unavailable");
  expect(summary).not.toMatch(
    /secret-phase|secret-code|secret-diagnostic|8,675,309|provider output/iu,
  );
});
