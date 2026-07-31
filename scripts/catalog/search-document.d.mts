import type { CatalogSearchFields } from "../../src/features/search/search-types.ts";

type SearchEntry = {
  label?: string;
  aliases?: string[];
};

export function assertSearchFields(
  fields: unknown,
  context: string,
): asserts fields is CatalogSearchFields;

export function projectSearchFields(input: {
  completionFormats: SearchEntry[];
  frontends: SearchEntry[];
  modelFamilies: SearchEntry[];
  primaryFunction: SearchEntry;
  project: Record<string, unknown>;
  record: Record<string, unknown>;
  source: Record<string, unknown>;
  tags: SearchEntry[];
}): CatalogSearchFields;

export function kitSearchFields(input: {
  frontends: SearchEntry[];
  kit: Record<string, unknown>;
  modelFamilies: SearchEntry[];
  purposes: SearchEntry[];
}): CatalogSearchFields;
