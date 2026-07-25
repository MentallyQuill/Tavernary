import { describe, expect, test } from "vitest";

import {
  attributionAccessibleText,
  attributionByline,
  attributionTooltip,
} from "@/features/catalog/project-attribution";
import type { CatalogAttribution } from "@/features/catalog/catalog-types";

const current: CatalogAttribution = {
  owner: "MentallyQuill",
  contributors: [
    { login: "Alice", botOrAi: false },
    { login: "Bob", botOrAi: false },
    { login: "Claude", botOrAi: true },
    { login: "dependabot[bot]", botOrAi: true },
  ],
  humanContributorCount: 2,
  status: "current",
};

describe("project attribution copy", () => {
  test("formats the visible owner and human contributor count", () => {
    expect(attributionByline(current)).toBe(
      "by MentallyQuill, plus 2 contributors",
    );
    expect(
      attributionByline({
        ...current,
        contributors: [{ login: "Alice", botOrAi: false }],
        humanContributorCount: 1,
      }),
    ).toBe("by MentallyQuill, plus 1 contributor");
    expect(
      attributionByline({
        ...current,
        contributors: [],
        humanContributorCount: 0,
      }),
    ).toBe("by MentallyQuill");
  });

  test("lists all known identities in the desktop tooltip", () => {
    expect(attributionTooltip(current)).toBe(
      "Owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude, dependabot[bot]",
    );
  });

  test("explains empty, pending, and stale contributor facts", () => {
    expect(
      attributionTooltip({
        owner: "Solo",
        contributors: [],
        humanContributorCount: 0,
        status: "current",
      }),
    ).toBe("Owner: Solo");
    expect(
      attributionTooltip({
        owner: "Solo",
        contributors: [],
        humanContributorCount: 0,
        status: "pending",
      }),
    ).toBe("Owner: Solo · Contributor data pending");
    expect(attributionTooltip({ ...current, status: "stale" })).toBe(
      "Owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude, dependabot[bot] · Contributor data stale",
    );
  });

  test("provides complete screen-reader copy without an interactive disclosure", () => {
    expect(attributionAccessibleText(current)).toBe(
      "Repository owner: MentallyQuill. Contributors: Alice, Bob. Bots and AI contributors: Claude, dependabot[bot].",
    );
    expect(
      attributionAccessibleText({
        owner: "Solo",
        contributors: [],
        humanContributorCount: 0,
        status: "pending",
      }),
    ).toBe("Repository owner: Solo. Contributor data pending.");
  });
});
