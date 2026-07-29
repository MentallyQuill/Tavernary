export type MetadataAuthorityType =
  "community-submitter" | "repository-owner" | "tavernary-staff";

export type AutomaticMetadataPolicy = { mode: "automatic" };
export type ManualMetadataPolicy = {
  mode: "manual";
  note: string;
};
export type MetadataPolicyEntry =
  AutomaticMetadataPolicy | ManualMetadataPolicy;

export interface ProjectMetadataPolicy {
  summary: MetadataPolicyEntry;
  tags: MetadataPolicyEntry;
}

export type RequestedMetadata = {
  summary:
    | { mode: "automatic"; value?: unknown; note?: unknown }
    | { mode: "manual"; value: string; note?: unknown };
  tags:
    | { mode: "automatic"; values?: unknown; note?: unknown }
    | { mode: "manual"; values: string[]; note?: unknown };
};

export type ResolvedMetadataRequest = {
  summary: AutomaticMetadataPolicy | (ManualMetadataPolicy & { value: string });
  tags: AutomaticMetadataPolicy | (ManualMetadataPolicy & { values: string[] });
};

export function automaticMetadataPolicy(): AutomaticMetadataPolicy;

export function manualMetadataPolicy(
  authorityType: MetadataAuthorityType,
): ManualMetadataPolicy;

export function metadataFieldsToGenerate(record: {
  metadata_policy?: {
    summary?: { mode?: "automatic" | "manual" };
    tags?: { mode?: "automatic" | "manual" };
  };
}): Array<"summary" | "tags">;

export function resolveRequestedMetadata(input: {
  request: RequestedMetadata;
  authority: { authorityType: MetadataAuthorityType };
}): ResolvedMetadataRequest;
