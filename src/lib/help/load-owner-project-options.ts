import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import {
  fingerprintProjectRecord,
  fingerprintSourceRecord,
} from "@/features/help/project-owner-record.mjs";

type ProjectKind = "frontend" | "extension" | "preset";
type ListingStatus = "active" | "quarantined" | "retired";
type MetadataMode = "automatic" | "manual";

export interface OwnerProjectSibling {
  id: string;
  name: string;
  listingStatus: ListingStatus;
}

export interface OwnerProjectOption {
  id: string;
  name: string;
  kind: ProjectKind;
  sourceId: string;
  sourceType: "github" | "codeberg" | "github-organization" | "url";
  sourceUrl?: string;
  repository: string | null;
  repositoryId: number | null;
  eligibleShape: boolean;
  ineligibilityReason: string | null;
  projectFingerprint: string;
  sourceFingerprint: string;
  siblings: OwnerProjectSibling[];
  sourceState: {
    status: "active" | "delisted";
    refreshPolicy: "automatic" | "paused";
  };
  listingState: {
    metadataStatus: string;
    listingStatus: ListingStatus;
    listingStatusReason: string | null;
    // Temporary aliases retained until the Task 9 editor cutover.
    visibility: string;
    visibilityReason: string | null;
    refreshPolicy: string;
    enrichmentPolicy: string;
  };
  editable: {
    name: string;
    summary: string;
    frontends: string[];
    primaryFunction: string;
    tags: string[];
    metadataPolicy: {
      summary: { mode: MetadataMode };
      tags: { mode: MetadataMode };
    };
    // Temporary compatibility field removed by the combined tag-system cutover.
    capabilities: string[];
    modelFamilies: string[];
    completionFormats: string[];
  };
}

interface RegistryProject {
  schema_version: 6;
  id: string;
  name: string;
  kind: ProjectKind;
  summary: string;
  metadata_status: string;
  source_id: string;
  frontends: string[];
  primary_function: string;
  tags: string[];
  metadata_policy: {
    summary: { mode: MetadataMode; note?: string };
    tags: { mode: MetadataMode; note?: string };
  };
  model_families?: string[];
  completion_formats?: string[];
  listing_status: ListingStatus;
  listing_status_reason: string | null;
}

interface RegistrySource {
  schema_version: 1;
  id: string;
  type: OwnerProjectOption["sourceType"];
  repository?: string;
  repository_id?: number;
  url?: string;
  status: "active" | "delisted";
  status_reason: "removed" | null;
  refresh_policy: "automatic" | "paused";
}

async function readJsonDirectory<T>(directory: string): Promise<T[]> {
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  return Promise.all(
    files.map(async (file) =>
      JSON.parse(await readFile(resolve(directory, file), "utf8")),
    ),
  );
}

function sourceUrl(source: RegistrySource) {
  if (source.type === "github" && source.repository) {
    return `https://github.com/${source.repository}`;
  }
  if (source.type === "codeberg" && source.repository) {
    return `https://codeberg.org/${source.repository}`;
  }
  return source.url;
}

function ineligibilityReason(source: RegistrySource) {
  if (source.status === "delisted") {
    return "This repository source is permanently delisted.";
  }
  if (source.type !== "github") {
    return "Only GitHub repository listings can use owner maintenance.";
  }
  if (
    !Number.isSafeInteger(source.repository_id) ||
    (source.repository_id ?? 0) <= 0
  ) {
    return "This GitHub listing does not have a verified immutable repository ID.";
  }
  return null;
}

function legacyVisibility(status: ListingStatus) {
  if (status === "active") return "published";
  return status === "quarantined" ? "quarantined" : "disabled";
}

export async function loadOwnerProjectOptions(
  root = process.cwd(),
): Promise<OwnerProjectOption[]> {
  const [projects, sources] = await Promise.all([
    readJsonDirectory<RegistryProject>(
      resolve(root, "data/registry/projects"),
    ),
    readJsonDirectory<RegistrySource>(resolve(root, "data/registry/sources")),
  ]);
  const sourcesById = new Map<string, RegistrySource>();
  for (const source of sources) {
    if (sourcesById.has(source.id)) {
      throw new Error(`Duplicate owner source ID: ${source.id}`);
    }
    sourcesById.set(source.id, source);
  }
  const projectsBySourceId = new Map<string, RegistryProject[]>();
  for (const project of projects) {
    const source = sourcesById.get(project.source_id);
    if (!source) {
      throw new Error(
        `${project.id}: source ${project.source_id} does not exist`,
      );
    }
    const siblings = projectsBySourceId.get(project.source_id) ?? [];
    siblings.push(project);
    projectsBySourceId.set(project.source_id, siblings);
  }

  return projects
    .map((project) => {
      const source = sourcesById.get(project.source_id)!;
      const reason = ineligibilityReason(source);
      const repository =
        source.type === "github" ? (source.repository ?? null) : null;
      const repositoryId =
        source.type === "github" &&
        Number.isSafeInteger(source.repository_id) &&
        (source.repository_id ?? 0) > 0
          ? (source.repository_id ?? null)
          : null;
      const siblings = (projectsBySourceId.get(project.source_id) ?? [])
        .filter((candidate) => candidate.id !== project.id)
        .map((candidate) => ({
          id: candidate.id,
          name: candidate.name,
          listingStatus: candidate.listing_status,
        }))
        .sort(
          (left, right) =>
            left.name.localeCompare(right.name, "en", {
              sensitivity: "base",
            }) || left.id.localeCompare(right.id),
        );
      return {
        id: project.id,
        name: project.name,
        kind: project.kind,
        sourceId: project.source_id,
        sourceType: source.type,
        sourceUrl: sourceUrl(source),
        repository,
        repositoryId,
        eligibleShape: reason === null,
        ineligibilityReason: reason,
        projectFingerprint: fingerprintProjectRecord(project),
        sourceFingerprint: fingerprintSourceRecord(source),
        siblings,
        sourceState: {
          status: source.status,
          refreshPolicy: source.refresh_policy,
        },
        listingState: {
          metadataStatus: project.metadata_status,
          listingStatus: project.listing_status,
          listingStatusReason: project.listing_status_reason,
          visibility: legacyVisibility(project.listing_status),
          visibilityReason: project.listing_status_reason,
          refreshPolicy: source.refresh_policy,
          enrichmentPolicy: project.metadata_policy.summary.mode,
        },
        editable: {
          name: project.name,
          summary: project.summary,
          frontends: [...project.frontends],
          primaryFunction: project.primary_function,
          tags: [...project.tags],
          metadataPolicy: {
            summary: { mode: project.metadata_policy.summary.mode },
            tags: { mode: project.metadata_policy.tags.mode },
          },
          capabilities: [],
          modelFamilies: [...(project.model_families ?? [])],
          completionFormats: [...(project.completion_formats ?? [])],
        },
      } satisfies OwnerProjectOption;
    })
    .sort(
      (left, right) =>
        left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
        left.id.localeCompare(right.id),
    );
}
