import type { Catalog } from "../../src/features/catalog/catalog-types.ts";

export interface BuildCatalogOptions {
  write?: boolean;
  now?: string;
  records?: unknown[];
  snapshots?: unknown[];
}

export function buildCatalog(options?: BuildCatalogOptions): Promise<Catalog>;
