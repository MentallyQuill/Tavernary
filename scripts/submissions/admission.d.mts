import type { ProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import type {
  FrontendResolution,
  FrontendSuggestion,
} from "./frontend-reconciliation.mjs";
import type { SourceIdentity } from "./source-identity.mjs";

export const submissionQueueLabels: string[];

export type SourceProbeDecision =
  | { status: "ok"; httpStatus: number }
  | { status: "retryable"; code: string; message: string }
  | { status: "definitive"; code: string; message: string };

export interface ExistingSubmissionProject {
  id: string;
  name: string;
  canonicalUrl: string;
  identity: SourceIdentity;
}

export interface ProjectSubmissionAdmissionInput {
  manifest: ProjectSubmissionManifest;
  identity: SourceIdentity | null;
  sourceProbe: SourceProbeDecision;
  repository?: {
    visibility: "public" | "private" | "internal";
    archived: boolean;
  };
  existingProjects: ExistingSubmissionProject[];
  frontendResolution: FrontendResolution;
  warnings?: string[];
  errors?: string[];
  suggestions?: FrontendSuggestion[];
}

export type ProjectSubmissionDecision =
  | {
      status: "duplicate";
      identity: SourceIdentity;
      existingProject: {
        id: string;
        name: string;
        canonicalUrl: string;
      };
    }
  | {
      status: "needs-information";
      errors: string[];
      suggestions: FrontendSuggestion[];
    }
  | {
      status: "retryable";
      code: string;
      message: string;
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
