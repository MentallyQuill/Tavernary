import type { CanonicalPublicationRecord } from "./publication-record.mjs";
export function readCanonicalPublicationEvidence(input: {
  root: string;
  revision: string;
  records: CanonicalPublicationRecord[];
}): Promise<{
  publications: Array<{ record: CanonicalPublicationRecord; revision: string }>;
  fileDigests: Record<string, string>;
}>;
