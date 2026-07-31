import type { CatalogSearchFields } from "@/features/search/search-types";

export function catalogSearchFields(
  title: string,
  overrides: Partial<CatalogSearchFields> = {},
): CatalogSearchFields {
  return {
    title: [title],
    aliases: [],
    source: [],
    summary: [],
    kind: [],
    primaryFunction: [],
    tags: [],
    frontends: [],
    compatibility: [],
    maintainers: [],
    relationships: [],
    ...overrides,
  };
}
