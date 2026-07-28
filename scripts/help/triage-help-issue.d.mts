import type { PublicHelpManifest } from "../../src/features/help/help-manifest.mjs";

export const HELP_TRIAGE_MARKER: string;

export interface HelpTriageIssue {
  number: number;
  state: string;
  body?: string | null;
  labels: Array<string | { name: string }>;
}

export type HelpTriageDecision =
  | {
      valid: true;
      issueNumber: number;
      requestKind: PublicHelpManifest["request_kind"];
      labels: string[];
    }
  | {
      valid: false;
      issueNumber: number;
      errors: string[];
    };

export function processHelpIssueTriage(input: {
  event: {
    repository?: { full_name?: string };
    inputs?: { issue_number?: string | number };
    issue?: { number?: number };
  };
  request: (
    path: string,
    options?: { method?: string; body?: string },
  ) => Promise<any>;
}): Promise<HelpTriageDecision>;
