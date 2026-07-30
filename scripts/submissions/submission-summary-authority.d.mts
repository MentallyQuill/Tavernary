import type { TrustedEditorRegistry } from "../maintenance/trusted-editor-authority.mjs";
import type { SourceIdentity } from "./source-identity.mjs";

export type SubmissionMetadataAuthorityType =
  "community-submitter" | "repository-owner" | "tavernary-staff";

export interface SubmissionMetadataAuthority {
  authorityType: SubmissionMetadataAuthorityType;
  actorId: number | null;
  actorLogin: string | null;
  actorType?: "Bot";
}

export type SubmissionSummaryAuthorityType = SubmissionMetadataAuthorityType;
export type SubmissionSummaryAuthority = SubmissionMetadataAuthority;

export interface SubmissionMetadataAuthorityInput {
  issueActor?: {
    id?: number | null;
    login?: string | null;
    type?: string | null;
  } | null;
  authorAssociation?: string | null;
  sourceIdentity?: SourceIdentity | null;
  repositoryOwner?: {
    id?: number | null;
    login?: string | null;
    type?: string | null;
  } | null;
  trustedEditorRegistry: TrustedEditorRegistry;
}

export function classifySubmissionMetadataAuthority(
  input: SubmissionMetadataAuthorityInput,
): SubmissionMetadataAuthority;

export const classifySubmissionSummaryAuthority: typeof classifySubmissionMetadataAuthority;
