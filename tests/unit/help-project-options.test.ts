import { expect, test } from "vitest";

import { mapHelpProjectOptions } from "@/app/help/report-project/page";

test("maps catalog projects to public Help options with a safe creator fallback", () => {
  expect(
    mapHelpProjectOptions([
      {
        id: "wandlight",
        name: "Wandlight",
        canonicalUrl: "https://github.com/example/wandlight",
        searchableText: "wandlight narration",
        attribution: { owner: { login: "example-owner" } },
      },
      {
        id: "plain-source",
        name: "Plain Source",
        canonicalUrl: "https://codeberg.org/example/plain-source",
        searchableText: "plain source",
        attribution: null,
      },
    ]),
  ).toEqual([
    {
      id: "wandlight",
      name: "Wandlight",
      creator: "example-owner",
      canonicalUrl: "https://github.com/example/wandlight",
      searchableText: "wandlight narration",
    },
    {
      id: "plain-source",
      name: "Plain Source",
      creator: "codeberg.org",
      canonicalUrl: "https://codeberg.org/example/plain-source",
      searchableText: "plain source",
    },
  ]);
});

test("excludes malformed and non-HTTPS catalog sources", () => {
  expect(
    mapHelpProjectOptions([
      {
        id: "valid-source",
        name: "Valid Source",
        canonicalUrl: "https://example.org/valid-source",
        searchableText: "valid source",
        attribution: null,
      },
      {
        id: "malformed-source",
        name: "Malformed Source",
        canonicalUrl: "not a URL",
        searchableText: "malformed source",
        attribution: null,
      },
      {
        id: "http-source",
        name: "HTTP Source",
        canonicalUrl: "http://example.org/http-source",
        searchableText: "http source",
        attribution: null,
      },
    ]),
  ).toEqual([
    {
      id: "valid-source",
      name: "Valid Source",
      creator: "example.org",
      canonicalUrl: "https://example.org/valid-source",
      searchableText: "valid source",
    },
  ]);
});
