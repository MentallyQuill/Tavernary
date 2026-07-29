export function selectRandomCanaryIds(
  records: Array<{
    id: string;
    listing_status?: string;
    metadata_status?: string;
    summary?: string;
    refresh_policy?: string;
    enrichment_policy?: "automatic" | "manual";
    enrichment_note?: string;
    source_id: string;
  }>,
  sourcesById: Record<
    string,
    { type?: string; refresh_policy?: string; [key: string]: unknown }
  >,
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
    listing_status?: string;
    metadata_status?: string;
    summary?: string;
    refresh_policy?: string;
    enrichment_policy?: "automatic" | "manual";
    enrichment_note?: string;
    source_id: string;
  }>,
  sourcesById: Record<
    string,
    { type?: string; refresh_policy?: string; [key: string]: unknown }
  >,
  snapshots:
    | Record<
        string,
        {
          source_id?: string;
          source_health?: string;
          stale_since?: string | null;
          repository?: { description?: string | null };
        }
      >
    | Array<{
        source_id: string;
        source_health?: string;
        stale_since?: string | null;
        repository?: { description?: string | null };
      }>,
  options?: {
    count?: number;
    selectionMode?: "pending" | "all-automatic";
  },
): string[];
