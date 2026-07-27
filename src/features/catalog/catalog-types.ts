export type ProjectKind = "frontend" | "extension" | "preset";
export type MetadataStatus = "provisional" | "curated";
export type SourceStatus = "pending" | "healthy" | "stale" | "manual";
export type LicenseStatus =
  "osi-approved" | "proprietary" | "missing" | "pending";
export type ActivityEvidenceStatus = "provisional" | "complete" | "degraded";
export type WeeklyActivity = [
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
];

export interface CatalogLabel {
  id: string;
  label: string;
  description: string;
}

export interface CatalogContributor {
  login: string;
  botOrAi: boolean;
}

export interface CatalogAttribution {
  owner: string;
  contributors: CatalogContributor[];
  humanContributorCount: number;
  status: "current" | "partial" | "stale" | "pending";
}

export interface CatalogProject {
  id: string;
  name: string;
  kind: ProjectKind;
  metadataStatus: MetadataStatus;
  sourceStatus: SourceStatus;
  primaryFunction: string;
  summary: string;
  canonicalUrl: string;
  catalogedAt: string;
  catalogCohort: "seed" | "standard";
  frontends: CatalogLabel[];
  capabilities: CatalogLabel[];
  searchableText: string;
  attribution: CatalogAttribution | null;
  activity: {
    latestSourceActivityAt: string | null;
    activeWeeks12: number | null;
    weeklyActivity: WeeklyActivity | null;
    evidenceStatus: ActivityEvidenceStatus | null;
    dormant: boolean;
  };
  latestReleaseAt: string | null;
  community: {
    stars: number;
    forks: number;
    subscribers: number;
    aggregate: number;
  } | null;
  repositorySizeKb: number | null;
  license: {
    status: LicenseStatus;
    label: string;
    tooltip: string;
  };
  preset: {
    version: string | null;
    publishedAt: string | null;
    artifactSizeBytes: number | null;
    modelFamilies: CatalogLabel[];
    completionFormats: CatalogLabel[];
  } | null;
  refreshedAt: string | null;
  staleSince: string | null;
}

export interface Catalog {
  schemaVersion: 2;
  generatedAt: string;
  projects: CatalogProject[];
  kits: import("@/features/kits/kit-types").CatalogKit[];
}
