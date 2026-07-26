export function selectRandomCanaryIds(
  records: Array<{
    id: string;
    visibility?: string;
    metadata_status?: string;
    summary?: string;
    refresh_policy?: string;
    enrichment_policy?: "automatic" | "manual";
    enrichment_note?: string;
    source?: { type?: string };
  }>,
  options?: {
    count?: number;
    randomInt?: (maximum: number) => number;
    selectionMode?: "pending" | "all-automatic";
  },
): string[];

export function selectRepresentativeCanaryIds(
  records: Array<{
    id: string;
    kind?: string;
    visibility?: string;
    metadata_status?: string;
    summary?: string;
    refresh_policy?: string;
    enrichment_policy?: "automatic" | "manual";
    enrichment_note?: string;
    source?: { type?: string };
  }>,
  snapshots:
    | Record<
        string,
        {
          project_id?: string;
          source_health?: string;
          stale_since?: string | null;
          repository?: { description?: string | null };
        }
      >
    | Array<{
        project_id: string;
        source_health?: string;
        stale_since?: string | null;
        repository?: { description?: string | null };
      }>,
  options?: {
    count?: number;
    selectionMode?: "pending" | "all-automatic";
  },
): string[];
