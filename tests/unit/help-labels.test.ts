import { expect, test } from "vitest";

import {
  categoryLabels,
  HELP_LABEL_DEFINITIONS,
} from "../../scripts/help/help-labels.mjs";
import type { PublicHelpManifest } from "../../src/features/help/help-manifest.mjs";

function manifest(
  requestKind: PublicHelpManifest["request_kind"],
  category: string,
) {
  return {
    schema_version: 1,
    request_kind: requestKind,
    origin: { page_url: "/help/", site_revision: "test" },
    payload: { category },
  } as PublicHelpManifest;
}

test("owns the complete public Help label inventory", () => {
  expect(Object.keys(HELP_LABEL_DEFINITIONS)).toEqual([
    "project-information",
    "website-bug",
    "kit-report",
    "other",
    "project-owner-request",
    "safety-review",
    "rights-review",
    "accessibility",
    "bug",
    "question",
    "duplicate-candidate",
  ]);
  expect(Object.isFrozen(HELP_LABEL_DEFINITIONS)).toBe(true);
  for (const definition of Object.values(HELP_LABEL_DEFINITIONS)) {
    expect(definition).toEqual({
      color: expect.stringMatching(/^[0-9a-f]{6}$/),
      description: expect.any(String),
    });
  }
});

test.each([
  [
    manifest("project-report", "unsafe-or-malicious"),
    ["project-information", "safety-review"],
  ],
  [
    manifest("project-report", "rights-concern"),
    ["project-information", "rights-review"],
  ],
  [
    manifest("website-bug", "accessibility"),
    ["website-bug", "bug", "accessibility"],
  ],
  [
    manifest("kit-report", "duplicate-kit"),
    ["kit-report", "duplicate-candidate"],
  ],
])(
  "maps a normalized Help manifest to exact triage labels",
  (input, expected) => {
    expect(categoryLabels(input)).toEqual(expected);
  },
);

test.each([
  [
    manifest("project-report", "duplicate-or-wrong-listing"),
    ["project-information", "duplicate-candidate"],
  ],
  [
    manifest("kit-report", "unsafe-or-malicious-included-project"),
    ["kit-report", "safety-review"],
  ],
  [
    manifest("kit-report", "author-or-attribution-concern"),
    ["kit-report", "rights-review"],
  ],
  [manifest("other-help", "using-tavernary"), ["other", "question"]],
  [manifest("other-help", "suggest-improvement"), ["other"]],
])(
  "maps secondary public Help categories without extra labels",
  (input, expected) => {
    expect(categoryLabels(input)).toEqual(expected);
  },
);
