import {
  serializeProjectSubmissionManifest,
  type ProjectSubmissionManifest,
} from "./project-submission-manifest.mjs";

const MAX_PREFILL_URL_LENGTH = 7_000;
const pasteInstruction = "Paste the project manifest copied by Tavernary here.";

function displayKind(kind: ProjectSubmissionManifest["project_type"]) {
  if (kind === "frontend") return "Frontend";
  if (kind === "extension") return "Extension";
  return "System Preset";
}

function readableFrontendSelection(
  manifest: ProjectSubmissionManifest,
): string {
  return [
    ...manifest.frontends.known_ids,
    ...manifest.frontends.other.map(({ name, url }) =>
      [name, url].filter(Boolean).join(" — "),
    ),
  ].join("\n");
}

export async function openProjectSubmission(
  formUrl: string | URL,
  manifest: ProjectSubmissionManifest,
): Promise<"prefilled" | "clipboard"> {
  const target = new URL(formUrl.toString());
  const serializedManifest = serializeProjectSubmissionManifest(manifest);

  target.searchParams.set("template", "01-project-submission.yml");
  target.searchParams.set("project-type", displayKind(manifest.project_type));
  target.searchParams.set("project-url", manifest.source_url);
  target.searchParams.set("project-name", manifest.name ?? "");
  target.searchParams.set("project-description", manifest.description ?? "");
  target.searchParams.set(
    "supported-frontends",
    readableFrontendSelection(manifest),
  );
  target.searchParams.set(
    "frontend-independent",
    manifest.frontend_independent ? "Yes" : "No",
  );
  target.searchParams.set(
    "additional-context",
    manifest.additional_context ?? "",
  );
  target.searchParams.set("project-manifest", serializedManifest);

  if (target.toString().length <= MAX_PREFILL_URL_LENGTH) {
    window.open(target, "_blank", "noopener,noreferrer");
    return "prefilled";
  }

  try {
    await navigator.clipboard.writeText(serializedManifest);
  } catch {
    window.prompt(
      "Copy this project manifest, then paste it into the GitHub form:",
      serializedManifest,
    );
  }
  target.searchParams.set("project-manifest", pasteInstruction);
  window.open(target, "_blank", "noopener,noreferrer");
  return "clipboard";
}
