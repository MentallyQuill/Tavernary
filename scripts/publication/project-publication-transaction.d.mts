export type ProjectPublicationOperation =
  "create" | "edit-card" | "move-source" | "delist";
export type ProjectPublicationProducer =
  "project-submission" | "project-owner-request";
export type ProjectPublicationAuthority =
  "community-submitter" | "repository-owner" | "tavernary-staff";

export interface ProjectPublicationTransaction {
  schema_version: 1;
  operation: ProjectPublicationOperation;
  producer: ProjectPublicationProducer;
  issue_number: number;
  project_id: string;
  source_identity: {
    type: "github" | "codeberg" | "reddit" | "external";
    canonical: string;
    repository_id: number | null;
  } | null;
  actor: { id: number; login: string; type: "User" | "Bot" };
  authority_type: ProjectPublicationAuthority;
  input_digest: string;
  record_fingerprint: string | null;
  base_sha: string;
  generated_head_sha: string;
  generated_paths: string[];
  policy_version: string;
  copy_result: {
    mode: "preserve" | "synthesize";
    result:
      | "accepted-unchanged"
      | "accepted-with-light-edits"
      | "accepted-with-policy-rewrite";
    change_reasons: import("../catalog/catalog-copy-contract.mjs").CatalogCopyChangeReason[];
    policy_signal: "none" | "catalog-policy-rewrite";
  } | null;
}

export const PROJECT_PUBLICATION_TRANSACTION_MARKER: string;
export function fingerprintProjectPublicationInput(value: unknown): string;
export function createProjectPublicationTransaction(
  input: Record<string, unknown>,
): ProjectPublicationTransaction;
export function parseProjectPublicationTransaction(
  body: string,
): ProjectPublicationTransaction | null;
export function expectedTransactionPaths(
  transaction: ProjectPublicationTransaction,
): string[];
