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

function readablePrefills(
  manifest: ProjectSubmissionManifest,
): Array<[string, string]> {
  return [
    ["project-type", displayKind(manifest.project_type)],
    ["project-url", manifest.source_url],
    ["project-name", manifest.name ?? ""],
    ["project-description", manifest.description ?? ""],
    ["supported-frontends", readableFrontendSelection(manifest)],
    ["frontend-independent", manifest.frontend_independent ? "Yes" : "No"],
    ["additional-context", manifest.additional_context ?? ""],
  ];
}

export async function openProjectSubmission(
  formUrl: string | URL,
  manifest: ProjectSubmissionManifest,
): Promise<"prefilled" | "clipboard"> {
  const target = new URL(formUrl.toString());
  const serializedManifest = serializeProjectSubmissionManifest(manifest);

  target.searchParams.set("template", "01-project-submission.yml");
  for (const [key, value] of readablePrefills(manifest)) {
    target.searchParams.set(key, value);
  }
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
  const fallback = new URL(formUrl.toString());
  fallback.search = "";
  fallback.searchParams.set("template", "01-project-submission.yml");
  fallback.searchParams.set("project-manifest", pasteInstruction);
  for (const [key, value] of readablePrefills(manifest)) {
    fallback.searchParams.set(key, value);
    if (fallback.toString().length > MAX_PREFILL_URL_LENGTH) {
      fallback.searchParams.delete(key);
    }
  }
  if (fallback.toString().length > MAX_PREFILL_URL_LENGTH) {
    throw new Error("GitHub issue form URL exceeds the safe handoff limit.");
  }
  window.open(fallback, "_blank", "noopener,noreferrer");
  return "clipboard";
}
