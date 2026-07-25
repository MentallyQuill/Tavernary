import type { KitDraft } from "@/features/kits/kit-types";

const MAX_PREFILL_URL_LENGTH = 7_000;
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
): Promise<"prefilled" | "clipboard"> {
  const target = new URL(formUrl.toString());
  const title = draft.title.trim();
  const description = draft.description.trim();
  const manifest = serializeKitManifest(draft);
  target.searchParams.set("title", `[Kit submission]: ${title}`);
  target.searchParams.set("kit-title", title);
  target.searchParams.set("kit-description", description);
  target.searchParams.set("manifest", manifest);
  if (target.toString().length <= MAX_PREFILL_URL_LENGTH) {
    window.open(target, "_blank", "noopener,noreferrer");
    return "prefilled";
  }

  try {
    await navigator.clipboard.writeText(manifest);
  } catch {
    window.prompt(
      "Copy this Kit manifest, then paste it into the GitHub form:",
      manifest,
    );
  }
  target.searchParams.delete("manifest");
  target.searchParams.set("manifest", pasteInstruction);
  window.open(target, "_blank", "noopener,noreferrer");
  return "clipboard";
}
