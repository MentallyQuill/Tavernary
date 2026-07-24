import { expect, test, vi } from "vitest";

import {
  runEnrichmentBatch,
  selectEnrichmentRecords,
} from "../../scripts/catalog/enrich-readmes.mjs";

const githubRecord = (id: string, overrides = {}) => ({
  id,
  name: id,
  kind: "extension",
  summary: "Generic intake details.",
  metadata_status: "provisional",
  visibility: "published",
  frontends: [],
  source: { type: "github", repository: `Creator/${id}` },
  ...overrides,
});

test("selects a deterministic default batch of 20", () => {
  const records = Array.from({ length: 25 }, (_, index) =>
    githubRecord(`project-${String(25 - index).padStart(2, "0")}`),
  );

  const selected = selectEnrichmentRecords(records, {});
  expect(selected).toHaveLength(20);
  expect(selected.map((record) => record.id)).toEqual(
    Array.from(
      { length: 20 },
      (_, index) => `project-${String(index + 1).padStart(2, "0")}`,
    ),
  );
});

test("supports zero-based start indexes and explicit project IDs", () => {
  const records = [githubRecord("a"), githubRecord("b"), githubRecord("c")];
  expect(
    selectEnrichmentRecords(records, { startIndex: 1, batchSize: 1 })[0].id,
  ).toBe("b");
  expect(
    selectEnrichmentRecords(records, { projectId: "c", batchSize: 20 })[0].id,
  ).toBe("c");
});

test("force includes curated records but excludes non-GitHub sources", () => {
  const records = [
    githubRecord("curated", { metadata_status: "curated" }),
    githubRecord("disabled", { visibility: "disabled" }),
    githubRecord("url-source", {
      source: { type: "url", url: "https://example.test/project" },
    }),
  ];
  expect(
    selectEnrichmentRecords(records, { force: true }).map(
      (record) => record.id,
    ),
  ).toEqual(["curated"]);
});

test("batch execution records fallback, skip, and failure outcomes", async () => {
  const write = vi.fn(async () => {});
  const result = await runEnrichmentBatch({
    records: [githubRecord("fallback"), githubRecord("broken")],
    snapshots: {
      fallback: { repository: {}, readme: { found: false } },
      broken: { repository: {}, readme: { found: true } },
    },
    vocabularies: {
      primaryFunctions: [{ id: "uncategorized" }],
      capabilities: [],
    },
    provider: { generate: vi.fn().mockRejectedValue(new Error("offline")) },
    loadSource: async (record) =>
      record.id === "fallback"
        ? {
            repositoryDescription: null,
            readmeText: null,
            readmePath: null,
            readmeRef: null,
          }
        : {
            repositoryDescription: "source",
            readmeText: null,
            readmePath: null,
            readmeRef: null,
          },
    writeRecord: write,
    now: "2026-07-24T00:00:00.000Z",
  });

  expect(result.fallback).toEqual(["fallback"]);
  expect(result.failed).toEqual([{ id: "broken", reason: "offline" }]);
  expect(write).toHaveBeenCalledTimes(1);
});

test("rejects unsupported modes", async () => {
  await expect(
    import("../../scripts/catalog/enrich-readmes.mjs").then(({ runCli }) =>
      runCli({ mode: "not-a-mode" } as never),
    ),
  ).rejects.toThrow("unsupported enrichment mode");
});
