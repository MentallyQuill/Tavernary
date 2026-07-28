import type { GitHubRepositoryIdentity } from "./project-owner-authority.d.mts";

export interface OwnerTriageIssue {
  number: number;
  state: string;
  body?: string | null;
  labels: Array<string | { name?: string }>;
  user?: { login?: string };
  url?: string;
  updated_at?: string;
}

export type ProjectOwnerTriageDecision =
  | {
      status: "admitted";
      issueNumber: number;
      projectId: string;
      operation: "edit-card" | "move-source" | "delist";
      manifest: Record<string, unknown>;
      record: Record<string, unknown>;
      repository: GitHubRepositoryIdentity;
      verifiedOwnerLogin: string;
      warnings: string[];
    }
  | {
      status: "retryable" | "needs-information";
      reasonCode: string;
      message: string;
      errors?: string[];
      fields?: string[];
    };

export function processProjectOwnerTriage(input: {
  issue: OwnerTriageIssue;
  root?: string;
  record?: Record<string, unknown>;
  repository?: GitHubRepositoryIdentity | Record<string, unknown>;
  vocabularies: {
    frontends: readonly (string | { id: string })[];
    primaryFunctions: readonly (string | { id: string })[];
    capabilities: readonly (string | { id: string })[];
    modelFamilies: readonly (string | { id: string })[];
    completionFormats: readonly (string | { id: string })[];
  };
  request?: (path: string) => Promise<any>;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  writeFile?: (...args: any[]) => Promise<any>;
}): Promise<ProjectOwnerTriageDecision>;
