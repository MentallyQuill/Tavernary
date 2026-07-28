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
  withdrawn_at?: string;
}

export function findExistingKitForSubmission(input: {
  manifest: KitSubmissionManifest;
  issueNumber: number;
  kits: CanonicalKit[];
}): CanonicalKit | undefined;

export function applyKitSubmission(input: {
  manifest: KitSubmissionManifest;
  issue: { number: number; user: { id: number; login: string } };
  existingKit?: CanonicalKit;
  now: string;
}): CanonicalKit;

export function writeAppliedKitOutput(
  path: string,
  kit: CanonicalKit,
): Promise<void>;
