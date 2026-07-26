export interface KitSubmissionManifest {
  operation: "create" | "edit";
  kit_id: string | null;
  title: string;
  description: string;
  project_ids: string[];
}

export interface KitSubmissionValidation {
  valid: boolean;
  manifest: KitSubmissionManifest | null;
  labels: string[];
  errors: string[];
  warnings: string[];
}

export function validateKitSubmission(input: {
  manifest: string;
  actor: { id: number; login: string };
  projects: Array<{
    id: string;
    kind: string;
    visibility?: string;
  }>;
  kits: Array<{
    id: string;
    status: string;
    author: { github_user_id: number; login: string };
    source_issue_number?: number;
    project_ids: string[];
  }>;
  blockedUsers: {
    schema_version?: number;
    blocked: Array<{ github_user_id: number; login: string; reason: string }>;
  };
  sourceIssueNumber?: number;
}): KitSubmissionValidation;
