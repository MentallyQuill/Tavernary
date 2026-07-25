const DAY_MS = 86_400_000;
const HALF_LIFE_DAYS = 30;

export function effectiveVoteAt(firstReactedAt, publishedAt) {
  return Date.parse(firstReactedAt) < Date.parse(publishedAt)
    ? publishedAt
    : firstReactedAt;
}

export function voteWeight(votedAt, now) {
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(votedAt)) / DAY_MS);
  return 2 ** (-ageDays / HALF_LIFE_DAYS);
}

export function trendingScore(votes, now) {
  return votes.reduce((sum, votedAt) => sum + voteWeight(votedAt, now), 0);
}
