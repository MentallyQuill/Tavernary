import { searchMeaning } from "./search-normalization";

export function nextSearchSort<BrowseSort extends string>({
  previousSearch,
  nextSearch,
  currentSort,
  browseSort,
}: {
  previousSearch: string;
  nextSearch: string;
  currentSort: BrowseSort | "relevance";
  browseSort: BrowseSort;
}): BrowseSort | "relevance" {
  const previous = searchMeaning(previousSearch);
  const next = searchMeaning(nextSearch);
  if (!next) return browseSort;
  if (next !== previous) return "relevance";
  return currentSort;
}

export function rememberedBrowseSort<BrowseSort extends string>(
  current: BrowseSort | "relevance",
  fallback: BrowseSort,
): BrowseSort {
  return current === "relevance" ? fallback : current;
}
