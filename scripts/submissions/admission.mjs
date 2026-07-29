import {
  isRepositoryIdentity,
  sourceDuplicateKeys,
} from "./source-identity.mjs";

export const submissionQueueLabels = [
  "needs-maintainer-review",
  "needs-information",
  "duplicate-candidate",
  "submission-retryable",
  "submission-pr-open",
  "submission-declined",
  "waiting-on-fork-parent",
];

function findDuplicate(identity, existingSources) {
  const submittedKeys = new Set(sourceDuplicateKeys(identity));
  return existingSources.find((source) =>
    sourceDuplicateKeys(source.identity).some((key) => submittedKeys.has(key)),
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
      frontendDependencies: [],
    };
  }

  const existingSource = findDuplicate(input.identity, input.existingSources);
  if (existingSource) {
    return {
      status: "duplicate",
      identity: input.identity,
      existingSource: {
        id: existingSource.id,
        name: existingSource.name,
        canonicalUrl: existingSource.canonicalUrl,
        projectIds: [...(existingSource.projectIds ?? [])],
      },
    };
  }

  if (input.inflightDuplicate) {
    return {
      status: "inflight-duplicate",
      identity: input.identity,
      existingSubmission: input.inflightDuplicate,
    };
  }

  if (input.errors?.length) {
    return {
      status: "needs-information",
      errors: input.errors,
      suggestions: input.suggestions ?? [],
      frontendDependencies: [],
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
      frontendDependencies: [],
    };
  }
  if (
    input.manifest.project_type === "extension" &&
    !isRepositoryIdentity(input.identity)
  ) {
    return {
      status: "needs-information",
      errors: ["Extensions require a public GitHub or Codeberg repository."],
      suggestions: [],
      frontendDependencies: [],
    };
  }
  if (
    input.manifest.project_type === "frontend" &&
    ![
      isRepositoryIdentity(input.identity),
      input.identity.kind === "external",
    ].some(Boolean)
  ) {
    return {
      status: "needs-information",
      errors: ["Frontends require a public source repository."],
      suggestions: [],
      frontendDependencies: [],
    };
  }
  if (
    isRepositoryIdentity(input.identity) &&
    input.repository?.visibility !== "public"
  ) {
    return {
      status: "needs-information",
      errors: ["Project repositories must be public and accessible."],
      suggestions: [],
      frontendDependencies: [],
    };
  }
  if (input.frontendResolution.status === "needs-information") {
    return {
      status: "needs-information",
      errors: input.frontendResolution.errors,
      suggestions: input.frontendResolution.suggestions,
      frontendDependencies: input.frontendResolution.dependencies ?? [],
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
  if (input.forkDependency?.status === "waiting") {
    return {
      status: "waiting-on-fork-parent",
      dependency: input.forkDependency.dependency,
    };
  }

  const warnings = [
    ...(input.warnings ?? []),
    ...input.frontendResolution.warnings,
    ...(input.repository?.archived ? ["Repository is archived."] : []),
    ...(input.forkDependency?.attention === "cycle"
      ? [
          "Fork ancestry contains a repeated repository ID and requires maintainer review.",
        ]
      : input.forkDependency?.attention === "depth-limit"
        ? [
            "Fork ancestry exceeds the 16-repository automation limit and requires maintainer review.",
          ]
        : []),
  ];
  return {
    status: "admitted",
    manifest: input.manifest,
    identity: input.identity,
    frontendIds: input.frontendResolution.ids,
    warnings: [...new Set(warnings)],
  };
}
