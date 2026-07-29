import type {
  MetadataAuthorityType,
  MetadataPolicy,
} from "./metadata-policy.mjs";
import type { TagProjectKind, TagVocabulary } from "./tag-vocabulary.mjs";

export interface TagBackfillProject {
  schema_version: 5;
  id: string;
  kind: TagProjectKind;
  enrichment_policy: "automatic" | "manual";
  enrichment_note?: string;
  [key: string]: unknown;
}

export interface TagClassifierResult {
  project_id: string;
  vocabulary_hash: string;
  tags: string[];
  evidence: Record<string, string[]>;
  diagnostic: string | null;
}

export interface ManualTagMigrationInput {
  tags: string[];
  authorityType: Extract<
    MetadataAuthorityType,
    "repository-owner" | "tavernary-staff"
  >;
}

export interface TagMigrationProjectReport {
  project_id: string;
  tags: string[];
  evidence: Record<string, string[]>;
  diagnostic: string | null;
  metadata_policy: MetadataPolicy;
}

export interface TagMigrationReport {
  schema_version: 1;
  vocabulary_hash: string;
  project_count: number;
  zero_tag_count: number;
  six_tag_count: number;
  policy_counts: {
    summary: { automatic: number; manual: number };
    tags: { automatic: number; manual: number };
  };
  tag_counts: Record<string, number>;
  projects: TagMigrationProjectReport[];
}

export interface TagBackfillPlan {
  metadataByProjectId: Map<
    string,
    {
      tags: string[];
      metadata_policy: MetadataPolicy;
    }
  >;
  report: TagMigrationReport;
}

export function planTagBackfill(input: {
  projects: TagBackfillProject[];
  vocabulary: TagVocabulary;
  classifierResults:
    TagClassifierResult[] | ReadonlyMap<string, TagClassifierResult>;
  manualTagsByProjectId?: ReadonlyMap<string, ManualTagMigrationInput>;
}): TagBackfillPlan;

export function writeTagMigrationReport(
  report: TagMigrationReport,
  outputPath: string,
): Promise<{ written: true; path: string }>;
