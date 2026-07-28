import { describe, expect, test } from "vitest";

import {
  attributionAccessibleText,
  attributionByline,
  attributionTooltip,
} from "@/features/catalog/project-attribution";
import type { CatalogAttribution } from "@/features/catalog/catalog-types";

const current: CatalogAttribution = {
  owner: { provider: "github", login: "MentallyQuill" },
  contributors: [
    { provider: "github", login: "Alice", botOrAi: false },
    { provider: "github", login: "Bob", botOrAi: false },
    { provider: "github", login: "Claude", botOrAi: true },
    {
      provider: "github",
      login: "dependabot[bot]",
      botOrAi: true,
    },
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
        contributors: [{ provider: "github", login: "Alice", botOrAi: false }],
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
      "GitHub owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude, dependabot[bot]",
    );
  });

  test("explains empty, pending, and stale contributor facts", () => {
    expect(
      attributionTooltip({
        owner: { provider: "github", login: "Solo" },
        contributors: [],
        humanContributorCount: 0,
        status: "current",
      }),
    ).toBe("GitHub owner: Solo");
    expect(
      attributionTooltip({
        owner: { provider: "github", login: "Solo" },
        contributors: [],
        humanContributorCount: 0,
        status: "pending",
      }),
    ).toBe("GitHub owner: Solo · Contributor data pending");
    expect(attributionTooltip({ ...current, status: "stale" })).toBe(
      "GitHub owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude, dependabot[bot] · Contributor data stale",
    );
    expect(attributionTooltip({ ...current, status: "partial" })).toBe(
      "GitHub owner: MentallyQuill · Contributors: Alice, Bob · Bots/AI: Claude, dependabot[bot] · Contributor history still scanning",
    );
  });

  test("provides complete screen-reader copy without an interactive disclosure", () => {
    expect(attributionAccessibleText(current)).toBe(
      "GitHub repository owner: MentallyQuill. Contributors: Alice, Bob. Bots and AI contributors: Claude, dependabot[bot].",
    );
    expect(
      attributionAccessibleText({
        owner: { provider: "github", login: "Solo" },
        contributors: [],
        humanContributorCount: 0,
        status: "pending",
      }),
    ).toBe("GitHub repository owner: Solo. Contributor data pending.");
    expect(attributionAccessibleText({ ...current, status: "partial" })).toBe(
      "GitHub repository owner: MentallyQuill. Contributors: Alice, Bob. Bots and AI contributors: Claude, dependabot[bot]. Contributor history still scanning.",
    );
  });

  test("identifies Codeberg attribution in accessible copy", () => {
    expect(
      attributionAccessibleText({
        owner: { provider: "codeberg", login: "targren" },
        contributors: [
          { provider: "codeberg", login: "helper", botOrAi: false },
        ],
        humanContributorCount: 1,
        status: "current",
      }),
    ).toBe("Codeberg repository owner: targren. Contributors: helper.");
  });
});
