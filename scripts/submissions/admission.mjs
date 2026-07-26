import { sourceDuplicateKeys } from "./source-identity.mjs";

export const submissionQueueLabels = [
  "needs-maintainer-review",
  "needs-information",
  "duplicate-candidate",
  "submission-retryable",
  "submission-pr-open",
  "submission-declined",
];

function findDuplicate(identity, existingProjects) {
  const submittedKeys = new Set(sourceDuplicateKeys(identity));
  return existingProjects.find((project) =>
    sourceDuplicateKeys(project.identity).some((key) => submittedKeys.has(key)),
  );
}

export function evaluateProjectSubmission(input) {
  if (!input.identity) {
    return {
      status: "needs-information",
      errors: input.errors ?? [
        "Project source identity could not be resolved.",
      ],
      suggestions: input.suggestions ?? [],
    };
  }

  const existingProject = findDuplicate(input.identity, input.existingProjects);
  if (existingProject) {
    return {
      status: "duplicate",
      identity: input.identity,
      existingProject: {
        id: existingProject.id,
        name: existingProject.name,
        canonicalUrl: existingProject.canonicalUrl,
      },
    };
  }

  if (input.errors?.length) {
    return {
      status: "needs-information",
      errors: input.errors,
      suggestions: input.suggestions ?? [],
    };
  }

  if (input.sourceProbe.status === "retryable") {
    return {
      status: "retryable",
      code: input.sourceProbe.code,
      message: input.sourceProbe.message,
    };
  }
  if (input.sourceProbe.status === "definitive") {
    return {
      status: "needs-information",
      errors: [input.sourceProbe.message],
      suggestions: [],
    };
  }
  if (
    ["frontend", "extension"].includes(input.manifest.project_type) &&
    input.identity.kind !== "github"
  ) {
    return {
      status: "needs-information",
      errors: ["Frontends and Extensions require a public GitHub repository."],
      suggestions: [],
    };
  }
  if (
    input.identity.kind === "github" &&
    input.repository?.visibility !== "public"
  ) {
    return {
      status: "needs-information",
      errors: ["GitHub project repositories must be public and accessible."],
      suggestions: [],
    };
  }
  if (input.frontendResolution.status === "needs-information") {
    return {
      status: "needs-information",
      errors: input.frontendResolution.errors,
      suggestions: input.frontendResolution.suggestions,
    };
  }
  if (
    input.manifest.project_type === "preset" &&
    !input.manifest.preset_compatibility
  ) {
    return {
      status: "needs-information",
      errors: [
        "System Presets require supported model families and completion formats.",
      ],
      suggestions: [],
    };
  }
  const unlistedModelFamilies =
    input.manifest.preset_compatibility?.model_families.other ?? [];
  if (unlistedModelFamilies.length > 0) {
    return {
      status: "needs-information",
      errors: unlistedModelFamilies.map(
        (family) =>
          `Unlisted model family "${family}" requires maintainer reconciliation before publication.`,
      ),
      suggestions: [],
    };
  }

  const warnings = [
    ...(input.warnings ?? []),
    ...input.frontendResolution.warnings,
    ...(input.repository?.archived ? ["GitHub repository is archived."] : []),
  ];
  return {
    status: "admitted",
    manifest: input.manifest,
    identity: input.identity,
    frontendIds: input.frontendResolution.ids,
    warnings: [...new Set(warnings)],
  };
}
