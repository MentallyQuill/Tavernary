import { expect, test, vi } from "vitest";
import { reviewCatalogPolicy } from "../../scripts/moderation/review-catalog-policy.mjs";

const project = {
  id: "alpha",
  name: "Alpha",
  kind: "extension",
  summary: "Summary.",
  source_id: "github-42",
};
const source = {
  id: "github-42",
  type: "github",
  repository: "Owner/Alpha",
};
const snapshot = {
  repository: { head_sha: "a".repeat(40) },
};

test("reviews bounded published evidence and returns durable state", async () => {
  const provider = {
    review: vi.fn(async () => ({
      status: "clear",
      category: null,
      explanation: null,
    })),
  };
  const result = await reviewCatalogPolicy({
    project,
    source,
    snapshot,
    provider,
    loadSource: async () => ({
      status: "ready",
      readmeText: "README evidence",
      repositoryDescription: "Repository description",
    }),
    now: "2026-07-29T12:00:00.000Z",
  });
  expect(result.status).toBe("clear");
  expect(result.state).toMatchObject({
    project_id: "alpha",
    status: "clear",
  });
  expect(provider.review).toHaveBeenCalledWith(
    expect.objectContaining({
      readme: "README evidence",
      repositoryDescription: "Repository description",
    }),
  );
});

test("provider and evidence failures remain non-blocking and retryable", async () => {
  const result = await reviewCatalogPolicy({
    project,
    source,
    snapshot,
    provider: { review: vi.fn(async () => Promise.reject(new Error("raw"))) },
    loadSource: async () => ({ status: "ready", readmeText: "evidence" }),
    now: "2026-07-29T12:00:00.000Z",
  });
  expect(result).toMatchObject({
    status: "review-unavailable",
    state: { retry: { attempts: 1 } },
  });
  expect(JSON.stringify(result.state)).not.toContain("raw");
});

test("skips an already successful evidence fingerprint", async () => {
  const first = await reviewCatalogPolicy({
    project,
    source,
    snapshot,
    provider: {
      review: async () => ({
        status: "clear",
        category: null,
        explanation: null,
      }),
    },
    loadSource: async () => ({ status: "ready", readmeText: "evidence" }),
    now: "2026-07-29T12:00:00.000Z",
  });
  const second = await reviewCatalogPolicy({
    project,
    source,
    snapshot,
    previous: first.state,
    provider: { review: vi.fn() },
  });
  expect(second).toEqual({ status: "skipped", state: first.state });
});
