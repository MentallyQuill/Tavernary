/** Maps co-committed publication/merged revisions to verified source ancestry in bounded Git batches. */
export function readDeploymentCoverage(input: {
  root: string;
  sourceShas: string[];
  candidates: string[];
}): string[];
