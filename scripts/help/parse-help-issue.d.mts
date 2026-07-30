import type { PublicHelpManifest } from "../../src/features/help/help-manifest.mjs";

export type HelpIssueParseResult =
  | {
      valid: true;
      source: "manifest";
      manifest: PublicHelpManifest;
    }
  | { valid: false; errors: string[] };

export function parseHelpIssue(body: string): HelpIssueParseResult;
