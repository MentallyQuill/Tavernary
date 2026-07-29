import type { ProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import type {
  ForkDependency,
  ForkDependencyDecision,
  SubmissionRepositoryObservation,
} from "./fork-dependency.mjs";
import type {
  FrontendResolution,
  FrontendSuggestion,
  MissingFrontendDependency,
} from "./frontend-reconciliation.mjs";
import type { InflightSubmissionMatch } from "./inflight-submissions.mjs";
import type { SourceIdentity } from "./source-identity.mjs";

export const submissionQueueLabels: string[];

export type SourceProbeDecision =
  | { status: "ok"; httpStatus: number | null }
  | { status: "retryable"; code: string; message: string }
  | { status: "definitive"; code: string; message: string };

export interface ExistingSubmissionSource {
  id: string;
  name: string;
  canonicalUrl: string;
  identity: SourceIdentity;
  projectIds?: string[];
}

export interface ProjectSubmissionAdmissionInput {
  manifest: ProjectSubmissionManifest;
  identity: SourceIdentity | null;
  sourceProbe: SourceProbeDecision;
  repository?: SubmissionRepositoryObservation;
  existingSources: ExistingSubmissionSource[];
  inflightDuplicate?: InflightSubmissionMatch | null;
  frontendResolution: FrontendResolution;
  forkDependency?: ForkDependencyDecision;
  warnings?: string[];
  errors?: string[];
  suggestions?: FrontendSuggestion[];
}

export type ProjectSubmissionDecision =
  | {
      status: "duplicate";
      identity: SourceIdentity;
      existingSource: {
        id: string;
        name: string;
        canonicalUrl: string;
        projectIds: string[];
      };
    }
  | {
      status: "inflight-duplicate";
      identity: SourceIdentity;
      existingSubmission: InflightSubmissionMatch;
    }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
      frontendDependencies: MissingFrontendDependency[];
    }
  | {
      status: "retryable";
      code: string;
      message: string;
    }
  | {
      status: "waiting-on-fork-parent";
      dependency: ForkDependency;
    }
  | {
      status: "admitted";
      manifest: ProjectSubmissionManifest;
      identity: SourceIdentity;
      frontendIds: string[];
      warnings: string[];
    };

export function evaluateProjectSubmission(
  input: ProjectSubmissionAdmissionInput,
): ProjectSubmissionDecision;
