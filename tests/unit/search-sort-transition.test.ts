import { expect, test } from "vitest";

import {
  nextSearchSort,
  rememberedBrowseSort,
} from "@/features/search/search-sort-transition";
import type { CatalogBrowseSort } from "@/features/catalog/catalog-query";

test("enters relevance for a new meaningful search", () => {
  expect(
    nextSearchSort({
      previousSearch: "",
      nextSearch: "preset freaky",
      currentSort: "popularity",
      browseSort: "popularity",
    }),
  ).toBe("relevance");
});

test("preserves a manual override for equivalent query edits", () => {
  expect(
    nextSearchSort({
      previousSearch: "Preset Freaky",
      nextSearch: "  preset   freaky ",
      currentSort: "alphabetical",
      browseSort: "alphabetical",
    }),
  ).toBe("alphabetical");
});

test("resets a manual override after a meaningful edit", () => {
  expect(
    nextSearchSort({
      previousSearch: "preset freaky",
      nextSearch: "preset freaky claude",
      currentSort: "alphabetical",
      browseSort: "alphabetical",
    }),
  ).toBe("relevance");
});

test("restores the remembered browse sort when cleared", () => {
  expect(
    nextSearchSort({
      previousSearch: "preset freaky",
      nextSearch: "",
      currentSort: "relevance",
      browseSort: "popularity",
    }),
  ).toBe("popularity");
});

test("restores Date Added after search is cleared", () => {
  const dateAdded: CatalogBrowseSort = "date-added";

  expect(
    nextSearchSort({
      previousSearch: "preset freaky",
      nextSearch: "",
      currentSort: "relevance",
      browseSort: dateAdded,
    }),
  ).toBe("date-added");
});

test("does not mistake relevance for a remembered browsing preference", () => {
  expect(rememberedBrowseSort("relevance", "recent")).toBe("recent");
  expect(rememberedBrowseSort("alphabetical", "recent")).toBe("alphabetical");
});
