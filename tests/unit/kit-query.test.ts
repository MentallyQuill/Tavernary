import { expect, test } from "vitest";

import {
  DEFAULT_QUERY,
  parseCatalogQuery,
  serializeCatalogQuery,
} from "@/features/catalog/catalog-query";

test("round-trips the retained Kit filters in stable order", () => {
  const query = parseCatalogQuery(
    "?mode=kits&kit=story-kit-41&frontend=sillytavern&purpose=memory-retrieval&model=claude&includes=recursion&minProjects=5&maxProjects=20&available=1&sort=updated",
  );
  expect(query).toMatchObject({
    mode: "kits",
    selectedKitId: "story-kit-41",
    kits: {
      frontends: ["sillytavern"],
      purposes: ["memory-retrieval"],
      modelFamilies: ["claude"],
      includesProjectId: "recursion",
      minProjects: 5,
      maxProjects: 20,
      allComponentsAvailable: true,
      sort: "updated",
    },
  });
  expect(parseCatalogQuery(`?${serializeCatalogQuery(query)}`)).toEqual(query);
});

test("makes Kit Relevance conditional and omits only the implicit sort", () => {
  expect(parseCatalogQuery("?mode=kits&q=aiko+loadout").kits.sort).toBe(
    "relevance",
  );
  expect(
    parseCatalogQuery("?mode=kits&q=aiko+loadout&sort=updated").kits.sort,
  ).toBe("updated");
  expect(parseCatalogQuery("?mode=kits&sort=relevance").kits.sort).toBe(
    "trending",
  );
  expect(
    serializeCatalogQuery({
      ...DEFAULT_QUERY,
      mode: "kits",
      search: "aiko loadout",
      sort: "relevance",
      kits: { ...DEFAULT_QUERY.kits, sort: "relevance" },
    }),
  ).toBe("q=aiko+loadout&mode=kits");
  expect(
    serializeCatalogQuery({
      ...DEFAULT_QUERY,
      mode: "kits",
      search: "aiko loadout",
      sort: "relevance",
      kits: { ...DEFAULT_QUERY.kits, sort: "updated" },
    }),
  ).toBe("q=aiko+loadout&mode=kits&sort=updated");
});

test("round-trips project model-family and completion-format filters", () => {
  const query = parseCatalogQuery(
    "?category=preset&model=claude&model=gemini&completion=chat-completion&completion=text-completion",
  );

  expect(query).toMatchObject({
    category: "preset",
    modelFamilies: ["claude", "gemini"],
    completionFormats: ["chat-completion", "text-completion"],
  });
  expect(parseCatalogQuery(`?${serializeCatalogQuery(query)}`)).toEqual(query);
});

test("ignores obsolete Kit filters", () => {
  const query = parseCatalogQuery(
    "?mode=kits&creator=42&kind=extension&capability=model-routing&development=dormant&license=open-source&pick=1&available=1",
  );

  expect(query.kits).toEqual({
    ...DEFAULT_QUERY.kits,
    allComponentsAvailable: true,
  });
  expect(serializeCatalogQuery(query)).toBe("mode=kits&available=1");
});

test("keeps Kit-only URL facets out of the project query", () => {
  const query = parseCatalogQuery(
    "?mode=kits&kind=extension&capability=model-routing&development=dormant&license=open-source",
  );

  expect(query).toMatchObject({
    kinds: [],
    tags: [],
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
    "q=story&density=compact&mode=kits&purpose=memory-retrieval&sort=trending",
  );
});
