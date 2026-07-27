import { describe, expect, test } from "vitest";

import { orderFrontendOptionsByPopularity } from "@/features/catalog/frontend-option-order";
import type { CatalogProject } from "@/features/catalog/catalog-types";

const option = (id: string, label: string) => ({ id, label });
const card = ({
  id,
  name,
  frontendId,
  kind = "frontend",
  aggregate,
}: {
  id: string;
  name: string;
  frontendId: string;
  kind?: CatalogProject["kind"];
  aggregate: number | null;
}) =>
  ({
    id,
    name,
    kind,
    frontends: [{ id: frontendId, label: name, description: "Frontend." }],
    community:
      aggregate === null
        ? null
        : { stars: aggregate, forks: 0, subscribers: 0, aggregate },
  }) as CatalogProject;

describe("orderFrontendOptionsByPopularity", () => {
  test("orders scored options by their frontend cards without mutating input", () => {
    const options = [
      option("alpha", "Alpha"),
      option("beta", "Beta"),
      option("gamma", "Gamma"),
    ];
    const projects = [
      card({
        id: "alpha-card",
        name: "Alpha",
        frontendId: "alpha",
        aggregate: 8,
      }),
      card({
        id: "beta-card",
        name: "Beta",
        frontendId: "beta",
        aggregate: 21,
      }),
      card({
        id: "gamma-card",
        name: "Gamma",
        frontendId: "gamma",
        aggregate: 13,
      }),
    ];

    expect(
      orderFrontendOptionsByPopularity(options, projects).map(({ id }) => id),
    ).toEqual(["beta", "gamma", "alpha"]);
    expect(options.map(({ id }) => id)).toEqual(["alpha", "beta", "gamma"]);
  });

  test("ignores extension popularity and orders unscored ties by label then ID", () => {
    const options = [
      option("zeta", "Shared"),
      option("alpha", "Shared"),
      option("missing", "Able"),
      option("scored", "Zulu"),
    ];
    const projects = [
      card({
        id: "scored-card",
        name: "Scored",
        frontendId: "scored",
        aggregate: 1,
      }),
      card({
        id: "popular-extension",
        name: "Popular extension",
        frontendId: "missing",
        kind: "extension",
        aggregate: 999,
      }),
      card({
        id: "unscored-card",
        name: "Alpha",
        frontendId: "alpha",
        aggregate: null,
      }),
    ];

    expect(
      orderFrontendOptionsByPopularity(options, projects).map(({ id }) => id),
    ).toEqual(["scored", "missing", "alpha", "zeta"]);
  });
});
