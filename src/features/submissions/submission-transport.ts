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
  const prefills: Array<[string, string]> = [
    ["project-type", displayKind(manifest.project_type)],
    ["primary-function", manifest.primary_function],
    ["project-url", manifest.source_url],
    ["project-name", manifest.name ?? ""],
    ["frontend-independent", manifest.frontend_independent ? "Yes" : "No"],
  ];
  if (manifest.project_type === "preset") {
    const compatibility = manifest.preset_compatibility;
    prefills.push(
      [
        "supported-model-families",
        compatibility?.model_families.known_ids.join("\n") ?? "",
      ],
      ["other-model-family", compatibility?.model_families.other[0] ?? ""],
      [
        "completion-formats",
        compatibility?.completion_formats.join("\n") ?? "",
      ],
    );
  }
  prefills.push(
    ["supported-frontends", readableFrontendSelection(manifest)],
    ["project-description", manifest.description ?? ""],
    ["additional-context", manifest.additional_context ?? ""],
  );
  return prefills;
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
