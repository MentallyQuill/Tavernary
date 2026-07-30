import { classificationError } from "../catalog/primary-function-contract.mjs";

function nullableText(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function uniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [
    ...new Set(
      values
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

function hasExactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const expected = [...keys].sort();
  return Object.keys(value).sort().join("\u0000") === expected.join("\u0000");
}

function legacyV3Manifest(value) {
  const description = nullableText(value?.description);
  return {
    schema_version: 4,
    project_type: value?.project_type,
    primary_function: value?.primary_function,
    source_url: value?.source_url,
    frontends: value?.frontends,
    frontend_independent: value?.frontend_independent,
    additional_context: value?.additional_context,
    metadata: {
      summary: description
        ? { mode: "manual", value: description }
        : { mode: "automatic" },
      tags: { mode: "automatic" },
    },
    ...(value?.project_type === "preset" && value?.preset_compatibility
      ? { preset_compatibility: value.preset_compatibility }
      : {}),
  };
}

function normalizeSummaryRequest(value, errors) {
  if (value?.note !== undefined) {
    errors.push("Submission metadata cannot include provenance notes.");
  }
  if (value?.mode === "automatic") {
    if (!hasExactKeys(value, ["mode"])) {
      errors.push("Automatic summary metadata cannot include a value.");
    }
    return { mode: "automatic" };
  }
  if (value?.mode === "manual") {
    if (!hasExactKeys(value, ["mode", "value"])) {
      errors.push("Manual summary metadata requires only mode and value.");
    }
    const summary = nullableText(value?.value);
    if (!summary) {
      errors.push("Manual Short Description is required.");
      return { mode: "manual", value: "" };
    }
    if (summary.length > 220) {
      errors.push("Short Description must be 220 characters or fewer.");
    }
    return { mode: "manual", value: summary };
  }
  errors.push("Description choice must be automatic or manual.");
  return { mode: "automatic" };
}

function normalizeTagRequest(value, projectType, tagVocabulary, errors) {
  if (value?.note !== undefined) {
    errors.push("Submission metadata cannot include provenance notes.");
  }
  if (value?.mode === "automatic") {
    if (!hasExactKeys(value, ["mode"])) {
      errors.push("Automatic tag metadata cannot include values.");
    }
    return { mode: "automatic" };
  }
  if (value?.mode === "manual") {
    if (!hasExactKeys(value, ["mode", "values"])) {
      errors.push("Manual tag metadata requires only mode and values.");
    }
    const tags = uniqueStrings(value?.values);
    if (!Array.isArray(value?.values)) {
      errors.push("Manual submission tags must be an array.");
    }
    if (tags.length > 6) {
      errors.push("Submission tags must contain no more than six values.");
    }
    const definitions = new Map(
      (tagVocabulary?.tags ?? []).map((tag) => [tag.id, tag]),
    );
    for (const tag of tags) {
      const definition = definitions.get(tag);
      if (
        !definition ||
        !Array.isArray(definition.applicable_kinds) ||
        !definition.applicable_kinds.includes(projectType)
      ) {
        errors.push(`Unknown or inapplicable submission tag: ${tag}.`);
      }
    }
    return { mode: "manual", values: tags };
  }
  errors.push("Tag choice must be automatic or manual.");
  return { mode: "automatic" };
}

function normalizeMetadata(value, projectType, options, errors) {
  if (!hasExactKeys(value, ["summary", "tags"])) {
    errors.push("Submission metadata must contain only summary and tags.");
  }
  return {
    summary: normalizeSummaryRequest(value?.summary, errors),
    tags: normalizeTagRequest(
      value?.tags,
      projectType,
      options?.tagVocabulary,
      errors,
    ),
  };
}

function normalizeOtherFrontends(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const name = nullableText(value.name);
    const url = nullableText(value.url);
    return name || url ? [{ name: name ?? "", url: url ?? "" }] : [];
  });
}

function repositoryProviderFromUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname
      .replace(/\/+$/u, "")
      .replace(/\.git$/iu, "")
      .split("/")
      .filter(Boolean);
    if (
      url.protocol === "https:" &&
      ["github.com", "codeberg.org"].includes(url.hostname.toLowerCase()) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      parts.length === 2
    ) {
      return url.hostname.toLowerCase() === "github.com"
        ? "github"
        : "codeberg";
    }
    return null;
  } catch {
    return null;
  }
}

export function normalizeProjectSubmissionManifest(value, options = {}) {
  if ([1, 2].includes(value?.schema_version)) {
    return {
      valid: false,
      errors: ["Project submission must be updated with a primary function."],
    };
  }
  if (value?.schema_version === 3) {
    if (!options.allowLegacyV3) {
      return {
        valid: false,
        errors: [
          "Submission manifest version 3 is retired. Regenerate the request with Tavernary's current project form.",
        ],
      };
    }
    return normalizeProjectSubmissionManifest(legacyV3Manifest(value), {
      ...options,
      allowLegacyV3: false,
    });
  }

  const errors = [];
  const projectType = value?.project_type;
  const primaryFunction =
    typeof value?.primary_function === "string"
      ? value.primary_function.trim()
      : "";
  const sourceUrl =
    typeof value?.source_url === "string" ? value.source_url.trim() : "";
  const knownIds = uniqueStrings(value?.frontends?.known_ids);
  const other = normalizeOtherFrontends(value?.frontends?.other);
  const frontendIndependent = value?.frontend_independent === true;
  const compatibility = value?.preset_compatibility;
  const modelFamilies = uniqueStrings(compatibility?.model_families?.known_ids);
  const otherModelFamilies = uniqueStrings(
    compatibility?.model_families?.other,
  ).filter(
    (entry, index, entries) =>
      entries.findIndex(
        (candidate) =>
          candidate.toLocaleLowerCase() === entry.toLocaleLowerCase(),
      ) === index,
  );
  const completionFormats = uniqueStrings(compatibility?.completion_formats);
  const validModelFamilies = new Set([
    "model-agnostic",
    "claude",
    "gpt",
    "gemini",
    "gemma",
    "deepseek",
    "glm",
    "minimax",
    "mimo",
    "kimi",
    "qwen",
    "llama",
    "mistral",
  ]);
  const validCompletionFormats = new Set([
    "chat-completion",
    "text-completion",
  ]);

  const allowedKeys = [
    "schema_version",
    "project_type",
    "primary_function",
    "source_url",
    "frontends",
    "frontend_independent",
    "additional_context",
    "metadata",
    ...(projectType === "preset" ? ["preset_compatibility"] : []),
  ];
  if (!hasExactKeys(value, allowedKeys)) {
    errors.push("Submission manifest contains unsupported or missing fields.");
  }
  if (value?.schema_version !== 4) {
    errors.push("Submission manifest must use schema version 4.");
  }
  if (!["frontend", "extension", "preset"].includes(projectType)) {
    errors.push("Project type is invalid.");
  } else {
    const classification = classificationError(projectType, primaryFunction);
    if (classification) errors.push(classification);
  }
  if (!sourceUrl) errors.push("Project URL is required.");
  const metadata = normalizeMetadata(
    value?.metadata,
    projectType,
    options,
    errors,
  );
  if (projectType === "frontend" && (knownIds.length || other.length)) {
    errors.push("Frontend submissions cannot declare supported frontends.");
  }
  if (projectType === "extension" && frontendIndependent) {
    errors.push("Extensions cannot be marked frontend-independent.");
  }
  if (
    projectType === "extension" &&
    knownIds.length === 0 &&
    other.length === 0
  ) {
    errors.push("Extensions require at least one supported frontend.");
  }
  if (projectType === "preset") {
    if (modelFamilies.length === 0 && otherModelFamilies.length === 0) {
      errors.push(
        "System Presets require at least one supported model family.",
      );
    }
    if (completionFormats.length === 0) {
      errors.push("System Presets require at least one completion format.");
    }
    if (otherModelFamilies.some((family) => family.length > 60)) {
      errors.push("Unlisted model families must be 60 characters or fewer.");
    }
    for (const family of modelFamilies) {
      if (!validModelFamilies.has(family)) {
        errors.push(`Unknown model family: ${family}.`);
      }
    }
    for (const format of completionFormats) {
      if (!validCompletionFormats.has(format)) {
        errors.push(`Unknown completion format: ${format}.`);
      }
    }
  }
  if (
    (projectType === "frontend" || projectType === "extension") &&
    !repositoryProviderFromUrl(sourceUrl)
  ) {
    errors.push(
      "Frontends and Extensions require a public GitHub or Codeberg repository.",
    );
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }
  return {
    valid: true,
    manifest: {
      schema_version: value.schema_version,
      project_type: projectType,
      primary_function: primaryFunction,
      source_url: sourceUrl,
      frontends: { known_ids: knownIds, other },
      frontend_independent: frontendIndependent,
      additional_context: nullableText(value?.additional_context),
      metadata,
      ...(projectType === "preset"
        ? {
            preset_compatibility: {
              model_families: {
                known_ids: modelFamilies,
                other: otherModelFamilies,
              },
              completion_formats: completionFormats,
            },
          }
        : {}),
    },
  };
}

export function serializeProjectSubmissionManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}
