import catalogData from "@/generated/catalog.json";
import type { Catalog } from "@/features/catalog/catalog-types";

export function loadCatalog(): Catalog {
  return catalogData as Catalog;
}
