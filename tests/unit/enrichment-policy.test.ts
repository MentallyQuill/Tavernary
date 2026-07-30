import { describe, expect, test } from "vitest";

import {
  MANUAL_ENRICHMENT_REASON_CODE,
  ManualEnrichmentPolicyError,
  assertAutomaticEnrichment,
  automaticEnrichmentAdapter,
  defaultEnrichmentFields,
  isAutomaticEnrichment,
  manualEnrichmentExclusions,
} from "../../scripts/catalog/enrichment-policy.mjs";

describe("enrichment policy", () => {
  test("defaults GitHub repositories to automatic enrichment", () => {
    expect(
      defaultEnrichmentFields({
        type: "github",
        repository: "Owner/Repo",
        repository_id: null,
      }),
    ).toEqual({
      metadata_policy: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    });
  });

  test("defaults Codeberg repositories to automatic enrichment", () => {
    expect(
      defaultEnrichmentFields({
        type: "codeberg",
        repository: "targren/Lumiverse-SwipeScrubber",
        repository_id: 1699613,
      }),
    ).toEqual({
      metadata_policy: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    });
    expect(
      automaticEnrichmentAdapter({
        type: "codeberg",
        repository: "targren/Lumiverse-SwipeScrubber",
      }),
    ).toBe("codeberg");
  });

  test("defaults external URLs and GitHub organizations to documented manual enrichment", () => {
    expect(
      defaultEnrichmentFields({
        type: "url",
        url: "https://example.com/preset",
      }),
    ).toEqual({
      metadata_policy: {
        summary: {
          mode: "manual",
          note: "External URL source; requires manual curation.",
        },
        tags: {
          mode: "manual",
          note: "External URL source; requires manual curation.",
        },
      },
    });
    expect(
      defaultEnrichmentFields({
        type: "github-organization",
        organization: "tavern-rpg-suite",
        url: "https://github.com/tavern-rpg-suite",
      }),
    ).toEqual({
      metadata_policy: {
        summary: {
          mode: "manual",
          note: "Multi-repository suite; requires manual curation.",
        },
        tags: {
          mode: "manual",
          note: "Multi-repository suite; requires manual curation.",
        },
      },
    });
  });

  test("defaults canonical Reddit posts to automatic enrichment", () => {
    expect(
      defaultEnrichmentFields({
        type: "url",
        url: "https://www.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
      }),
    ).toEqual({
      metadata_policy: {
        summary: { mode: "automatic" },
        tags: { mode: "automatic" },
      },
    });
  });

  test("reports supported automatic adapters", () => {
    expect(
      automaticEnrichmentAdapter({
        type: "github",
        repository: "Owner/Repo",
      }),
    ).toBe("github");
    expect(
      automaticEnrichmentAdapter({
        type: "url",
        url: "https://old.reddit.com/r/SillyTavernAI/comments/1v64r6z/update/",
      }),
    ).toBe("reddit");
    expect(
      automaticEnrichmentAdapter({
        type: "url",
        url: "https://example.com/preset",
      }),
    ).toBeNull();
  });

  test("identifies automatic records and sorted manual exclusions", () => {
    const automatic = {
      id: "automatic-project",
      metadata_policy: {
        summary: { mode: "automatic" as const },
        tags: { mode: "manual" as const, note: "Owner-selected tags." },
      },
    };
    const manualB = {
      id: "manual-b",
      metadata_policy: {
        summary: {
          mode: "manual" as const,
          note: "Requires a maintainer review.",
        },
        tags: {
          mode: "manual" as const,
          note: "Requires a maintainer review.",
        },
      },
    };
    const manualA = {
      id: "manual-a",
      metadata_policy: {
        summary: {
          mode: "manual" as const,
          note: "External URL source; requires manual curation.",
        },
        tags: {
          mode: "manual" as const,
          note: "External URL source; requires manual curation.",
        },
      },
    };

    expect(isAutomaticEnrichment(automatic)).toBe(true);
    expect(isAutomaticEnrichment(manualA)).toBe(false);
    expect(manualEnrichmentExclusions([manualB, automatic, manualA])).toEqual([
      {
        projectId: "manual-a",
        reason: MANUAL_ENRICHMENT_REASON_CODE,
        note: "External URL source; requires manual curation.",
      },
      {
        projectId: "manual-b",
        reason: MANUAL_ENRICHMENT_REASON_CODE,
        note: "Requires a maintainer review.",
      },
    ]);
  });

  test("throws a typed error when automatic enrichment is required", () => {
    const record = {
      id: "manual-project",
      metadata_policy: {
        summary: {
          mode: "manual" as const,
          note: "Requires a maintainer review.",
        },
        tags: {
          mode: "manual" as const,
          note: "Requires a maintainer review.",
        },
      },
    };

    expect(() => assertAutomaticEnrichment(record)).toThrow(
      ManualEnrichmentPolicyError,
    );
    try {
      assertAutomaticEnrichment(record);
    } catch (error) {
      expect(error).toMatchObject({
        projectId: "manual-project",
        code: MANUAL_ENRICHMENT_REASON_CODE,
        note: "Requires a maintainer review.",
      });
    }
  });
});
