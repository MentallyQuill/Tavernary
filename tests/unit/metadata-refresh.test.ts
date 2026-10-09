import { expect, test } from "vitest";
import {
  metadataFingerprint,
  normalizeMetadataContent,
  selectMetadataRefresh,
  createMetadataCache,
  validateMetadataCache,
  metadataOutputDigest,
} from "../../scripts/automation/metadata-refresh.mjs";
import { operationFixture } from "../helpers/automation-fixtures";
const nowMs = Date.parse("2026-10-08T12:00:00Z");
const project = {
  id: "example-project",
  source_id: "github-42",
  name: "Example",
  kind: "extension",
  frontends: ["sillytavern"],
  listing_status: "active",
  metadata_status: "curated",
  summary: "Trusted current description",
  tags: [],
  metadata_policy: {
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  },
};
const evidence = {
  sourceId: "github-42",
  sourceIdentity: "github:42",
  provider: "github",
  headSha: "b".repeat(40),
  normalizedContent: normalizeMetadataContent({
    readme: "# Example\r\n\r\nUseful prompt tools.\r\n",
    description: "Tools",
  }),
  status: "ready" as const,
  public: true,
  observedAt: new Date(nowMs).toISOString(),
  policyVersion: "policy-1",
  vocabularyHash: "c".repeat(64),
};
const operation = operationFixture({
  identity: {
    kind: "metadata",
    subject: "source:github-42:example-project",
    inputDigest: "a".repeat(64),
    policyVersion: evidence.policyVersion,
  },
  expectedSha: null,
});
function cacheFor(record = project) {
  return createMetadataCache({ operation, record, ...evidence, nowMs });
}
test("unchanged normalized README and policy reuse the validated cache even after unrelated repository commits", () => {
  const cache = cacheFor();
  const result = selectMetadataRefresh({
    records: [project],
    evidence: [{ ...evidence, headSha: "d".repeat(40) }],
    cache: [cache],
    nowMs,
  });
  expect(result.sources).toHaveLength(0);
  expect(result.cached).toHaveLength(1);
});
test("normalization removes noise and line endings but preserves meaningful content and descriptions", () => {
  const input = {
    sourceId: evidence.sourceId,
    policyVersion: evidence.policyVersion,
    vocabularyHash: evidence.vocabularyHash,
  };
  const original = metadataFingerprint({
    ...input,
    normalizedContent: evidence.normalizedContent,
  });
  expect(
    metadataFingerprint({
      ...input,
      normalizedContent: normalizeMetadataContent({
        readme: "# Example\n\nUseful  prompt tools.\n<!-- timestamp -->",
        description: " Tools ",
      }),
    }),
  ).toBe(original);
  expect(
    metadataFingerprint({
      ...input,
      normalizedContent: normalizeMetadataContent({
        readme: "Changed purpose.",
        description: "Tools",
      }),
    }),
  ).not.toBe(original);
  expect(() =>
    normalizeMetadataContent({ readme: "x".repeat(1048577) }),
  ).toThrow();
});
test("manual fields are excluded independently, and changes to requested fields invalidate cache", () => {
  const manual = {
    ...project,
    metadata_policy: {
      summary: { mode: "manual" },
      tags: { mode: "automatic" },
    },
  };
  const result = selectMetadataRefresh({
    records: [manual],
    evidence: [evidence],
    cache: [cacheFor()],
    nowMs,
  });
  expect(result.sources[0].fields).toEqual(["tags"]);
  expect(metadataOutputDigest(manual, ["tags"])).toBe(
    metadataOutputDigest({ ...manual, summary: "A new manual description" }, [
      "tags",
    ]),
  );
  const fullyManual = {
    ...manual,
    metadata_policy: { summary: { mode: "manual" }, tags: { mode: "manual" } },
  };
  expect(
    selectMetadataRefresh({
      records: [fullyManual],
      evidence: [evidence],
      cache: [],
      nowMs,
    }).sources,
  ).toHaveLength(0);
});
test.each(["policy", "vocabulary", "identity", "output", "traits"])(
  "a changed %s cannot reuse an old cache",
  (change) => {
    const record = structuredClone(project);
    const changed = { ...evidence };
    if (change === "policy") changed.policyVersion = "policy-2";
    if (change === "vocabulary") changed.vocabularyHash = "e".repeat(64);
    if (change === "identity") changed.sourceIdentity = "github:43";
    if (change === "output") record.summary = "A replaced automatic summary";
    if (change === "traits") record.name = "Renamed";
    expect(
      selectMetadataRefresh({
        records: [record],
        evidence: [changed],
        cache: [cacheFor()],
        nowMs,
      }).sources,
    ).toHaveLength(1);
  },
);
test("source failures and non-public identities do not enter optional inference", () => {
  const failed = selectMetadataRefresh({
    records: [project],
    evidence: [
      { ...evidence, status: "failed" as const, normalizedContent: undefined },
    ],
    cache: [],
    nowMs,
  });
  expect(failed.sources).toHaveLength(0);
  expect(failed.pending).toHaveLength(1);
  expect(
    selectMetadataRefresh({
      records: [project],
      evidence: [{ ...evidence, public: false }],
      cache: [],
      nowMs,
    }).sources,
  ).toHaveLength(0);
});
test("the oldest pending records enter a bounded ten-source selection", () => {
  const records = Array.from({ length: 15 }, (_, index) => ({
    ...project,
    id: `project-${String(index).padStart(2, "0")}`,
  }));
  const selection = selectMetadataRefresh({
    records: records.reverse(),
    evidence: [evidence],
    cache: [],
    nowMs,
  });
  expect(selection.sources).toHaveLength(10);
  expect(selection.sources.map((value) => value.projectId)).toEqual(
    [...records]
      .map((value) => value.id)
      .sort()
      .slice(0, 10),
  );
  expect(selection.remaining).toBe(5);
});
test("cache sidecars reject extra fields, substituted operation identity and malformed timestamps", () => {
  const cache = cacheFor();
  expect(() => validateMetadataCache({ ...cache, injected: true })).toThrow();
  expect(() =>
    createMetadataCache({
      operation,
      record: { ...project, source_id: "github-99" },
      ...evidence,
      nowMs,
    }),
  ).toThrow();
  expect(() =>
    validateMetadataCache({ ...cache, observedAt: "invalid" }),
  ).toThrow();
});
