import type { CanonicalKit } from "./apply-submission.mjs";

export function applyKitWithdrawal(input: {
  kit: CanonicalKit;
  actorId: number;
  now: string;
}): CanonicalKit;
