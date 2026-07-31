export function retryDueProjectSubmissionEnrichment(input: {
  repository: string;
  ref?: string;
  now: string;
  request: (path: string, options?: Record<string, unknown>) => Promise<any>;
}): Promise<number[]>;
