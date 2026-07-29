import { expect, test } from "vitest";
import { applyCatalogPolicyReviewState } from "../../scripts/moderation/catalog-policy-review-state.mjs";

function result(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "alpha",
    sourceIdentity: "github:owner/alpha",
    evidenceFingerprint: "a".repeat(64),
    policyVersion: "2026-07-29",
    output: { status: "clear", category: null, explanation: null },
    reviewedAt: "2026-07-29T12:00:00.000Z",
    ...overrides,
  };
}

test("writes clear state without source excerpts or reasoning", () => {
  const applied = applyCatalogPolicyReviewState(null, result());
  expect(applied).toMatchObject({
    action: "write",
    state: {
      status: "clear",
      retry: { attempts: 0, last_failure_at: null },
    },
  });
  expect(JSON.stringify(applied.state)).not.toMatch(
    /summary|explanation|readme|reasoning/iu,
  );
});

test("deduplicates successful fingerprints and retries unavailable output", () => {
  const clear = applyCatalogPolicyReviewState(null, result()).state;
  expect(applyCatalogPolicyReviewState(clear, result())).toEqual({
    action: "noop",
    state: clear,
  });
  const unavailable = applyCatalogPolicyReviewState(
    null,
    result({
      output: {
        status: "review-unavailable",
        category: null,
        explanation: null,
      },
    }),
  ).state;
  expect(unavailable.retry.attempts).toBe(1);
  expect(
    applyCatalogPolicyReviewState(
      unavailable,
      result({
        output: {
          status: "review-unavailable",
          category: null,
          explanation: null,
        },
      }),
    ).state.retry.attempts,
  ).toBe(2);
  expect(
    applyCatalogPolicyReviewState(unavailable, result()).state.retry,
  ).toEqual({ attempts: 0, last_failure_at: null });
});

test("new evidence or policy versions produce new state", () => {
  const previous = applyCatalogPolicyReviewState(null, result()).state;
  expect(
    applyCatalogPolicyReviewState(
      previous,
      result({ evidenceFingerprint: "b".repeat(64) }),
    ).action,
  ).toBe("write");
});
