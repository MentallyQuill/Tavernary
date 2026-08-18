import catalogData from "../../../public/catalog/tavernary-catalog.json";
import type { Catalog } from "@/features/catalog/catalog-types";

export function loadCatalog(): Catalog {
  return catalogData as Catalog;
}
