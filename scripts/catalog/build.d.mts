import type { Catalog } from "../../src/features/catalog/catalog-types.ts";

export function buildCatalog(options?: {
  write?: boolean;
  now?: string;
  records?: unknown[];
  snapshots?: unknown[];
}): Promise<Catalog>;
