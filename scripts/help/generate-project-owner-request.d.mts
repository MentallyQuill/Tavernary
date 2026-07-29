import type { OwnerTriageIssue } from "./triage-project-owner-request.d.mts";

export interface OwnerGenerationReport {
  schema_version: 2;
  issue_number: number;
  project_id: string | null;
  project_ids: string[];
  source_id: string;
  operation:
    | "edit-card"
    | "add-cards"
    | "retire-card"
    | "restore-card"
    | "move-source"
    | "delist-source";
  publication_mode: "automatic" | "manual";
  repository_id: number;
  authority_type: "repository-owner" | "tavernary-staff";
  actor_id: number;
  actor_login: string;
  actor_type: "User";
  request_fingerprint: string;
  input_fingerprints: {
    projects: Record<string, string>;
    source: string | null;
  };
  source_identity: {
    type: "github";
    canonical: string;
    repository_id: number;
  } | null;
  policy_version: string;
  generated_at: string;
  before: unknown;
  after: unknown;
  warnings: string[];
  generated_paths: string[];
}

export interface OwnerGenerationResult {
  issueNumber: number;
  projectId: string | null;
  projectIds: string[];
  sourceId: string;
  operation: OwnerGenerationReport["operation"];
  publicationMode: OwnerGenerationReport["publication_mode"];
  authorityType: OwnerGenerationReport["authority_type"];
  actorLogin: string;
  generatedPaths: string[];
  reportPath: string;
  report: OwnerGenerationReport;
}

export function generateProjectOwnerRequest(input: {
  issue: OwnerTriageIssue | { number: number };
  hostRepository?: string | { owner: string; name: string };
  root: string;
  reportPath?: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
  now: string | Date | (() => string | Date);
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
  readdir?: (path: string) => Promise<string[]>;
  writeFile?: (
    path: string,
    contents: string,
    encoding: "utf8",
  ) => Promise<void>;
  mkdir?: (path: string, options: { recursive: true }) => Promise<unknown>;
  rm?: (path: string, options: { force: true }) => Promise<unknown>;
}): Promise<OwnerGenerationResult>;

export function fingerprintProjectOwnerManifest(
  manifest: Record<string, unknown>,
): string;

export function sameProjectOwnerGenerationReport(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean;

export function parseGenerateProjectOwnerCli(argv: string[]): {
  issueNumber: number;
  root: string;
  reportPath: string;
};
