import type { ProjectSubmissionDecision } from "./admission.mjs";
import type {
  FrontendProject,
  FrontendVocabulary,
} from "./frontend-reconciliation.mjs";
import type {
  SafeProbeOptions,
  SafeProbeResult,
} from "./safe-source-fetch.mjs";
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
  replaceLabels(issueNumber: number, labels: string[]): Promise<unknown>;
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

export function processProjectSubmissionTriage(input: {
  event: ProjectSubmissionTriageEvent;
  request: ProjectSubmissionGitHubRequest;
  probe?: (url: string, options?: SafeProbeOptions) => Promise<SafeProbeResult>;
  catalogData?: {
    vocabulary: FrontendVocabulary;
    projects: FrontendProject[];
  };
  writeOutput?: (name: string, value: string) => Promise<unknown>;
}): Promise<ProjectSubmissionDecision>;
