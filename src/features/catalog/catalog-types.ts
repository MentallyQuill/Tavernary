import type { CatalogSearchFields } from "@/features/search/search-types";
import type { TavernKeeperCardStatus } from "@/features/catalog/tavernkeeper-status";

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

export interface CatalogTag extends CatalogLabel {
  facet: "goal" | "trait";
}

export interface CatalogTagDefinition extends CatalogTag {
  aliases: string[];
  applicable_kinds: ProjectKind[];
}

export interface CatalogAccount {
  provider: "github" | "codeberg";
  login: string;
}

export interface CatalogContributor extends CatalogAccount {
  botOrAi: boolean;
}

export interface CatalogAttribution {
  owner: CatalogAccount;
  contributors: CatalogContributor[];
  humanContributorCount: number;
  status: "current" | "partial" | "stale" | "pending";
}

export interface CatalogForkRelationship {
  parentName: string;
  parentProjectId: string | null;
  parentUrl: string | null;
  status: "published" | "repository" | "not-listed" | "unavailable";
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
  tags: CatalogTag[];
  search: CatalogSearchFields;
  tavernKeeper: TavernKeeperCardStatus | null;
  fork: CatalogForkRelationship | null;
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
    watchers: number;
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
  schemaVersion: 6;
  generatedAt: string;
  tagVocabulary: CatalogTagDefinition[];
  projects: CatalogProject[];
  kits: import("@/features/kits/kit-types").CatalogKit[];
}
