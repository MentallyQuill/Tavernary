import type { Catalog } from "../../src/features/catalog/catalog-types.ts";

export interface BuildCatalogOptions {
  write?: boolean;
  now?: string;
  records?: unknown[];
  sources?: unknown[];
  snapshots?: unknown[];
  refreshManifest?: unknown;
  kitRecords?: unknown[];
  kitSnapshots?: unknown[];
  blockedUsers?: unknown;
  siteConfig?: { github_repository: string };
}

export function buildCatalog(options?: BuildCatalogOptions): Promise<Catalog>;
