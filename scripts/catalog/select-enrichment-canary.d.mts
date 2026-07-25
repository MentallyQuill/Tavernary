export function selectRandomCanaryIds(
  records: Array<{
    id: string;
    visibility?: string;
    metadata_status?: string;
    summary?: string;
    refresh_policy?: string;
    source?: { type?: string };
  }>,
  options?: {
    count?: number;
    randomInt?: (maximum: number) => number;
  },
): string[];
