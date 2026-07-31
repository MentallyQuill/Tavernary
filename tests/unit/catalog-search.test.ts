import MiniSearch from "minisearch";
import { describe, expect, test, vi } from "vitest";

import {
  createCatalogSearchIndex,
  exactAllTermSearch,
} from "@/features/search/catalog-search";
import {
  allowedEditDistance,
  normalizeSearchText,
  searchDocumentTerms,
  searchMeaning,
  searchTerms,
} from "@/features/search/search-normalization";
import type { CatalogSearchDocument } from "@/features/search/search-types";

const documents: CatalogSearchDocument[] = [
  {
    id: "freaky",
    title: ["Preset Introducing Freaky Frankenstein 50"],
    aliases: [],
    source: ["reddit-1v9u18m"],
    summary: ["A relationship-focused system preset."],
    kind: ["preset", "system preset"],
    primaryFunction: ["generation and reasoning"],
    tags: ["slow burn", "relationship tracking"],
    frontends: ["SillyTavern"],
    compatibility: ["Claude", "GLM", "Kimi"],
    maintainers: [],
    relationships: [],
  },
  {
    id: "memory",
    title: ["SillyTavern MemoryBooks"],
    aliases: ["Memory Books"],
    source: ["aikohanasaki/sillytavern-memorybooks"],
    summary: ["Stores durable conversation memories."],
    kind: ["extension"],
    primaryFunction: ["memory and retrieval"],
    tags: ["long-term memory"],
    frontends: ["SillyTavern"],
    compatibility: [],
    maintainers: ["aikohanasaki"],
    relationships: [],
  },
];

describe("search normalization", () => {
  test("normalizes Unicode, punctuation, camel case, and whitespace", () => {
    expect(normalizeSearchText("  SíllyTavern / Memory_Books  ")).toBe(
      "silly tavern memory books",
    );
  });

  test("drops only approved function words when content terms remain", () => {
    expect(searchTerms("preset for the freaky")).toEqual(["preset", "freaky"]);
    expect(searchTerms("the")).toEqual(["the"]);
  });

  test("uses normalized terms as query meaning", () => {
    expect(searchMeaning(" Preset   Freaky ")).toBe("preset freaky");
    expect(searchMeaning("PRESET FREAKY")).toBe("preset freaky");
  });

  test("preserves compact identity tokens alongside camel-case words", () => {
    expect(searchDocumentTerms("MentallyQuill/SillyTavern")).toEqual([
      "mentally",
      "quill",
      "silly",
      "tavern",
      "mentallyquill",
      "sillytavern",
    ]);
  });

  test.each([
    ["four", 0],
    ["freaky", 1],
    ["frankenstein", 2],
  ] as const)("limits edits for %s", (term, distance) => {
    expect(allowedEditDistance(term)).toBe(distance);
  });
});

describe("catalog search", () => {
  test("requires noncontiguous terms across the complete document", () => {
    const index = createCatalogSearchIndex(documents);

    expect(index.search("preset freaky").matches.map(({ id }) => id)).toEqual([
      "freaky",
    ]);
    expect(index.search("freaky preset").matches.map(({ id }) => id)).toEqual([
      "freaky",
    ]);
  });

  test("ranks exact title terms above supporting-field matches", () => {
    const index = createCatalogSearchIndex([
      ...documents,
      {
        ...documents[1],
        id: "supporting",
        title: ["Unrelated Toolkit"],
        summary: ["Preset support for Freaky Frankenstein."],
      },
    ]);

    expect(index.search("preset freaky").matches[0]?.id).toBe("freaky");
  });

  test("keeps exact matches above fuzzy matches", () => {
    const index = createCatalogSearchIndex([
      ...documents,
      {
        ...documents[1],
        id: "exact-supporting",
        title: ["Unrelated Toolkit"],
        summary: ["Frankenstien"],
      },
    ]);

    expect(index.search("frankenstien").matches.map(({ id }) => id)).toEqual([
      "exact-supporting",
      "freaky",
    ]);
  });

  test("recognizes complete aliases and source identities", () => {
    const index = createCatalogSearchIndex(documents);

    expect(index.search("memory books").matches[0]?.id).toBe("memory");
    expect(
      index.search("aikohanasaki sillytavern memorybooks").matches[0]?.id,
    ).toBe("memory");
  });

  test("permits bounded typos but rejects typos below five characters", () => {
    const index = createCatalogSearchIndex(documents);

    expect(index.search("frankenstien").matches[0]?.id).toBe("freaky");
    expect(index.search("frankenstien").correction).toBe("frankenstein");
    expect(index.search("presrt freaky").matches[0]?.id).toBe("freaky");
    expect(index.search("gln").matches).toEqual([]);
  });

  test("returns field evidence for exact visible and hidden matches", () => {
    const index = createCatalogSearchIndex(documents);

    expect(index.search("aikohanasaki").matches[0]?.evidence[0]).toMatchObject({
      field: "maintainers",
      value: "aikohanasaki",
      kind: "exact",
    });
    expect(index.search("freaky").matches[0]?.evidence[0]).toMatchObject({
      field: "title",
      value: "Preset Introducing Freaky Frankenstein 50",
      kind: "exact",
    });
  });

  test("falls back to complete exact tokens instead of substrings", () => {
    expect(
      exactAllTermSearch(documents, "preset freaky").matches.map(
        ({ id }) => id,
      ),
    ).toEqual(["freaky"]);
    expect(exactAllTermSearch(documents, "frankenstien").matches).toEqual([]);
    expect(exactAllTermSearch(documents, "set freaky").matches).toEqual([]);
  });

  test("degrades to exact tokens when MiniSearch initialization fails", () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const addAll = vi
      .spyOn(MiniSearch.prototype, "addAll")
      .mockImplementation(() => {
        throw new Error("synthetic index failure");
      });

    try {
      const result =
        createCatalogSearchIndex(documents).search("preset freaky");

      expect(result.degraded).toBe(true);
      expect(result.matches.map(({ id }) => id)).toEqual(["freaky"]);
    } finally {
      addAll.mockRestore();
      consoleError.mockRestore();
    }
  });

  test("degrades to exact tokens when MiniSearch query execution fails", () => {
    const index = createCatalogSearchIndex(documents);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const search = vi
      .spyOn(MiniSearch.prototype, "search")
      .mockImplementation(() => {
        throw new Error("synthetic query failure");
      });

    try {
      const result = index.search("preset freaky");

      expect(result.degraded).toBe(true);
      expect(result.matches.map(({ id }) => id)).toEqual(["freaky"]);
    } finally {
      search.mockRestore();
      consoleError.mockRestore();
    }
  });
});
