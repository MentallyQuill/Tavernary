import { expect, test } from "vitest";

import {
  normalizeHelpManifest,
  serializeHelpManifest,
} from "@/features/help/help-manifest.mjs";
import {
  KIT_REPORT_CATEGORIES,
  OTHER_HELP_CATEGORIES,
  PROJECT_REPORT_CATEGORIES,
  WEBSITE_BUG_CATEGORIES,
} from "@/features/help/help-options";

const origin = {
  page_url: "/help/report-project/",
  site_revision: "abc123",
};

test("normalizes a project report without trusting whitespace", () => {
  expect(
    normalizeHelpManifest({
      schema_version: 1,
      request_kind: "project-report",
      origin,
      payload: {
        project_id: " example-project ",
        canonical_source: " https://github.com/Owner/Repo ",
        category: "incorrect-information",
        report: " The displayed frontend is wrong. ",
        requested_outcome: "",
        evidence: " https://github.com/Owner/Repo/blob/main/README.md ",
      },
    }),
  ).toEqual({
    valid: true,
    manifest: {
      schema_version: 1,
      request_kind: "project-report",
      origin,
      payload: {
        project_id: "example-project",
        canonical_source: "https://github.com/Owner/Repo",
        category: "incorrect-information",
        report: "The displayed frontend is wrong.",
        requested_outcome: null,
        evidence: "https://github.com/Owner/Repo/blob/main/README.md",
      },
    },
  });
});

test("normalizes every public Help request kind", () => {
  const cases = [
    {
      value: {
        schema_version: 1,
        request_kind: "website-bug",
        origin: {
          page_url: " https://tavernary.org/help/ ",
          site_revision: " abc ",
        },
        payload: {
          category: "accessibility",
          page_url: " /catalog/ ",
          actual_behavior: " Buttons disappear. ",
          expected_behavior: " Buttons remain visible. ",
          reproduction_steps: " Open the catalog. ",
          browser: " Firefox ",
          device: " Desktop ",
          additional_context: " ",
        },
      },
      requestKind: "website-bug",
      payload: {
        category: "accessibility",
        page_url: "/catalog/",
        actual_behavior: "Buttons disappear.",
        expected_behavior: "Buttons remain visible.",
        reproduction_steps: "Open the catalog.",
        browser: "Firefox",
        device: "Desktop",
        additional_context: null,
      },
    },
    {
      value: {
        schema_version: 1,
        request_kind: "kit-report",
        origin,
        payload: {
          kit_id: " alpha-kit ",
          canonical_share_url: " https://tavernary.org/kits/alpha-kit/ ",
          kit_revision: " 2026-07-27T00:00:00.000Z ",
          category: "compatibility-problem",
          affected_project_ids: [" alpha ", "alpha", " beta "],
          details: " It does not load. ",
          evidence: " ",
        },
      },
      requestKind: "kit-report",
      payload: {
        kit_id: "alpha-kit",
        canonical_share_url: "https://tavernary.org/kits/alpha-kit/",
        kit_revision: "2026-07-27T00:00:00.000Z",
        category: "compatibility-problem",
        affected_project_ids: ["alpha", "beta"],
        details: "It does not load.",
        evidence: null,
      },
    },
    {
      value: {
        schema_version: 1,
        request_kind: "other-help",
        origin,
        payload: {
          category: "using-tavernary",
          subject: " How do I save? ",
          description: " I need help saving a Kit. ",
          relevant_url: " ",
        },
      },
      requestKind: "other-help",
      payload: {
        category: "using-tavernary",
        subject: "How do I save?",
        description: "I need help saving a Kit.",
        relevant_url: null,
      },
    },
  ] as const;

  for (const entry of cases) {
    expect(normalizeHelpManifest(entry.value)).toMatchObject({
      valid: true,
      manifest: {
        request_kind: entry.requestKind,
        payload: entry.payload,
      },
    });
  }
});

test("rejects unknown kinds, object properties, and unsafe origin URLs", () => {
  const unknownKind = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "blank",
    origin: { page_url: "/help/", site_revision: "local" },
    payload: { details: "x".repeat(3_001) },
  });
  const unknownProperty = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "other-help",
    origin,
    payload: {
      category: "other",
      subject: "Question",
      description: "Please help.",
      relevant_url: null,
      injected: true,
    },
  });
  const unsafeOrigin = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "other-help",
    origin: { page_url: "javascript:alert(1)", site_revision: "local" },
    payload: {
      category: "other",
      subject: "Question",
      description: "Please help.",
      relevant_url: null,
    },
  });

  expect(unknownKind).toEqual({
    valid: false,
    errors: expect.arrayContaining(["Help request kind is invalid."]),
  });
  expect(unknownProperty).toEqual({
    valid: false,
    errors: expect.arrayContaining([
      "Help request contains unknown properties.",
    ]),
  });
  expect(unsafeOrigin).toEqual({
    valid: false,
    errors: expect.arrayContaining(["Help request origin URL is invalid."]),
  });
});

test("enforces every public prose boundary", () => {
  const base = {
    schema_version: 1,
    origin,
  };
  const cases = [
    {
      value: {
        ...base,
        request_kind: "project-report",
        payload: {
          project_id: "project",
          canonical_source: "https://github.com/Owner/Repo",
          category: "incorrect-information",
          report: "x".repeat(3_001),
          requested_outcome: "x".repeat(1_001),
          evidence: "x".repeat(2_001),
        },
      },
      error: "Project report must be 3,000 characters or fewer.",
    },
    {
      value: {
        ...base,
        request_kind: "website-bug",
        payload: {
          category: "accessibility",
          page_url: "/help/",
          actual_behavior: "x".repeat(2_001),
          expected_behavior: "Expected.",
          reproduction_steps: "Step.",
          browser: "x".repeat(121),
          device: "x".repeat(121),
          additional_context: "x".repeat(1_001),
        },
      },
      error: "Website actual behavior must be 2,000 characters or fewer.",
    },
    {
      value: {
        ...base,
        request_kind: "kit-report",
        payload: {
          kit_id: "kit",
          canonical_share_url: "https://tavernary.org/kits/kit/",
          kit_revision: "2026-07-27",
          category: "compatibility-problem",
          affected_project_ids: [],
          details: "x".repeat(3_001),
          evidence: "x".repeat(2_001),
        },
      },
      error: "Kit report details must be 3,000 characters or fewer.",
    },
    {
      value: {
        ...base,
        request_kind: "other-help",
        payload: {
          category: "other",
          subject: "x".repeat(121),
          description: "x".repeat(3_001),
          relevant_url: "x".repeat(501),
        },
      },
      error: "Other Help subject must be 120 characters or fewer.",
    },
  ];

  for (const entry of cases) {
    expect(normalizeHelpManifest(entry.value)).toEqual({
      valid: false,
      errors: expect.arrayContaining([entry.error]),
    });
  }
});

test("exports the approved public categories", () => {
  expect(PROJECT_REPORT_CATEGORIES).toEqual([
    "incorrect-information",
    "source-moved-or-unavailable",
    "duplicate-or-wrong-listing",
    "unsafe-or-malicious",
    "abusive-or-inappropriate",
    "rights-concern",
    "other-listing-concern",
  ]);
  expect(WEBSITE_BUG_CATEGORIES).toContain("accessibility");
  expect(KIT_REPORT_CATEGORIES).toContain("compatibility-problem");
  expect(OTHER_HELP_CATEGORIES).toEqual([
    "using-tavernary",
    "existing-request",
    "suggest-improvement",
    "documentation-policy",
    "other",
  ]);
});

test("accepts bounded public evidence without requiring a URL", () => {
  const result = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "kit-report",
    origin,
    payload: {
      kit_id: "kit",
      canonical_share_url: "https://tavernary.org/kits/kit/",
      kit_revision: "2026-07-27",
      category: "compatibility-problem",
      affected_project_ids: [],
      details: "The project does not load.",
      evidence: "Observed in the current public Kit listing.",
    },
  });

  expect(result).toMatchObject({
    valid: true,
    manifest: {
      payload: { evidence: "Observed in the current public Kit listing." },
    },
  });
});

test.each([
  [
    "project requested outcome",
    {
      schema_version: 1,
      request_kind: "project-report",
      origin,
      payload: {
        project_id: "project",
        canonical_source: "https://github.com/Owner/Repo",
        category: "incorrect-information",
        report: "The card is incorrect.",
        requested_outcome: { unexpected: true },
        evidence: null,
      },
    },
    "Project report requested outcome must be a string or null.",
  ],
  [
    "project evidence",
    {
      schema_version: 1,
      request_kind: "project-report",
      origin,
      payload: {
        project_id: "project",
        canonical_source: "https://github.com/Owner/Repo",
        category: "incorrect-information",
        report: "The card is incorrect.",
        requested_outcome: null,
        evidence: [],
      },
    },
    "Project report evidence must be a string or null.",
  ],
  [
    "website browser",
    {
      schema_version: 1,
      request_kind: "website-bug",
      origin,
      payload: {
        category: "accessibility",
        page_url: "/help/",
        actual_behavior: "It fails.",
        expected_behavior: "It works.",
        reproduction_steps: "Open Help.",
        browser: {},
        device: null,
        additional_context: null,
      },
    },
    "Website browser must be a string or null.",
  ],
  [
    "website device",
    {
      schema_version: 1,
      request_kind: "website-bug",
      origin,
      payload: {
        category: "accessibility",
        page_url: "/help/",
        actual_behavior: "It fails.",
        expected_behavior: "It works.",
        reproduction_steps: "Open Help.",
        browser: null,
        device: [],
        additional_context: null,
      },
    },
    "Website device must be a string or null.",
  ],
  [
    "website additional context",
    {
      schema_version: 1,
      request_kind: "website-bug",
      origin,
      payload: {
        category: "accessibility",
        page_url: "/help/",
        actual_behavior: "It fails.",
        expected_behavior: "It works.",
        reproduction_steps: "Open Help.",
        browser: null,
        device: null,
        additional_context: { unexpected: true },
      },
    },
    "Website additional context must be a string or null.",
  ],
  [
    "Kit evidence",
    {
      schema_version: 1,
      request_kind: "kit-report",
      origin,
      payload: {
        kit_id: "kit",
        canonical_share_url: "https://tavernary.org/kits/kit/",
        kit_revision: "2026-07-27",
        category: "compatibility-problem",
        affected_project_ids: [],
        details: "It does not load.",
        evidence: {},
      },
    },
    "Kit report evidence must be a string or null.",
  ],
  [
    "Other Help relevant URL",
    {
      schema_version: 1,
      request_kind: "other-help",
      origin,
      payload: {
        category: "other",
        subject: "Question",
        description: "Please help.",
        relevant_url: [],
      },
    },
    "Other Help relevant URL must be a string or null.",
  ],
])("rejects malformed nullable %s", (_name, value, error) => {
  expect(normalizeHelpManifest(value)).toEqual({
    valid: false,
    errors: expect.arrayContaining([error]),
  });
});

test("rejects more than 50 distinct affected Kit projects", () => {
  const result = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "kit-report",
    origin,
    payload: {
      kit_id: "kit",
      canonical_share_url: "https://tavernary.org/kits/kit/",
      kit_revision: "2026-07-27",
      category: "compatibility-problem",
      affected_project_ids: Array.from(
        { length: 51 },
        (_value, index) => `project-${index}`,
      ),
      details: "It does not load.",
      evidence: null,
    },
  });

  expect(result).toEqual({
    valid: false,
    errors: expect.arrayContaining([
      "Kit report cannot contain more than 50 affected project IDs.",
    ]),
  });
});

test("retains exactly 50 distinct normalized affected Kit projects", () => {
  const affectedProjectIds = Array.from(
    { length: 50 },
    (_value, index) => `project-${index}`,
  );
  const result = normalizeHelpManifest({
    schema_version: 1,
    request_kind: "kit-report",
    origin,
    payload: {
      kit_id: "kit",
      canonical_share_url: "https://tavernary.org/kits/kit/",
      kit_revision: "2026-07-27",
      category: "compatibility-problem",
      affected_project_ids: affectedProjectIds.map((id, index) =>
        index === 0 ? ` ${id} ` : id,
      ),
      details: "It does not load.",
      evidence: null,
    },
  });

  expect(result).toMatchObject({
    valid: true,
    manifest: {
      payload: { affected_project_ids: affectedProjectIds },
    },
  });
});

test("serializes a normalized Help manifest with a trailing newline", () => {
  expect(
    serializeHelpManifest({
      schema_version: 1,
      request_kind: "other-help",
      origin,
      payload: {
        category: "other",
        subject: "Question",
        description: "Please help.",
        relevant_url: null,
      },
    }),
  ).toBe(
    '{\n  "schema_version": 1,\n  "request_kind": "other-help",\n  "origin": {\n    "page_url": "/help/report-project/",\n    "site_revision": "abc123"\n  },\n  "payload": {\n    "category": "other",\n    "subject": "Question",\n    "description": "Please help.",\n    "relevant_url": null\n  }\n}\n',
  );
});
