import type { RepositoryObservation } from "../catalog/repository-provider.mjs";
import type { RepositorySnapshot } from "../catalog/repository-snapshot.mjs";
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
      primary_function: string;
      capabilities: string[];
    }
  | {
      status: "failed";
      code: string;
      message: string;
    }
  | null;

export interface ProjectDraftResult {
  record: DraftedProjectRecord;
  snapshot?: RepositorySnapshot;
  frontendVocabulary?: FrontendVocabulary;
  submitted: Record<string, unknown>;
  observed: Record<string, unknown>;
  inferred: Record<string, unknown>;
  warnings: string[];
}

export function draftProjectRecord(input: {
  admitted: AdmittedProjectSubmission;
  observation: RepositoryObservation | null;
  snapshot: RepositorySnapshot | null;
  enrichment: DraftEnrichment;
  frontendVocabulary?: FrontendVocabulary;
  frontendProjects?: FrontendProject[];
  now: string;
}): Promise<ProjectDraftResult>;
