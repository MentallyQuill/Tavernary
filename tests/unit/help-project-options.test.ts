import { expect, test } from "vitest";

import { mapHelpProjectOptions } from "@/app/help/report-project/page";
import { catalogSearchFields } from "../helpers/catalog-search-fields";

test("maps structured catalog search fields to public Help options", () => {
  const options = mapHelpProjectOptions([
    {
      id: "wandlight",
      name: "Wandlight",
      canonicalUrl: "https://github.com/example/wandlight",
      search: catalogSearchFields("Wandlight", {
        source: ["github MentallyQuill Directive"],
        tags: ["persistent memory"],
        maintainers: ["MentallyQuill"],
      }),
      attribution: { owner: { login: "example-owner" } },
    },
    {
      id: "plain-source",
      name: "Plain Source",
      canonicalUrl: "https://codeberg.org/example/plain-source",
      search: catalogSearchFields("Plain Source"),
      attribution: null,
    },
  ]);

  expect(options).toMatchObject([
    {
      id: "wandlight",
      name: "Wandlight",
      creator: "example-owner",
      canonicalUrl: "https://github.com/example/wandlight",
    },
    {
      id: "plain-source",
      name: "Plain Source",
      creator: "codeberg.org",
      canonicalUrl: "https://codeberg.org/example/plain-source",
    },
  ]);
  expect(options[0].searchText).toContain("mentallyquill");
  expect(options[0].searchText).toContain("persistent memory");
  expect(options[0].searchText).toContain("github mentallyquill directive");
});

test("excludes malformed and non-HTTPS catalog sources", () => {
  expect(
    mapHelpProjectOptions([
      {
        id: "valid-source",
        name: "Valid Source",
        canonicalUrl: "https://example.org/valid-source",
        search: catalogSearchFields("Valid Source"),
        attribution: null,
      },
      {
        id: "malformed-source",
        name: "Malformed Source",
        canonicalUrl: "not a URL",
        search: catalogSearchFields("Malformed Source"),
        attribution: null,
      },
      {
        id: "http-source",
        name: "HTTP Source",
        canonicalUrl: "http://example.org/http-source",
        search: catalogSearchFields("HTTP Source"),
        attribution: null,
      },
    ]),
  ).toEqual([
    {
      id: "valid-source",
      name: "Valid Source",
      creator: "example.org",
      canonicalUrl: "https://example.org/valid-source",
      searchText: "valid source",
    },
  ]);
});
