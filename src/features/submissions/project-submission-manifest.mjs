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

function normalizeOtherFrontends(values) {
  if (!Array.isArray(values)) return [];
  return values.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const name = nullableText(value.name);
    const url = nullableText(value.url);
    return name || url ? [{ name: name ?? "", url: url ?? "" }] : [];
  });
}

function githubRepositoryShape(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const parts = url.pathname
      .replace(/\/+$/u, "")
      .replace(/\.git$/iu, "")
      .split("/")
      .filter(Boolean);
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "github.com" &&
      parts.length === 2
    );
  } catch {
    return false;
  }
}

export function normalizeProjectSubmissionManifest(value) {
  const errors = [];
  const projectType = value?.project_type;
  const sourceUrl =
    typeof value?.source_url === "string" ? value.source_url.trim() : "";
  const name = nullableText(value?.name);
  const description = nullableText(value?.description);
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

  if (![1, 2].includes(value?.schema_version)) {
    errors.push("Submission manifest must use schema version 1 or 2.");
  }
  if (!["frontend", "extension", "preset"].includes(projectType)) {
    errors.push("Project type is invalid.");
  }
  if (!sourceUrl) errors.push("Project URL is required.");
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
  if (projectType === "preset" && value?.schema_version === 2) {
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
  if (projectType === "preset" && !githubRepositoryShape(sourceUrl) && !name) {
    errors.push("External System Presets require a project name.");
  }
  if (
    projectType === "preset" &&
    !githubRepositoryShape(sourceUrl) &&
    !description
  ) {
    errors.push("External System Presets require a short description.");
  }

  if (errors.length > 0) {
    return { valid: false, errors: [...new Set(errors)] };
  }
  return {
    valid: true,
    manifest: {
      schema_version: value.schema_version,
      project_type: projectType,
      source_url: sourceUrl,
      name,
      description,
      frontends: { known_ids: knownIds, other },
      frontend_independent: frontendIndependent,
      additional_context: nullableText(value?.additional_context),
      ...(projectType === "preset" && value.schema_version === 2
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
