export interface RetainedSiteBundle {
  id: number;
  sourceSha: string;
  buildId: string;
  confirmedAt: string;
  archiveDigest: string;
  runId: number;
}
export function planSiteBundleRetention(input: {
  bundles: RetainedSiteBundle[];
  nowMs: number;
  protectedBundleIds?: number[];
}): { keepIds: number[]; removeIds: number[] };
