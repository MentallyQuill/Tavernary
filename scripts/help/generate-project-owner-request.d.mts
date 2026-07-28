import type { OwnerTriageIssue } from "./triage-project-owner-request.d.mts";

export interface OwnerGenerationReport {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  operation: "edit-card" | "move-source" | "delist";
  repository_id: number;
  verified_owner_login: string;
  generated_at: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warnings: string[];
  generated_paths: string[];
}

export interface OwnerGenerationResult {
  issueNumber: number;
  projectId: string;
  operation: OwnerGenerationReport["operation"];
  verifiedOwnerLogin: string;
  generatedPaths: string[];
  reportPath: string;
  report: OwnerGenerationReport;
}

export function generateProjectOwnerRequest(input: {
  issue: OwnerTriageIssue;
  hostRepository?: string | { owner: string; name: string };
  root: string;
  reportPath?: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
  now: string | Date | (() => string | Date);
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  writeFile?: (
    path: string,
    contents: string,
    encoding: "utf8",
  ) => Promise<void>;
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>;
}): Promise<OwnerGenerationResult>;

export function parseGenerateProjectOwnerCli(argv: string[]): {
  issueNumber: number;
  root: string;
  reportPath: string;
};
