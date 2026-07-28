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
