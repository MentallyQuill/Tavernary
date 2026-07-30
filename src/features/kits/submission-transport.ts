import type { KitDraft } from "@/features/kits/kit-types";
import {
  openGitHubReview,
  type GitHubHandoffResult,
} from "@/features/submissions/github-handoff";

const pasteInstruction = "Paste the Kit manifest copied by Tavernary here.";

export function serializeKitManifest(draft: KitDraft): string {
  return JSON.stringify(
    {
      operation: draft.operation,
      kit_id: draft.kitId,
      title: draft.title.trim(),
      description: draft.description.trim(),
      project_ids: draft.projectIds,
    },
    null,
    2,
  );
}

export async function openKitSubmission(
  formUrl: string | URL,
  draft: KitDraft,
): Promise<GitHubHandoffResult> {
  const title = draft.title.trim();
  const description = draft.description.trim();
  return openGitHubReview({
    formUrl,
    template: "05-kit-submission.yml",
    manifestFieldId: "manifest",
    serializedManifest: serializeKitManifest(draft),
    prefills: [
      ["title", `[Kit submission]: ${title}`],
      ["kit-title", title],
      ["kit-description", description],
    ],
    pasteInstruction,
    copyPrompt: "Copy this Kit manifest, then paste it into the GitHub review:",
  });
}
