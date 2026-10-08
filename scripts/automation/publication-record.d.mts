import type { AutomationOperation } from "./operation.mjs";
import type { AutomationReceipt } from "./receipts.mjs";
import type { PreparedResult } from "./prepared-result.mjs";
export interface CanonicalPublicationRecord {
  schema_version: 1;
  operation: AutomationOperation;
  source: PreparedResult["source"];
  authorId: number;
  producer: PreparedResult["producer"];
  files: Array<{ path: string; sha256: string; gitBlobSha: string }>;
}
export function canonicalGitBlobSha(content: string | Uint8Array): string;
export function createCanonicalPublicationRecord(input: {
  result: PreparedResult;
  operation: AutomationOperation;
}): CanonicalPublicationRecord;
export function validateCanonicalPublicationRecord(
  value: unknown,
): CanonicalPublicationRecord;
export function discoverCanonicalPublications(input: {
  records: Array<{ record: CanonicalPublicationRecord; revision: string }>;
  fileDigests: Record<string, string>;
  receipts?: AutomationReceipt[];
  confirmedRevisions?: string[];
  requestedRevisions?: string[];
  nowMs: number;
}): AutomationOperation[];
