import { expect, test } from "vitest";

import {
  DEFAULT_QUERY,
  parseCatalogQuery,
  serializeCatalogQuery,
} from "@/features/catalog/catalog-query";

test("round-trips Kit mode, selection, range, and sort", () => {
  const query = parseCatalogQuery(
    "?mode=kits&kit=story-kit-41&frontend=sillytavern&purpose=memory-retrieval&minProjects=5&maxProjects=20&pick=1&sort=updated",
  );
  expect(query).toMatchObject({
    mode: "kits",
    selectedKitId: "story-kit-41",
    kits: {
      frontends: ["sillytavern"],
      purposes: ["memory-retrieval"],
      minProjects: 5,
      maxProjects: 20,
      tavernaryPickOnly: true,
      sort: "updated",
    },
  });
  expect(parseCatalogQuery(`?${serializeCatalogQuery(query)}`)).toEqual(query);
});

test("round-trips expanded Kit discovery filters in stable order", () => {
  const query = parseCatalogQuery(
    "?mode=kits&creator=42&creator=7&kind=preset&kind=extension&capability=model-routing&development=dormant&license=open-source&available=1",
  );

  expect(query.kits).toMatchObject({
    creatorIds: [7, 42],
    kinds: ["extension", "preset"],
    capabilities: ["model-routing"],
    development: ["dormant"],
    licenses: ["open-source"],
    allComponentsAvailable: true,
  });
  expect(serializeCatalogQuery(query)).toBe(
    "mode=kits&creator=7&creator=42&kind=extension&kind=preset&capability=model-routing&development=dormant&license=open-source&available=1",
  );
});

test("keeps Kit-only URL facets out of the project query", () => {
  const query = parseCatalogQuery(
    "?mode=kits&kind=extension&capability=model-routing&development=dormant&license=open-source",
  );

  expect(query).toMatchObject({
    kinds: [],
    capabilities: [],
    development: [],
    licenses: [],
  });
});

test("a Kit selection implies Kits mode and invalid ranges reset", () => {
  expect(parseCatalogQuery("?kit=story-kit-41")).toMatchObject({
    mode: "kits",
    selectedKitId: "story-kit-41",
  });
  expect(
    parseCatalogQuery("?mode=kits&minProjects=30&maxProjects=10").kits,
  ).toEqual(DEFAULT_QUERY.kits);
});

test("serializes only active-mode filters while retaining shared search and density", () => {
  const serialized = serializeCatalogQuery({
    ...DEFAULT_QUERY,
    mode: "kits",
    search: "story",
    density: "compact",
    category: "frontend",
    frontends: ["sillytavern"],
    kits: {
      ...DEFAULT_QUERY.kits,
      purposes: ["memory-retrieval"],
    },
  });

  expect(serialized).toBe(
    "q=story&density=compact&mode=kits&purpose=memory-retrieval",
  );
});
