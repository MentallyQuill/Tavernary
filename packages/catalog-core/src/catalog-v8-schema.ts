import { catalogV7Schema } from "./catalog-v7-schema";
import { createCatalogV8Schema } from "./catalog-v8-schema-factory.mjs";
export const catalogV8Schema = createCatalogV8Schema(catalogV7Schema);
