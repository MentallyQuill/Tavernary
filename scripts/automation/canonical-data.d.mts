import type { GhRunner } from "../submissions/kit-submission-reconciliation.mjs";
import type { PreparedFile } from "./prepared-result.mjs";
export function commitCanonicalData(input: {
  gh: GhRunner;
  repository: string;
  expectedMainSha: string;
  files: PreparedFile[];
  message: string;
}): Promise<{ sha: string }>;
export function verifyCanonicalData(input: {
  gh: GhRunner;
  repository: string;
  sha: string;
  mainSha: string;
  files: PreparedFile[];
}): Promise<boolean>;
