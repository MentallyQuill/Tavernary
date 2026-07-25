export interface KitReaction {
  content: string;
  created_at: string;
  user: { id: number; login: string; type: string };
}

export interface KitSupportSnapshot {
  schema_version: 1;
  kit_id: string;
  source_issue_number: number;
  refreshed_at: string;
  stale_since: string | null;
  supporters: Array<{
    github_user_id: number;
    login: string;
    first_reacted_at: string;
    active: boolean;
  }>;
}

export function refreshKitReactions(input: {
  kits: Array<{
    id: string;
    status: string;
    source_issue_number: number;
    published_at: string;
    author: { github_user_id: number; login: string };
  }>;
  snapshots: KitSupportSnapshot[];
  blockedUsers: {
    blocked: Array<{ github_user_id: number; login: string; reason: string }>;
  };
  fetchPage: (input: {
    kit: {
      id: string;
      source_issue_number: number;
    };
    page: number;
    perPage: number;
  }) => Promise<KitReaction[]>;
  now: string;
}): Promise<KitSupportSnapshot[]>;
