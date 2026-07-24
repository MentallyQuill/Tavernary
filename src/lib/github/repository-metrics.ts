export interface CommunityInput {
  stargazersCount: number;
  forksCount: number;
  subscribersCount: number;
}

export function calculateCommunity(input: CommunityInput) {
  return {
    stargazers_count: input.stargazersCount,
    forks_count: input.forksCount,
    subscribers_count: input.subscribersCount,
    aggregate:
      input.stargazersCount + input.forksCount + input.subscribersCount,
  };
}
