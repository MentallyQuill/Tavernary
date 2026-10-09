import type { AutomationOperation } from "./operation.mjs";
export interface MetadataRecord {
  id: string;
  source_id: string;
  name?: string;
  kind?: string;
  frontends?: string[];
  listing_status?: string;
  visibility?: string;
  metadata_status?: string;
  summary?: string;
  tags?: string[];
  metadata_policy?: { summary?: { mode: string }; tags?: { mode: string } };
}
export interface MetadataEvidence {
  sourceId: string;
  sourceIdentity: string;
  provider: string;
  headSha: string;
  normalizedContent?: string;
  status: "ready" | "failed";
  public: boolean;
  observedAt: string;
  policyVersion: string;
  vocabularyHash: string;
}
export interface MetadataCache {
  schema_version: 1;
  projectId: string;
  sourceId: string;
  sourceIdentity: string;
  inputDigest: string;
  fingerprint: string;
  vocabularyHash: string;
  policyVersion: string;
  fields: Array<"summary" | "tags">;
  traitsDigest: string;
  outputDigest: string;
  headSha: string;
  observedAt: string;
}
export interface MetadataSelectionEntry {
  projectId: string;
  sourceId: string;
  fields: Array<"summary" | "tags">;
  fingerprint: string;
}
export interface MetadataSelection {
  sources: MetadataSelectionEntry[];
  cached: MetadataSelectionEntry[];
  pending: Array<{ projectId: string; sourceId: string; reason: string }>;
  remaining: number;
}
export const METADATA_CACHE_SCHEMA: Record<string, unknown>;
export function validateMetadataCache(value: unknown): MetadataCache;
export function normalizeMetadataContent(input: {
  readme?: string | null;
  description?: string | null;
}): string;
export function metadataFingerprint(input: {
  sourceId: string;
  normalizedContent: string;
  policyVersion: string;
  vocabularyHash: string;
}): string;
export function metadataTraitsDigest(record: MetadataRecord): string;
export function metadataOutputDigest(
  record: MetadataRecord,
  fields?: string[],
): string;
export function createMetadataCache(input: {
  operation: AutomationOperation;
  record: MetadataRecord;
  sourceIdentity: string;
  headSha: string;
  normalizedContent?: string;
  vocabularyHash: string;
  nowMs: number;
}): MetadataCache;
export function metadataCacheMatches(input: {
  cache: MetadataCache;
  record: MetadataRecord;
  evidence: MetadataEvidence;
  fields?: string[];
}): boolean;
export function selectMetadataRefresh(input: {
  records: MetadataRecord[];
  evidence: MetadataEvidence[];
  cache: MetadataCache[];
  nowMs: number;
  limit?: number;
}): MetadataSelection;
