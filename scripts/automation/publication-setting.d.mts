import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
export function readProjectPublicationEnabled(input: {
  repository: string;
  gh: GhRunner;
  env?: Record<string, string | undefined>;
}): Promise<boolean>;
