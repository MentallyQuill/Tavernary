import { describe, expect, test } from "vitest";

import {
  automaticMetadataPolicy,
  manualMetadataPolicy,
  metadataFieldsToGenerate,
  resolveRequestedMetadata,
} from "../../scripts/catalog/metadata-policy.mjs";

function recordWith(
  summary: "automatic" | "manual",
  tags: "automatic" | "manual",
) {
  return {
    metadata_policy: {
      summary: { mode: summary },
      tags: { mode: tags },
    },
  };
}

test.each([
  ["automatic", "automatic", ["summary", "tags"]],
  ["manual", "automatic", ["tags"]],
  ["automatic", "manual", ["summary"]],
  ["manual", "manual", []],
] as const)(
  "%s/%s generates only automatic fields",
  (summary, tags, expected) => {
    expect(metadataFieldsToGenerate(recordWith(summary, tags))).toEqual(
      expected,
    );
  },
);

test("constructs exact automatic and trusted manual policy objects", () => {
  expect(automaticMetadataPolicy()).toEqual({ mode: "automatic" });
  expect(manualMetadataPolicy("repository-owner")).toEqual({
    mode: "manual",
    note: "Verified repository owner selection.",
  });
  expect(manualMetadataPolicy("tavernary-staff")).toEqual({
    mode: "manual",
    note: "Trusted Tavernary editor selection.",
  });
  expect(() => manualMetadataPolicy("community-submitter")).toThrow(
    "Manual metadata requires repository-owner or tavernary-staff authority",
  );
});

test("discards unauthorized manual values completely", () => {
  const result = resolveRequestedMetadata({
    request: {
      summary: {
        mode: "manual",
        value: "Community-written description that must not survive.",
        note: "User-supplied provenance",
      },
      tags: {
        mode: "manual",
        values: ["maintain-long-term-memory"],
        note: "User-supplied provenance",
      },
    },
    authority: { authorityType: "community-submitter" },
  });

  expect(result).toEqual({
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  });
  expect(JSON.stringify(result)).not.toContain("Community-written");
  expect(JSON.stringify(result)).not.toContain("maintain-long-term-memory");
  expect(JSON.stringify(result)).not.toContain("User-supplied");
});

describe.each([
  ["repository-owner", "Verified repository owner selection."],
  ["tavernary-staff", "Trusted Tavernary editor selection."],
] as const)("%s manual requests", (authorityType, note) => {
  test("preserves values and replaces untrusted provenance", () => {
    expect(
      resolveRequestedMetadata({
        request: {
          summary: {
            mode: "manual",
            value: "Owner-authored description.",
            note: "Do not preserve this note",
          },
          tags: {
            mode: "manual",
            values: ["maintain-long-term-memory"],
            note: "Do not preserve this note",
          },
        },
        authority: { authorityType },
      }),
    ).toEqual({
      summary: {
        mode: "manual",
        value: "Owner-authored description.",
        note,
      },
      tags: {
        mode: "manual",
        values: ["maintain-long-term-memory"],
        note,
      },
    });
  });
});

test("drops stray values from automatic requests", () => {
  expect(
    resolveRequestedMetadata({
      request: {
        summary: { mode: "automatic", value: "Ignore me." },
        tags: { mode: "automatic", values: ["ignore-me"] },
      },
      authority: { authorityType: "repository-owner" },
    }),
  ).toEqual({
    summary: { mode: "automatic" },
    tags: { mode: "automatic" },
  });
});
