import type { RepositoryProvider } from "../catalog/repository-provider.mjs";
import type { SourceIdentity } from "./source-identity.mjs";
import type { ProjectSubmissionGitHubRequest } from "./triage-issue.mjs";

export interface ReadmeRejection {
  status: "rejected";
  code: "readme-missing" | "readme-placeholder";
  message: string;
}

export function readmeRejection(code: string): ReadmeRejection | null;

export function hasSubstantiveReadme(
  raw: string,
  projectName?: string,
): boolean;

export function inspectSubmissionReadme(
  identity: SourceIdentity | null,
  options: {
    request: ProjectSubmissionGitHubRequest;
    providers?: Record<string, Partial<RepositoryProvider>>;
  },
): Promise<
  | ReadmeRejection
  | { status: "retryable"; code: string; message: string }
  | null
>;
