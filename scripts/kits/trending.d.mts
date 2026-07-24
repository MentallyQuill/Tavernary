export function effectiveVoteAt(
  firstReactedAt: string,
  publishedAt: string,
): string;
export function voteWeight(votedAt: string, now: string): number;
export function trendingScore(votes: string[], now: string): number;
