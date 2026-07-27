import type {
  SafeProbeOptions,
  SafeProbeResult,
} from "./safe-source-fetch.mjs";
import type { SourceIdentity } from "./source-identity.mjs";

export type InflightSubmissionGitHubRequest = (
  path: string,
  options?: { method?: string; body?: string },
) => Promise<any>;

export interface InflightSubmissionMatch {
  issueNumber: number;
  issueUrl: string;
  prNumber: number | null;
  prUrl: string | null;
  identity: SourceIdentity;
}

export type InflightSubmissionScan =
  | {
      status: "ok";
      match: InflightSubmissionMatch | null;
      warnings: string[];
    }
  | {
      status: "retryable";
      code: "submission-inventory-unavailable";
      message: string;
    };

export function listOpenAdmittedProjectSubmissions(input: {
  repository: string;
  request: InflightSubmissionGitHubRequest;
}): Promise<any[]>;

export function findEarlierInflightSubmission(input: {
  repository: string;
  currentIssueNumber: number;
  currentIdentity: SourceIdentity;
  request: InflightSubmissionGitHubRequest;
  probe: (url: string, options?: SafeProbeOptions) => Promise<SafeProbeResult>;
}): Promise<InflightSubmissionScan>;
