import type {
  CatalogCopyChangeReason,
  CatalogCopyPolicySignal,
  CatalogCopyResultStatus,
} from "../catalog/catalog-copy-contract.mjs";
import type {
  EnrichmentOutput,
  MetadataField,
} from "../catalog/enrichment-contract.mjs";
import type { OwnerTriageIssue } from "./triage-project-owner-request.d.mts";

export interface OwnerCopyResult {
  project_id: string;
  mode: "preserve" | "synthesize";
  review_status?: "validated" | "unavailable";
  reason_code?: "copy-review-unavailable";
  submitted_summary: string | null;
  published_summary: string;
  copy_result: {
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  } | null;
}

export interface OwnerMetadataResult {
  project_id: string;
  requested_fields: MetadataField[];
  summary_evidence?: string[];
  tag_evidence?: Array<{ id: string; evidence: string[] }>;
  tag_generation_diagnostic?: string;
}

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
  repository_id: number | null;
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
  source_fingerprint: string;
  policy_version: string;
  generated_at: string;
  resolved_metadata: Record<
    string,
    {
      summary: string;
      tags: string[];
    }
  >;
  copy_results: OwnerCopyResult[];
  metadata_results: OwnerMetadataResult[];
  submitted_summary?: string | null;
  published_summary?: string;
  copy_mode?: "preserve" | "synthesize";
  copy_result?: OwnerCopyResult["copy_result"];
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
  copySummary?: (input: Record<string, unknown>) => Promise<{
    summary: string;
    result: CatalogCopyResultStatus;
    change_reasons: CatalogCopyChangeReason[];
    policy_signal: CatalogCopyPolicySignal;
  }>;
  enrichMetadata?: (
    input: Record<string, unknown>,
  ) => Promise<EnrichmentOutput>;
  enrichmentProvider?: unknown;
  loadEnrichmentSource?: (...args: any[]) => Promise<any>;
  validatedReport?: OwnerGenerationReport;
}): Promise<OwnerGenerationResult>;

export function fingerprintProjectOwnerManifest(
  manifest: Record<string, unknown>,
): string;

export function sameProjectOwnerGenerationReport(
  left: object,
  right: object,
): boolean;

export function parseGenerateProjectOwnerCli(argv: string[]): {
  issueNumber: number;
  root: string;
  reportPath: string;
  validatedReportPath: string | null;
};

export function readValidatedOwnerReport(
  reportPath: string,
  readFile?: (path: string, encoding: "utf8") => Promise<string>,
): Promise<OwnerGenerationReport>;
