import {
  openGitHubReview,
  type GitHubHandoffResult,
} from "@/features/submissions/github-handoff";

import { serializeHelpManifest } from "./help-manifest.mjs";

export interface HelpHandoffInput {
  formUrl: string | URL;
  template: string;
  manifest: object;
  manifestFieldId: "help-manifest" | "owner-request-manifest";
  prefills: Array<readonly [fieldId: string, value: string]>;
  pasteInstruction: string;
}

export { GitHubHandoffError as HelpHandoffError } from "@/features/submissions/github-handoff";

export async function openHelpRequest(
  input: HelpHandoffInput,
): Promise<GitHubHandoffResult> {
  return openGitHubReview({
    formUrl: input.formUrl,
    template: input.template,
    manifestFieldId: input.manifestFieldId,
    serializedManifest: serializeHelpManifest(input.manifest),
    prefills: input.prefills,
    pasteInstruction: input.pasteInstruction,
    copyPrompt: input.pasteInstruction,
  });
}
