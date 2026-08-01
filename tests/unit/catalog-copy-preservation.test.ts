import { expect, test, vi } from "vitest";

import { preserveCatalogSummary } from "../../scripts/catalog/catalog-copy-preservation.mjs";
import { EnrichmentProviderError } from "../../scripts/catalog/enrichment-provider.mjs";

test("validates a first-pass owner summary without a failure diagnostic", async () => {
  const copySummary = vi.fn().mockResolvedValue({
    summary: "Owner wording stays exact.",
    result: "accepted-unchanged",
    change_reasons: [],
    policy_signal: "none",
  });

  await expect(
    preserveCatalogSummary({
      authorityType: "repository-owner",
      submittedSummary: "Owner wording stays exact.",
      copySummary,
    }),
  ).resolves.toMatchObject({
    reviewStatus: "validated",
    publishedSummary: "Owner wording stays exact.",
    diagnostic: null,
  });
  expect(copySummary).toHaveBeenCalledOnce();
});

test("validates a repaired owner summary without a failure diagnostic", async () => {
  const copySummary = vi
    .fn()
    .mockResolvedValueOnce({ status: "accepted", summary: "" })
    .mockResolvedValueOnce({
      summary: "Owner wording stays exact.",
      result: "accepted-unchanged",
      change_reasons: [],
      policy_signal: "none",
    });

  const result = await preserveCatalogSummary({
    authorityType: "repository-owner",
    submittedSummary: "Owner wording stays exact.",
    copySummary,
  });

  expect(result).toMatchObject({ reviewStatus: "validated", diagnostic: null });
  expect(copySummary).toHaveBeenCalledTimes(2);
  expect(copySummary.mock.calls[1]?.[0]).toMatchObject({
    repair: { reasonCode: "output-invalid" },
  });
});

test("degrades verified manual owner copy after one invalid repair", async () => {
  const copySummary = vi
    .fn()
    .mockResolvedValueOnce({
      status: "accepted",
      summary: "",
    })
    .mockResolvedValueOnce({
      status: "accepted",
      summary: "",
    });

  await expect(
    preserveCatalogSummary({
      authorityType: "repository-owner",
      submittedSummary: "Owner wording stays exact.",
      protectedTerms: ["Owner"],
      copySummary,
    }),
  ).resolves.toEqual({
    mode: "preserve",
    reviewStatus: "unavailable",
    reasonCode: "copy-review-unavailable",
    diagnostic: {
      failure_phase: "repaired-output-validation",
      failure_code: "copy-output-invalid",
      diagnostic_code: null,
      attempt_count: 2,
      latency_ms: null,
    },
    submittedSummary: "Owner wording stays exact.",
    publishedSummary: "Owner wording stays exact.",
    copyResult: null,
  });
  expect(copySummary).toHaveBeenCalledTimes(2);
  expect(copySummary.mock.calls[1]?.[0]).toMatchObject({
    repair: {
      reasonCode: "output-invalid",
      message: expect.stringContaining(
        "copy result must contain exactly the required properties",
      ),
    },
  });
});

test("degrades verified manual owner copy when provider transport fails", async () => {
  const copySummary = vi.fn().mockRejectedValue(
    new EnrichmentProviderError("provider-timeout", null, {
      latencyMs: 120_000,
    }),
  );

  await expect(
    preserveCatalogSummary({
      authorityType: "tavernary-staff",
      submittedSummary: "Staff wording stays exact.",
      copySummary,
    }),
  ).resolves.toMatchObject({
    reviewStatus: "unavailable",
    reasonCode: "copy-review-unavailable",
    diagnostic: {
      failure_phase: "initial-provider",
      failure_code: "provider-timeout",
      diagnostic_code: null,
      attempt_count: 1,
      latency_ms: 120_000,
    },
    submittedSummary: "Staff wording stays exact.",
    publishedSummary: "Staff wording stays exact.",
    copyResult: null,
  });
  expect(copySummary).toHaveBeenCalledOnce();
});

test("records a failed provider repair after invalid copy output", async () => {
  const copySummary = vi
    .fn()
    .mockResolvedValueOnce({ status: "accepted", summary: "" })
    .mockRejectedValueOnce(
      new EnrichmentProviderError("provider-rate-limited", null, {
        latencyMs: 450,
      }),
    );

  await expect(
    preserveCatalogSummary({
      authorityType: "repository-owner",
      submittedSummary: "Owner wording stays exact.",
      copySummary,
    }),
  ).resolves.toMatchObject({
    reviewStatus: "unavailable",
    diagnostic: {
      failure_phase: "repair-provider",
      failure_code: "provider-rate-limited",
      diagnostic_code: null,
      attempt_count: 2,
      latency_ms: 450,
    },
  });
  expect(copySummary).toHaveBeenCalledTimes(2);
});
