import {
  serializeProjectSubmissionManifest,
  type ProjectSubmissionManifest,
} from "./project-submission-manifest.mjs";
import {
  copyGitHubReviewUrl,
  openGitHubReview,
  type GitHubHandoffInput,
  type GitHubHandoffResult,
} from "./github-handoff";

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
    ["frontend-independent", manifest.frontend_independent ? "Yes" : "No"],
    [
      "description-choice",
      manifest.metadata.summary.mode === "manual"
        ? "Write the description myself"
        : "Let TavernAI write the description",
    ],
    [
      "tag-choice",
      manifest.metadata.tags.mode === "manual"
        ? "Set tags myself"
        : "Let Tavernary select tags",
    ],
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
    [
      "project-description",
      manifest.metadata.summary.mode === "manual"
        ? manifest.metadata.summary.value
        : "",
    ],
    [
      "tags",
      manifest.metadata.tags.mode === "manual"
        ? manifest.metadata.tags.values.join("\n")
        : "",
    ],
    ["additional-context", manifest.additional_context ?? ""],
  );
  return prefills;
}

function projectHandoffInput(
  formUrl: string | URL,
  manifest: ProjectSubmissionManifest,
): GitHubHandoffInput {
  return {
    formUrl,
    template: "01-project-submission.yml",
    manifestFieldId: "project-manifest",
    serializedManifest: serializeProjectSubmissionManifest(manifest),
    prefills: readablePrefills(manifest),
    pasteInstruction,
    copyPrompt:
      "Copy this project manifest, then paste it into the GitHub review:",
  };
}

export function openProjectSubmission(
  formUrl: string | URL,
  manifest: ProjectSubmissionManifest,
): Promise<GitHubHandoffResult> {
  return openGitHubReview(projectHandoffInput(formUrl, manifest));
}

export function copyProjectSubmissionUrl(
  formUrl: string | URL,
  manifest: ProjectSubmissionManifest,
): Promise<GitHubHandoffResult> {
  return copyGitHubReviewUrl(projectHandoffInput(formUrl, manifest));
}
