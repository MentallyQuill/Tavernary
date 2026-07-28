import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

import { fingerprintProjectRecord } from "@/features/help/project-owner-record.mjs";

export interface OwnerProjectOption {
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  sourceType: "github" | "github-organization" | "url";
  repository: string | null;
  repositoryId: number | null;
  eligibleShape: boolean;
  ineligibilityReason: string | null;
  sourceFingerprint: string;
  listingState: {
    metadataStatus: string;
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
    capabilities: string[];
    modelFamilies: string[];
    completionFormats: string[];
  };
}

interface RegistryRecord {
  id: string;
  name: string;
  kind: OwnerProjectOption["kind"];
  summary: string;
  source:
    | { type: "github"; repository: string; repository_id: number | null }
    | { type: "github-organization" }
    | { type: "url" };
  frontends: string[];
  primary_function: string;
  capabilities: string[];
  model_families?: string[];
  completion_formats?: string[];
  metadata_status: string;
  visibility: string;
  visibility_reason: string | null;
  refresh_policy: string;
  enrichment_policy: string;
}

function ineligibilityReason(record: RegistryRecord) {
  if (record.source.type === "url") {
    return "External URL listings require a public project report.";
  }
  if (record.source.type === "github-organization") {
    return "Organization suite listings require a public project report.";
  }
  if (
    !Number.isSafeInteger(record.source.repository_id) ||
    (record.source.repository_id ?? 0) <= 0
  ) {
    return "This GitHub listing does not have a verified immutable repository ID.";
  }
  return null;
}

export async function loadOwnerProjectOptions(
  root = process.cwd(),
): Promise<OwnerProjectOption[]> {
  const directory = resolve(root, "data/registry/projects");
  const files = (await readdir(directory))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const records = await Promise.all(
    files.map(async (file) => {
      const parsed = JSON.parse(
        await readFile(resolve(directory, file), "utf8"),
      ) as RegistryRecord;
      return parsed;
    }),
  );

  return records
    .filter((record) => record.visibility === "published")
    .map((record) => {
      const reason = ineligibilityReason(record);
      const repository =
        record.source.type === "github" ? record.source.repository : null;
      const repositoryId =
        record.source.type === "github" &&
        Number.isSafeInteger(record.source.repository_id) &&
        (record.source.repository_id ?? 0) > 0
          ? record.source.repository_id
          : null;
      return {
        id: record.id,
        name: record.name,
        kind: record.kind,
        sourceType: record.source.type,
        repository,
        repositoryId,
        eligibleShape: reason === null,
        ineligibilityReason: reason,
        sourceFingerprint: fingerprintProjectRecord(record),
        listingState: {
          metadataStatus: record.metadata_status,
          visibility: record.visibility,
          visibilityReason: record.visibility_reason,
          refreshPolicy: record.refresh_policy,
          enrichmentPolicy: record.enrichment_policy,
        },
        editable: {
          name: record.name,
          summary: record.summary,
          frontends: [...record.frontends],
          primaryFunction: record.primary_function,
          capabilities: [...record.capabilities],
          modelFamilies: [...(record.model_families ?? [])],
          completionFormats: [...(record.completion_formats ?? [])],
        },
      } satisfies OwnerProjectOption;
    })
    .sort((left, right) =>
      left.name.localeCompare(right.name, "en", { sensitivity: "base" }),
    );
}
