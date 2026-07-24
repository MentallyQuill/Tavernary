export interface KitSubmissionManifest {
  operation: "create" | "edit";
  kit_id: string | null;
  title: string;
  description: string;
  project_ids: string[];
}

export interface CanonicalKit {
  schema_version: 1;
  id: string;
  status: "published" | "withdrawn";
  title: string;
  description: string;
  author: { github_user_id: number; login: string };
  source_issue_number: number;
  project_ids: string[];
  published_at: string;
  updated_at: string;
  tavernary_pick: boolean;
  withdrawn_at?: string;
}

export function applyKitSubmission(input: {
  manifest: KitSubmissionManifest;
  issue: { number: number; user: { id: number; login: string } };
  existingKit?: CanonicalKit;
  now: string;
}): CanonicalKit;
