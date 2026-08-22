import type {
  Catalog,
  CatalogV7,
} from "../../src/features/catalog/catalog-types.ts";

export interface BuildCatalogOptions {
  write?: boolean;
  now?: string;
  records?: unknown[];
  sources?: unknown[];
  snapshots?: unknown[];
  installEvidence?: unknown[];
  refreshManifest?: unknown;
  kitRecords?: unknown[];
  kitSnapshots?: unknown[];
  blockedUsers?: unknown;
  siteConfig?: { github_repository: string };
  tavernKeeperReports?: unknown;
}

export function buildCatalog(options?: BuildCatalogOptions): Promise<Catalog>;
export function projectCatalogV7(catalog: Catalog): CatalogV7;
export function deriveInstallContract(input: {
  record: any;
  source: any;
  snapshot: any;
  evidence: any;
}): Catalog["projects"][number]["install"];
