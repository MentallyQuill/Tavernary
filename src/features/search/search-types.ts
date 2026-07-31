export const SEARCH_FIELD_NAMES = [
  "title",
  "aliases",
  "source",
  "summary",
  "kind",
  "primaryFunction",
  "tags",
  "frontends",
  "compatibility",
  "maintainers",
  "relationships",
] as const;

export type SearchFieldName = (typeof SEARCH_FIELD_NAMES)[number];
export type SearchMatchKind = "exact" | "prefix" | "fuzzy";

export type CatalogSearchFields = Record<SearchFieldName, string[]>;

export function flattenSearchFields(fields: CatalogSearchFields) {
  return SEARCH_FIELD_NAMES.flatMap((field) => fields[field]).join(" ");
}

export interface CatalogSearchDocument extends CatalogSearchFields {
  id: string;
}

export interface SearchEvidence {
  field: SearchFieldName;
  value: string;
  kind: SearchMatchKind;
  queryTerm: string;
  matchedTerm: string;
}

export interface CatalogSearchMatch {
  id: string;
  score: number;
  evidence: SearchEvidence[];
}

export interface CatalogSearchResults {
  normalizedQuery: string;
  matches: CatalogSearchMatch[];
  correction: string | null;
  degraded: boolean;
}

export interface CatalogSearchIndex {
  search(query: string): CatalogSearchResults;
}
