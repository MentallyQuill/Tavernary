export type ProjectKind = "frontend" | "extension" | "preset";
export type LicenseStatus = "osi-approved" | "proprietary" | "missing";

export interface CatalogLabel {
  id: string;
  label: string;
}

export interface CatalogProject {
  id: string;
  name: string;
  kind: ProjectKind;
  primaryFunction: string;
  summary: string;
  canonicalUrl: string;
  catalogedAt: string;
  catalogCohort: "seed" | "standard";
  frontends: CatalogLabel[];
  capabilities: CatalogLabel[];
  searchableText: string;
  activity: {
    latestMeaningfulCommitAt: string | null;
    activeWeeks12: number | null;
    twoWeekBars: [number, number, number, number, number, number] | null;
    strength: number | null;
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
  } | null;
  refreshedAt: string | null;
  staleSince: string | null;
}

export interface Catalog {
  schemaVersion: 1;
  generatedAt: string;
  projects: CatalogProject[];
}
