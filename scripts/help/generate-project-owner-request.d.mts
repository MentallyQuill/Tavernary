import type { OwnerTriageIssue } from "./triage-project-owner-request.d.mts";
import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResult,
  CatalogCopyResultStatus,
} from "../catalog/catalog-copy-contract.mjs";

export interface OwnerGenerationReport {
  schema_version: 1;
  issue_number: number;
  project_id: string;
  operation: "edit-card" | "move-source" | "delist";
  repository_id: number | null;
  authority_type: "repository-owner" | "tavernary-staff";
  actor_login: string;
  request_fingerprint: string;
  generated_at: string;
  submitted_summary?: string;
  published_summary?: string;
  copy_result?: {
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  };
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  warnings: string[];
  generated_paths: string[];
}

export interface OwnerGenerationResult {
  issueNumber: number;
  projectId: string;
  operation: OwnerGenerationReport["operation"];
  authorityType: OwnerGenerationReport["authority_type"];
  actorLogin: string;
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
  copySummary?: (input: {
    authorityType: OwnerGenerationReport["authority_type"];
    submittedSummary: string;
    protectedTerms: string[];
    policyVersion: string;
    repair?: { reasonCode: string; message: string };
  }) => Promise<CatalogCopyResult>;
}): Promise<OwnerGenerationResult>;

export function fingerprintProjectOwnerManifest(
  manifest: Record<string, unknown>,
): string;

export function sameProjectOwnerGenerationReport(
  left: OwnerGenerationReport,
  right: OwnerGenerationReport,
): boolean;

export function parseGenerateProjectOwnerCli(argv: string[]): {
  issueNumber: number;
  root: string;
  reportPath: string;
};
