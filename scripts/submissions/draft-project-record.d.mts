import type { RepositoryObservation } from "../catalog/repository-provider.mjs";
import type { RepositorySnapshot } from "../catalog/repository-snapshot.mjs";
import type { ClassificationReview } from "../catalog/enrichment-contract.mjs";
import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResultStatus,
} from "../catalog/catalog-copy-contract.mjs";
import type { SubmissionSummaryAuthority } from "./submission-summary-authority.mjs";
import type { ProjectSubmissionDecision } from "./admission.mjs";
import type {
  FrontendProject,
  FrontendVocabulary,
} from "./frontend-reconciliation.mjs";

export type AdmittedProjectSubmission = Extract<
  ProjectSubmissionDecision,
  { status: "admitted" }
>;

export interface DraftedProjectRecord {
  schema_version: 5;
  id: string;
  name: string;
  kind: "frontend" | "extension" | "preset";
  summary: string;
  metadata_status: "provisional" | "curated";
  source:
    | {
        type: "github" | "codeberg";
        repository: string;
        repository_id: number;
      }
    | {
        type: "url";
        url: string;
        published_at: null;
        version: null;
        artifact_size_bytes: null;
        license_status: "pending";
        license_spdx_id: null;
      };
  frontends: string[];
  primary_function: string;
  capabilities: string[];
  model_families?: string[];
  completion_formats?: string[];
  cataloged_at: string;
  catalog_cohort: "standard";
  visibility: "published";
  visibility_reason: null;
  refresh_policy: "automatic" | "paused";
  enrichment_policy: "automatic" | "manual";
  enrichment_note?: string;
}

export type DraftEnrichment =
  | {
      status: "curated";
      summary: string;
      capabilities: string[];
      classification_review: ClassificationReview;
      result?: CatalogCopyResultStatus;
      change_reasons?: readonly CatalogCopyChangeReason[];
      policy_signal?: CatalogCopyPolicySignal;
    }
  | {
      status: "failed";
      code: string;
      message: string;
    }
  | null;

export type GeneratedClassificationReview =
  | {
      status: "confirmed";
      submitted_primary_function: string;
      suggested_primary_function: string;
      explanation: null;
    }
  | {
      status: "possible-mismatch";
      submitted_primary_function: string;
      suggested_primary_function: string;
      explanation: string;
    }
  | {
      status: "classification-check-unavailable";
      submitted_primary_function: string;
      suggested_primary_function: null;
      explanation: string;
    };

export interface ProjectDraftResult {
  record: DraftedProjectRecord;
  snapshot?: RepositorySnapshot;
  frontendVocabulary?: FrontendVocabulary;
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  summaryAuthority: SubmissionSummaryAuthority;
  copyResult: {
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  } | null;
  classificationReview: GeneratedClassificationReview | null;
  warnings: string[];
}

export function draftProjectRecord(input: {
  admitted: AdmittedProjectSubmission;
  observation: RepositoryObservation | null;
  snapshot: RepositorySnapshot | null;
  enrichment: DraftEnrichment;
  frontendVocabulary?: FrontendVocabulary;
  frontendProjects?: FrontendProject[];
  summaryAuthority?: SubmissionSummaryAuthority;
  sourceIssueNumber?: number;
  copyRequired?: boolean;
  now: string;
}): Promise<ProjectDraftResult>;
