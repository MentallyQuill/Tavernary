import type { SourceRecord } from "../../src/features/catalog/source-record.mjs";
import type {
  OwnerVocabularies,
  ProjectOwnerManifest,
} from "../../src/features/help/project-owner-manifest.mjs";
import type { GitHubRepositoryIdentity } from "./project-owner-authority.d.mts";
import type {
  TrustedEditorRegistry,
  TrustedEditorRole,
} from "../maintenance/trusted-editor-authority.mjs";

export interface OwnerTriageIssue {
  number: number;
  state: string;
  body?: string | null;
  labels: Array<string | { name?: string }>;
  user?: { id?: number; login?: string };
  author_association?: string;
  url?: string;
  updated_at?: string;
}

export type ProjectOwnerTriageDecision =
  | {
      status: "admitted";
      issueNumber: number;
      projectId: string | null;
      projectIds: string[];
      sourceId: string;
      operation: ProjectOwnerManifest["operation"];
      manifest: ProjectOwnerManifest;
      project: Record<string, unknown> | null;
      record: Record<string, unknown> | null;
      projects: Array<Record<string, unknown>>;
      source: SourceRecord | Record<string, unknown>;
      snapshot: Record<string, unknown> | null;
      repository: GitHubRepositoryIdentity | null;
      authorityType: "repository-owner" | "tavernary-staff";
      actorLogin: string;
      verifiedOwnerLogin?: string;
      trustedEditorRole?: TrustedEditorRole;
      warnings: string[];
    }
  | {
      status: "retryable" | "needs-information";
      reasonCode: string;
      message: string;
      errors?: string[];
      fields?: string[];
      conflictingIssueNumber?: number;
    };

export function processProjectOwnerTriage(input: {
  issue: OwnerTriageIssue;
  root?: string;
  hostRepository?: string | { owner: string; name: string };
  project?: Record<string, unknown>;
  projects?: Array<Record<string, unknown>>;
  source?: SourceRecord | Record<string, unknown>;
  snapshot?: Record<string, unknown>;
  repository?: GitHubRepositoryIdentity | Record<string, unknown>;
  issues?: unknown[];
  pulls?: unknown[];
  trustedEditorRegistry?: TrustedEditorRegistry;
  vocabularies: Omit<OwnerVocabularies, "source">;
  request?: (path: string) => Promise<any>;
  readFile?: (path: string, encoding: "utf8") => Promise<string>;
}): Promise<ProjectOwnerTriageDecision>;
