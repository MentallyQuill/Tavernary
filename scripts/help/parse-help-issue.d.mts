import type { PublicHelpManifest } from "../../src/features/help/help-manifest.mjs";

export type HelpIssueParseResult =
  | {
      valid: true;
      source: "manifest" | "fallback";
      manifest: PublicHelpManifest;
    }
  | { valid: false; errors: string[] };

export const HELP_FALLBACK_HEADINGS: Readonly<
  Record<PublicHelpManifest["request_kind"], readonly string[]>
>;
export function parseIssueHeadings(body?: string): Map<string, string>;
export function parseHelpIssue(body: string): HelpIssueParseResult;
