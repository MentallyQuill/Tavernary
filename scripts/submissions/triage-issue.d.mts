import type { ProjectSubmissionManifest } from "../../src/features/submissions/project-submission-manifest.mjs";
import type {
  ExistingSubmissionProject,
  ProjectSubmissionDecision,
  SourceProbeDecision,
} from "./admission.mjs";
import type { SubmissionRepositoryObservation } from "./fork-dependency.mjs";
import type {
  FrontendProject,
  FrontendVocabulary,
} from "./frontend-reconciliation.mjs";
import type {
  SafeProbeOptions,
  SafeProbeResult,
} from "./safe-source-fetch.mjs";
import type { SourceIdentity } from "./source-identity.mjs";
import type { SubmissionValidation } from "./validate-submission.mjs";

export function parseIssueFields(body: string): {
  kind: string;
  sourceUrl: string;
};

export function buildValidationComment(
  validation: SubmissionValidation,
): string;

export interface ProjectSubmissionStateMarker {
  schema_version: 1;
  generated_title: string | null;
  status: ProjectSubmissionDecision["status"];
  frontend_dependencies?: Array<{
    name: string;
    canonical_url: string;
    repository: string;
  }>;
  source_repository_id?: number;
  fork_dependency?: {
    repository_id: number;
    name: string;
    repository: string;
    canonical_url: string;
    issue_number: number | null;
  };
}

export interface ProjectSubmissionTriageMutation {
  desiredTitle: string;
  labels: string[];
  commentBody: string;
  close: boolean;
  closeReason: "not_planned" | null;
  dispatchGeneration: boolean;
  marker: ProjectSubmissionStateMarker;
  issueNumber: number;
}

export function parseProjectSubmissionStateMarker(
  body: string,
): ProjectSubmissionStateMarker | null;

export function buildProjectSubmissionTriage(
  decision: ProjectSubmissionDecision,
  context: {
    issueNumber: number;
    currentTitle: string;
    currentLabels: string[];
    generatedTitle: string | null;
    previousMarker: ProjectSubmissionStateMarker | null;
    sourceRepositoryId?: number;
  },
): ProjectSubmissionTriageMutation;

export interface ProjectSubmissionTriageApi {
  updateIssue(
    issueNumber: number,
    patch: {
      title?: string;
      state?: "closed";
      state_reason?: "not_planned" | null;
    },
  ): Promise<unknown>;
  synchronizeLabels(
    issueNumber: number,
    currentLabels: string[],
    desiredLabels: string[],
  ): Promise<unknown>;
  listComments(
    issueNumber: number,
  ): Promise<Array<{ id: number; body?: string | null }>>;
  updateComment(commentId: number, body: string): Promise<unknown>;
  createComment(issueNumber: number, body: string): Promise<unknown>;
}

export function synchronizeProjectSubmissionTriage(
  mutation: ProjectSubmissionTriageMutation,
  context: {
    issue: {
      number: number;
      title: string;
      labels: string[];
      state: string;
    };
    api: ProjectSubmissionTriageApi;
    writeOutput?: (name: string, value: string) => Promise<unknown>;
  },
): Promise<void>;

export type ProjectSubmissionGitHubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export interface ProjectSubmissionTriageEvent {
  repository: { full_name: string };
  issue: {
    number: number;
    title: string;
    body?: string | null;
    labels: Array<string | { name: string }>;
    state: string;
  };
}

export interface ProjectSubmissionEventContext {
  repository: { full_name: string };
  issue: {
    number: number;
    title?: string;
    body?: string | null;
    labels?: Array<string | { name: string }>;
    state?: string;
  };
}

export function processProjectSubmissionTriage(input: {
  event: ProjectSubmissionEventContext;
  request: ProjectSubmissionGitHubRequest;
  probe?: (url: string, options?: SafeProbeOptions) => Promise<SafeProbeResult>;
  catalogData?: {
    vocabulary: FrontendVocabulary;
    projects: FrontendProject[];
  };
  writeOutput?: (name: string, value: string) => Promise<unknown>;
}): Promise<ProjectSubmissionDecision>;

export function resolveProjectSubmissionEvent(
  event: unknown,
  environment: Record<string, string | undefined>,
): ProjectSubmissionEventContext | null;

export function loadProjectSubmissionCatalogData(): Promise<{
  vocabulary: FrontendVocabulary;
  projects: FrontendProject[];
}>;

export function projectSubmissionExistingProject(
  record: FrontendProject & {
    kind?: string;
    visibility?: string;
    source?: {
      type: string;
      repository?: string;
      repository_id?: number | null;
      url?: string;
    };
  },
): ExistingSubmissionProject | null;

export function inspectProjectSubmissionSource(
  manifest: ProjectSubmissionManifest,
  options: {
    request: ProjectSubmissionGitHubRequest;
    probe: (
      url: string,
      options?: SafeProbeOptions,
    ) => Promise<SafeProbeResult>;
  },
): Promise<{
  identity: SourceIdentity | null;
  sourceProbe: SourceProbeDecision;
  repository?: SubmissionRepositoryObservation;
  errors?: string[];
}>;
