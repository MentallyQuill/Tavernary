import type { TrustedEditorRegistry } from "../maintenance/trusted-editor-authority.mjs";
import type { SourceIdentity } from "./source-identity.mjs";

export type SubmissionSummaryAuthorityType =
  "community-submitter" | "repository-owner" | "tavernary-staff";

export interface SubmissionSummaryAuthority {
  authorityType: SubmissionSummaryAuthorityType;
  actorId: number | null;
  actorLogin: string | null;
  actorType?: "Bot";
}

export function classifySubmissionSummaryAuthority(input: {
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
}): SubmissionSummaryAuthority;
